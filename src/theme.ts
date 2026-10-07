import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

// Appearance preference (Profile > Appearance), stored on the device. Read
// synchronously here, before any screen's StyleSheet is created, so the whole
// app is styled with one palette; a change applies the next time the app opens.
export type ThemePreference = "system" | "light" | "dark";
const THEME_KEY = "flowdesk.theme";

function readPreference(): ThemePreference {
  try {
    const v = SecureStore.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export const themePreference: ThemePreference = readPreference();
// Keep native UI (date pickers, alerts) in step with an explicit choice.
if (themePreference !== "system") Appearance.setColorScheme?.(themePreference);
export const isDark = (themePreference === "system" ? Appearance.getColorScheme() : themePreference) === "dark";

export function saveThemePreference(pref: ThemePreference) {
  SecureStore.setItem(THEME_KEY, pref);
}

// Same tokens as the FlowDesk web app's public-facing pages (signature
// verify, email-actions) and the design mockup this app was built from -
// keeps the mobile app visually consistent with the rest of FlowDesk.
const light = {
  ink: "#161b2e",
  muted: "#667085",
  paper1: "#eef1f7",
  paper2: "#e1e6f0",
  surface: "#ffffff",
  border: "#e3e7f0",
  // Econet blue, sampled from assets/econet-logo.png. `bad` stays red - it
  // marks errors and destructive actions, not branding.
  accent: "#283889",
  accentDark: "#1c2763",
  accentSoft: "#e9ebf6",
  good: "#0f9d58",
  goodSoft: "#e8f8ee",
  bad: "#dc2626",
  badSoft: "#fdecec",
  warn: "#b45309",
  warnSoft: "#fef3e2",
  info: "#0369a1",
  infoSoft: "#e0f2fe",
  purple: "#7c3aed",
  purpleSoft: "#ede9fe"
};

// Dark: the Econet blue is lifted so it reads on dark surfaces and still
// carries white button text; status colours are brightened the same way.
const dark: typeof light = {
  ink: "#e7eaf3",
  muted: "#9aa4b8",
  paper1: "#0e121c",
  paper2: "#1d2435",
  surface: "#161b28",
  border: "#283043",
  accent: "#5f72e4",
  accentDark: "#4052c2",
  accentSoft: "#232b4d",
  good: "#34c27a",
  goodSoft: "#163024",
  bad: "#f05252",
  badSoft: "#3a1c1f",
  warn: "#f0a443",
  warnSoft: "#3a2a15",
  info: "#4fb3e8",
  infoSoft: "#14303f",
  purple: "#a78bfa",
  purpleSoft: "#2a2244"
};

export const colors = isDark ? dark : light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const radii = { sm: 8, md: 10, lg: 14, xl: 16, pill: 999 };

export const fontSizes = { xs: 11, sm: 12.5, base: 14, md: 15, lg: 17, xl: 19, xxl: 22 };
