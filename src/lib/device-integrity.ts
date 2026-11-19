import * as Device from "expo-device";
import { clearToken } from "./secure-storage";

// FlowDesk doesn't run on rooted (Android) or jailbroken (iOS) phones: on
// those, other apps can read the signed-in session and approvals. Checked
// once at launch, before sign-in (see DeviceGate in app/_layout.tsx).
//
// Expo's check is a heuristic (su binary on Android, known jailbreak traces
// on iOS) - it stops ordinary rooted phones, not a determined attacker who
// hides root. If it can't tell (it throws on some phones without access to
// the system files it reads), the phone is allowed, so normal users are never
// locked out by an error.
export async function isCompromisedDevice(): Promise<boolean> {
  // Development builds run on emulators, which are usually rooted.
  if (__DEV__) return false;
  try {
    const rooted = await Device.isRootedExperimentalAsync();
    // A session saved on this phone before it was rooted must not stay usable.
    if (rooted) await clearToken().catch(() => {});
    return rooted;
  } catch {
    return false;
  }
}
