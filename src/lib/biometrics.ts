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

/** Shows the system prompt. Biometrics first, with the device PIN/passcode as fallback. */
export async function authenticate(promptMessage = "Unlock FlowDesk"): Promise<{ ok: boolean; error?: string }> {
  const method = await getUnlockMethod();
  if (method.kind === "none") return { ok: false, error: "Set up a screen lock on this phone to unlock FlowDesk." };
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    promptSubtitle: "Confirm it's you",
    cancelLabel: "Cancel",
    disableDeviceFallback: false
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
