import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api, endSession, renewSession, setSessionRenewedHandler, setUnauthorizedHandler, type MfaStep } from "@/lib/api";
import { clearSession, getRefreshToken, getToken, setToken as storeToken } from "@/lib/secure-storage";
import { decodeUserFromToken, isTokenExpired, type FlowDeskUser } from "@/lib/jwt";
import { authenticate, getAutoLockMs, getUnlockMethod, isAuthPromptActive, isQuickUnlockEnabled } from "@/lib/biometrics";

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
  // False when the account has no profile yet (first sign-in): the root
  // layout then shows Complete your profile before anything else, as the web
  // portal does. Read from GET /auth/me at login/unlock.
  profileComplete: boolean;
  /** Complete your profile saved: switch to the new token (it carries the name and department). */
  profileSaved: (token: string) => Promise<void>;
  /** Signs in, or returns the two-step sign-in still to do (then finishLogin with its token). */
  login: (email: string, password: string) => Promise<MfaStep | null>;
  finishLogin: (token: string) => Promise<void>;
  unlock: () => Promise<{ ok: boolean; error?: string }>;
  /** Why the person was signed out (an ended session), for the Login screen; null after a normal log out. */
  signedOutReason: string | null;
  logout: () => Promise<void>;
};

// Sessions last 12 hours; the phone's refresh key renews them after an unlock
// (lib/api.ts renewSession). Only when the server refuses that - logged out
// elsewhere, signed out by an admin, unused for 30 days - is the password
// needed again.
const SESSION_ENDED = "Your session has ended. Sign in with your password to continue - next time you can unlock with your fingerprint again.";

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
  const [profileComplete, setProfileComplete] = useState(true);
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);
  const statusRef = useRef(status);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  function signOutLocally(reason: string | null = null) {
    setSignedOutReason(reason);
    setUser(null);
    setJustLoggedIn(false);
    setSessionLocked(false);
    setStatus("signedOut");
  }

  // Session expired or revoked server-side: lib/api.ts has already cleared
  // the token, so drop straight back to the Login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => signOutLocally(SESSION_ENDED));
    // A silent renewal (any screen) brings a new token: keep the name and role current.
    setSessionRenewedHandler((token) => setUser(decodeUserFromToken(token)));
    return () => {
      setUnauthorizedHandler(null);
      setSessionRenewedHandler(null);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const canRenew = Boolean(await getRefreshToken());
      if (token && isTokenExpired(token) && !canRenew) {
        // The session ran out while the app was closed and can't be renewed:
        // unlocking it would open an app that can't load anything.
        await clearSession();
        signOutLocally(SESSION_ENDED);
      } else if (token && (await canKeepSession())) {
        // Expired but renewable: unlock first, then it's renewed.
        setUser(decodeUserFromToken(token));
        setStatus("locked");
      } else {
        // No session, or nothing to protect a remembered one with.
        if (token) await clearSession();
        setStatus("signedOut");
      }
    })();
  }, []);

  // Auto-lock: re-check when the app returns from the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        // Our own unlock prompt (device PIN screen) doesn't count as leaving.
        backgroundedAt.current = isAuthPromptActive() ? null : Date.now();
        return;
      }
      if (next !== "active" || backgroundedAt.current === null) return;
      const away = Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (statusRef.current !== "signedIn") return;
      // Back in the foreground after the user's "Lock after" time = lock
      // again (over the current screen, so a half-filled form survives).
      void (async () => {
        const lockAfter = await getAutoLockMs();
        // "Immediately" still allows a 2 s grace (e.g. pulling down the notification shade).
        if (lockAfter < 0 || away < Math.max(lockAfter, 2000)) {
          // Back in without a re-lock still counts as using the app (Analytics).
          api.trackOpen();
          return;
        }
        const keep = await canKeepSession();
        if (keep) {
          setSessionLocked(true);
        } else {
          await endSession();
          signOutLocally();
        }
      })();
    });
    return () => sub.remove();
  }, []);

  // Checked before entering the app so a first sign-in goes straight to
  // Complete your profile. If the check itself fails (e.g. offline), the
  // person isn't blocked - the server still refuses requests from an
  // incomplete profile.
  // Also tells whether the server still accepts the session: "ended" means it
  // answered 401 (lib/api.ts has then already cleared it and signed out).
  async function checkProfile(): Promise<"ok" | "ended" | "unknown"> {
    try {
      const me = await api.me();
      setProfileComplete(Boolean(me.profile_completed));
      return "ok";
    } catch (e: any) {
      setProfileComplete(true);
      return e?.status === 401 ? "ended" : "unknown";
    }
  }

  async function login(email: string, password: string): Promise<MfaStep | null> {
    const r = await api.login(email, password);
    if (r.mfa) return r;
    await finishLogin(r.token);
    return null;
  }

  async function finishLogin(token: string) {
    await storeToken(token);
    setSignedOutReason(null);
    await checkProfile();
    setUser(decodeUserFromToken(token));
    setJustLoggedIn(true);
    setSessionLocked(false);
    setStatus("signedIn");
  }

  async function profileSaved(token: string) {
    await storeToken(token);
    setUser(decodeUserFromToken(token));
    setProfileComplete(true);
  }

  async function unlock(): Promise<{ ok: boolean; error?: string }> {
    const result = await authenticate();
    if (result.ok) {
      // Only a session the server still accepts gets the app (an ended one
      // used to be let in, and every screen loaded nothing). One that ran
      // out - the next morning, or from a notification - is renewed with
      // the refresh key now that the person has proved it's them.
      let token = await getToken();
      if (!token || isTokenExpired(token)) {
        const renewed = await renewSession();
        if (renewed === null && (await getRefreshToken())) {
          // Couldn't reach FlowDesk: stay on the unlock screen and say so.
          return { ok: false, error: "Couldn't reach FlowDesk to renew your session. Check your connection and try again." };
        }
        if (typeof renewed !== "string") {
          await clearSession();
          signOutLocally(SESSION_ENDED);
          return { ok: false };
        }
        token = renewed;
      }
      if ((await checkProfile()) === "ended") return { ok: false };
      setUser(decodeUserFromToken(token));
      setSessionLocked(false);
      setStatus("signedIn");
      // An unlock is a session that never hits /auth/login - report it so the
      // admin Analytics count people who use the app daily, not just sign-ins.
      api.trackOpen();
    }
    return result;
  }

  async function logout() {
    await endSession();
    signOutLocally();
  }

  const value = useMemo(
    () => ({ status, user, justLoggedIn, sessionLocked, profileComplete, profileSaved, login, finishLogin, unlock, logout, signedOutReason }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, justLoggedIn, sessionLocked, profileComplete, signedOutReason]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
