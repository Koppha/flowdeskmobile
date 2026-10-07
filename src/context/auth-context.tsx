import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { api, setUnauthorizedHandler } from "@/lib/api";
import { clearToken, getToken, setToken as storeToken } from "@/lib/secure-storage";
import { decodeUserFromToken, type FlowDeskUser } from "@/lib/jwt";

// Matches the FlowDesk Mobile write-up's Auth model:
// - "loading": deciding which of the three states below applies, on cold start.
// - "signedOut": no token stored - show the full username/password Login screen.
// - "locked": a token is stored from a previous session - show the Unlock
//   screen (biometric/passcode) instead of asking for credentials again.
// - "signedIn": unlocked (or freshly logged in) - the token is attached to
//   every API call automatically by lib/api.ts.
export type AuthStatus = "loading" | "signedOut" | "locked" | "signedIn";

type AuthContextValue = {
  status: AuthStatus;
  user: FlowDeskUser | null;
  // True only right after login() on this app instance - never after
  // unlock(). The root layout uses this to route a fresh login through
  // /push-permission once, while a returning unlock skips straight to the
  // app (permission was already asked the first time).
  justLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  unlock: () => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<FlowDeskUser | null>(null);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  // Session expired or revoked server-side: lib/api.ts has already cleared
  // the token, so drop straight back to the Login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setJustLoggedIn(false);
      setStatus("signedOut");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        setUser(decodeUserFromToken(token));
        setStatus("locked");
      } else {
        setStatus("signedOut");
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const { token } = await api.login(email, password);
    await storeToken(token);
    setUser(decodeUserFromToken(token));
    setJustLoggedIn(true);
    setStatus("signedIn");
  }

  async function unlock(): Promise<{ ok: boolean; error?: string }> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      // No biometrics/passcode set up on this device - fall back to a full
      // sign-in rather than silently unlocking.
      return { ok: false, error: "No biometrics or device passcode set up" };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock FlowDesk",
      disableDeviceFallback: false
    });
    if (result.success) {
      setStatus("signedIn");
      return { ok: true };
    }
    return { ok: false, error: "error" in result ? result.error : "Authentication failed" };
  }

  async function logout() {
    await clearToken();
    setUser(null);
    setJustLoggedIn(false);
    setStatus("signedOut");
  }

  const value = useMemo(
    () => ({ status, user, justLoggedIn, login, unlock, logout }),
    [status, user, justLoggedIn]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
