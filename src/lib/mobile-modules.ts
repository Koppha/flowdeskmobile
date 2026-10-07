import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api, type ModuleKey } from "./api";

// Matches backend-v2's mobile-config.routes.ts DEFAULT_MODULES, used until
// GET /admin/mobile-config resolves (or if it fails). Keys the server
// doesn't send yet (createAdvance / createClearance, until the admin page
// gains those switches) also fall back to these - so creating stays OFF
// unless an admin explicitly turns it on.
export const DEFAULT_MODULES: Record<ModuleKey, boolean> = {
  advances: true,
  clearances: true,
  createAdvance: false,
  createClearance: false,
  overtime: false,
  standby: false,
  customProcesses: false,
  signADocument: false
};

// Dev builds only: start Metro with EXPO_PUBLIC_FORCE_CREATE=1 to try the
// create screens before the admin switches exist on the backend. Release
// builds ignore it - there, only the admin config can turn creating on.
const FORCE_CREATE = __DEV__ && process.env.EXPO_PUBLIC_FORCE_CREATE === "1";

export function mergeModules(fromServer?: Partial<Record<ModuleKey, boolean>>): Record<ModuleKey, boolean> {
  const merged = { ...DEFAULT_MODULES, ...(fromServer || {}) };
  return FORCE_CREATE ? { ...merged, createAdvance: true, createClearance: true } : merged;
}

/** The admin-controlled module switches, re-read whenever the screen regains focus. */
export function useMobileModules() {
  const [modules, setModules] = useState(DEFAULT_MODULES);
  const [loaded, setLoaded] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .mobileConfig()
        .then((res) => !cancelled && setModules(mergeModules(res?.modules)))
        .catch(() => {
          // Keep the defaults - a failed config fetch must never unlock creating.
        })
        .finally(() => !cancelled && setLoaded(true));
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return { modules, loaded };
}
