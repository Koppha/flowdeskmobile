import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

// How this phone can unlock FlowDesk. Biometrics when enrolled, otherwise the
// device PIN/pattern/password - a phone with no screen lock at all can't keep
// a session and always signs in with the FlowDesk password instead.
export type UnlockMethod = {
  kind: "face" | "fingerprint" | "iris" | "passcode" | "none";
  // User-facing name, e.g. "Face ID", "Fingerprint", "PIN".
  label: string;
};

export async function getUnlockMethod(): Promise<UnlockMethod> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return { kind: "none", label: "screen lock" };
  if (level === LocalAuthentication.SecurityLevel.SECRET) {
    return { kind: "passcode", label: Platform.OS === "ios" ? "passcode" : "PIN" };
  }
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const T = LocalAuthentication.AuthenticationType;
  if (types.includes(T.FACIAL_RECOGNITION)) return { kind: "face", label: Platform.OS === "ios" ? "Face ID" : "face unlock" };
  if (types.includes(T.FINGERPRINT)) return { kind: "fingerprint", label: Platform.OS === "ios" ? "Touch ID" : "fingerprint" };
  if (types.includes(T.IRIS)) return { kind: "iris", label: "iris" };
  return { kind: "passcode", label: Platform.OS === "ios" ? "passcode" : "PIN" };
}

// The device-PIN fallback opens a separate system screen, which briefly
// puts FlowDesk in the background - auto-lock must ignore that.
let promptOpenUntil = 0;
export const isAuthPromptActive = () => Date.now() < promptOpenUntil;

/** Shows the system prompt. Biometrics first, with the device PIN/passcode as fallback. */
export async function authenticate(promptMessage = "Unlock FlowDesk"): Promise<{ ok: boolean; error?: string }> {
  const method = await getUnlockMethod();
  if (method.kind === "none") return { ok: false, error: "Set up a screen lock on this phone to unlock FlowDesk." };
  promptOpenUntil = Number.MAX_SAFE_INTEGER;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    promptSubtitle: "Confirm it's you",
    cancelLabel: "Cancel",
    disableDeviceFallback: false
  }).finally(() => {
    // A little longer than the prompt, for the trailing "active" event.
    promptOpenUntil = Date.now() + 1500;
  });
  if (result.success) return { ok: true };
  if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") {
    return { ok: false };
  }
  return { ok: false, error: "Couldn't verify it's you." };
}

// Per-device preference, on by default. Off means: no remembered session -
// FlowDesk asks for the password every time it's opened or auto-locks.
const PREF_KEY = "flowdesk.biometricUnlock";

export async function isQuickUnlockEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PREF_KEY)) !== "0";
  } catch {
    return true;
  }
}

export async function setQuickUnlockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(PREF_KEY, enabled ? "1" : "0");
}

// How long FlowDesk may sit in the background before it locks again.
// -1 = never re-lock while the app stays in memory.
export const AUTO_LOCK_OPTIONS = [
  { value: "0", label: "Immediately", ms: 0 },
  { value: "60000", label: "After 1 minute", ms: 60_000 },
  { value: "300000", label: "After 5 minutes", ms: 300_000 },
  { value: "900000", label: "After 15 minutes", ms: 900_000 },
  { value: "-1", label: "Never", ms: -1 }
] as const;
const AUTO_LOCK_KEY = "flowdesk.autoLockMs";
export const DEFAULT_AUTO_LOCK_MS = 300_000;

export async function getAutoLockMs(): Promise<number> {
  try {
    const v = await SecureStore.getItemAsync(AUTO_LOCK_KEY);
    const n = v === null ? NaN : Number(v);
    return AUTO_LOCK_OPTIONS.some((o) => o.ms === n) ? n : DEFAULT_AUTO_LOCK_MS;
  } catch {
    return DEFAULT_AUTO_LOCK_MS;
  }
}

export async function setAutoLockMs(ms: number): Promise<void> {
  await SecureStore.setItemAsync(AUTO_LOCK_KEY, String(ms));
}

/** The device's unlock method for labels/icons; null until known. */
export function useUnlockMethod() {
  const [method, setMethod] = useState<UnlockMethod | null>(null);
  useEffect(() => {
    let cancelled = false;
    getUnlockMethod()
      .then((m) => !cancelled && setMethod(m))
      .catch(() => !cancelled && setMethod({ kind: "passcode", label: "PIN" }));
    return () => {
      cancelled = true;
    };
  }, []);
  return method;
}

export function capitalize(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}
