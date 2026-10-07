import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api, setUnauthorizedHandler } from "@/lib/api";
import { clearToken, getToken, setToken as storeToken } from "@/lib/secure-storage";
import { decodeUserFromToken, type FlowDeskUser } from "@/lib/jwt";
import { authenticate, getUnlockMethod, isQuickUnlockEnabled } from "@/lib/biometrics";

// Matches the FlowDesk Mobile write-up's Auth model:
// - "loading": deciding which of the three states below applies, on cold start.
// - "signedOut": no token stored - show the full username/password Login screen.
// - "locked": a token is stored from a previous session - show the Unlock
//   screen (biometrics, or the device PIN/passcode) instead of asking for
//   credentials again.
// - "signedIn": unlocked (or freshly logged in) - the token is attached to
//   every API call automatically by lib/api.ts.
// Quick unlock (Profile > "Unlock with ...") can be switched off per device;
// then, and on phones with no screen lock at all, no session is remembered.
export type AuthStatus = "loading" | "signedOut" | "locked" | "signedIn";

// Back in the foreground after this long = lock again (over the current
// screen, so a half-filled form survives the unlock).
const AUTO_LOCK_MS = 5 * 60 * 1000;

type AuthContextValue = {
  status: AuthStatus;
  user: FlowDeskUser | null;
  // True only right after login() on this app instance - never after
  // unlock(). The root layout uses this to route a fresh login through
  // /push-permission once, while a returning unlock skips straight to the
  // app (permission was already asked the first time).
  justLoggedIn: boolean;
  // Signed in, but re-locked after time in the background: the root layout
  // shows the Unlock screen as an overlay instead of navigating away.
  sessionLocked: boolean;
  login: (email: string, password: string) => Promise<void>;
  unlock: () => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Whether a stored session may be kept behind biometrics/passcode on this device. */
async function canKeepSession() {
  return (await isQuickUnlockEnabled()) && (await getUnlockMethod()).kind !== "none";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<FlowDeskUser | null>(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const statusRef = useRef(status);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  function signOutLocally() {
    setUser(null);
    setJustLoggedIn(false);
    setSessionLocked(false);
    setStatus("signedOut");
  }

  // Session expired or revoked server-side: lib/api.ts has already cleared
  // the token, so drop straight back to the Login screen.
  useEffect(() => {
    setUnauthorizedHandler(signOutLocally);
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token && (await canKeepSession())) {
        setUser(decodeUserFromToken(token));
        setStatus("locked");
      } else {
        // No session, or nothing to protect a remembered one with.
        if (token) await clearToken();
        setStatus("signedOut");
      }
    })();
  }, []);

  // Auto-lock: re-check when the app returns from the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (next !== "active" || backgroundedAt.current === null) return;
      const away = Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (statusRef.current !== "signedIn" || away < AUTO_LOCK_MS) return;
      void canKeepSession().then(async (keep) => {
        if (keep) {
          setSessionLocked(true);
        } else {
          await clearToken();
          signOutLocally();
        }
      });
    });
    return () => sub.remove();
  }, []);

  async function login(email: string, password: string) {
    const { token } = await api.login(email, password);
    await storeToken(token);
    setUser(decodeUserFromToken(token));
    setJustLoggedIn(true);
    setSessionLocked(false);
    setStatus("signedIn");
  }

  async function unlock(): Promise<{ ok: boolean; error?: string }> {
    const result = await authenticate();
    if (result.ok) {
      setSessionLocked(false);
      setStatus("signedIn");
    }
    return result;
  }

  async function logout() {
    await clearToken();
    signOutLocally();
  }

  const value = useMemo(
    () => ({ status, user, justLoggedIn, sessionLocked, login, unlock, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, justLoggedIn, sessionLocked]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
