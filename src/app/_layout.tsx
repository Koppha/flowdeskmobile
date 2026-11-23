import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from "react-native";
import { ShieldAlert } from "lucide-react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/context/auth-context";
import UnlockPanel from "@/components/UnlockPanel";
import PhonePrompt from "@/components/PhonePrompt";
import { useNotificationRouting } from "@/lib/notifications";
import { isCompromisedDevice } from "@/lib/device-integrity";
import { ThemeProvider as AppThemeProvider, layout, makeStyles, useTheme, type Colors } from "@/theme";

// Tablets rotate freely; phones stay portrait. Judged by the physical
// screen's short side, so it doesn't flip in split-screen or on rotation.
const { width: screenW, height: screenH } = Dimensions.get("screen");
if (Math.min(screenW, screenH) < layout.tabletMinWidth) {
  void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

function navigationTheme(colors: Colors, isDark: boolean): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.paper1,
      card: colors.surface,
      text: colors.ink,
      border: colors.border,
      notification: colors.bad
    }
  };
}

const AUTH_SCREENS = ["login", "unlock", "push-permission", "complete-profile"];

function RootNavigation() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { status, justLoggedIn, sessionLocked, profileComplete } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const top = segments[0] as string | undefined;
  const inApp = status === "signedIn" && !sessionLocked && top !== undefined && !AUTH_SCREENS.includes(top);
  useNotificationRouting(inApp);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "signedOut" && top !== "login") {
      router.replace("/login");
    } else if (status === "locked" && top !== "unlock") {
      router.replace("/unlock");
    } else if (status === "signedIn" && !profileComplete) {
      // First sign-in: nothing else until the profile is filled in (as on the web portal).
      if (top !== "complete-profile") router.replace("/complete-profile");
    } else if (status === "signedIn" && (top === "login" || top === "unlock" || top === "complete-profile" || top === undefined)) {
      router.replace(justLoggedIn ? "/push-permission" : "/(tabs)");
    }
  }, [status, justLoggedIn, profileComplete, top, router]);

  if (status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="unlock" />
        <Stack.Screen name="push-permission" />
        <Stack.Screen name="complete-profile" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="my-advances" options={{ headerShown: true, title: "My Advance Requests" }} />
        <Stack.Screen name="my-clearances" options={{ headerShown: true, title: "My Clearances" }} />
        <Stack.Screen name="new-advance" options={{ headerShown: true, title: "New Advance Request" }} />
        <Stack.Screen name="new-clearance" options={{ headerShown: true, title: "New Clearance" }} />
        <Stack.Screen name="item/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="advance/[id]" options={{ headerShown: true, title: "Advance" }} />
        <Stack.Screen name="sign" options={{ headerShown: true, title: "Sign a Document" }} />
        <Stack.Screen name="maintenance" options={{ headerShown: true, title: "Maintenance" }} />
        <Stack.Screen name="custom-processes" options={{ headerShown: true, title: "Custom Processes" }} />
        <Stack.Screen name="web" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="feedback" options={{ headerShown: true, title: "Leave feedback" }} />
        <Stack.Screen name="search" options={{ headerShown: true, title: "Search" }} />
        <Stack.Screen name="insights" options={{ headerShown: true, title: "Spending insights" }} />
        <Stack.Screen name="approve-sign-in" options={{ headerShown: true, title: "Approve sign-in" }} />
        <Stack.Screen name="two-step" options={{ headerShown: true, title: "Two-step sign-in" }} />
        <Stack.Screen name="assistant" options={{ headerShown: true, title: "AI Assistant" }} />
        <Stack.Screen name="my-team" options={{ headerShown: true, title: "My Team" }} />
        <Stack.Screen name="delegation" options={{ headerShown: true, title: "Delegation" }} />
        <Stack.Screen name="new-delegation" options={{ headerShown: true, title: "New Delegation" }} />
        <Stack.Screen name="confirmed" />
      </Stack>
      {/* Re-locked after time in the background: cover the current screen
          rather than navigating away, so whatever was open (e.g. a half-filled
          advance form) is still there after unlocking. */}
      {sessionLocked && (
        <View style={StyleSheet.absoluteFill}>
          <UnlockPanel />
        </View>
      )}
      {/* No phone number on the profile: ask for one at every login/unlock (as the web portal does). */}
      <PhonePrompt active={inApp && profileComplete} />

    </>
  );
}

// Rooted / jailbroken phones stop here, before sign-in loads a session or
// calls the API (lib/device-integrity.ts).
function DeviceGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [state, setState] = useState<"checking" | "ok" | "blocked">("checking");

  useEffect(() => {
    isCompromisedDevice().then((bad) => setState(bad ? "blocked" : "ok"));
  }, []);

  if (state === "checking") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (state === "blocked") {
    return (
      <View style={styles.blocked} accessibilityRole="alert">
        <ShieldAlert size={48} color={colors.bad} strokeWidth={1.6} />
        <Text style={styles.blockedTitle}>FlowDesk can&apos;t run on this phone</Text>
        <Text style={styles.blockedText}>
          This phone is rooted or jailbroken, so FlowDesk can&apos;t keep your account and approvals safe on it.
        </Text>
        <Text style={styles.blockedText}>Use FlowDesk on an unmodified phone, or on the web portal.</Text>
      </View>
    );
  }
  return <>{children}</>;
}

function ThemedApp() {
  const { colors, isDark } = useTheme();
  const navTheme = useMemo(() => navigationTheme(colors, isDark), [colors, isDark]);
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <DeviceGate>
        <AuthProvider>
          <RootNavigation />
        </AuthProvider>
      </DeviceGate>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <ThemedApp />
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

const useStyles = makeStyles((colors) => ({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  blocked: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32, backgroundColor: colors.surface },
  blockedTitle: { fontSize: 19, fontWeight: "700", color: colors.ink, textAlign: "center", marginTop: 8 },
  blockedText: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: "center" }
}));
