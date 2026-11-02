import { useEffect, useMemo } from "react";
import { ActivityIndicator, Dimensions, StyleSheet, View } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/context/auth-context";
import UnlockPanel from "@/components/UnlockPanel";
import { useNotificationRouting } from "@/lib/notifications";
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

const AUTH_SCREENS = ["login", "unlock", "push-permission"];

function RootNavigation() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { status, justLoggedIn, sessionLocked } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const top = segments[0] as string | undefined;
  useNotificationRouting(status === "signedIn" && !sessionLocked && top !== undefined && !AUTH_SCREENS.includes(top));

  useEffect(() => {
    if (status === "loading") return;
    if (status === "signedOut" && top !== "login") {
      router.replace("/login");
    } else if (status === "locked" && top !== "unlock") {
      router.replace("/unlock");
    } else if (status === "signedIn" && (top === "login" || top === "unlock" || top === undefined)) {
      router.replace(justLoggedIn ? "/push-permission" : "/(tabs)");
    }
  }, [status, justLoggedIn, top, router]);

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
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="my-advances" options={{ headerShown: true, title: "My Advance Requests" }} />
        <Stack.Screen name="my-clearances" options={{ headerShown: true, title: "My Clearances" }} />
        <Stack.Screen name="new-advance" options={{ headerShown: true, title: "New Advance Request" }} />
        <Stack.Screen name="new-clearance" options={{ headerShown: true, title: "New Clearance" }} />
        <Stack.Screen name="item/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="advance/[id]" options={{ headerShown: true, title: "Advance" }} />
        <Stack.Screen name="sign" options={{ headerShown: true, title: "Sign a Document" }} />
        <Stack.Screen name="maintenance" options={{ headerShown: true, title: "Maintenance" }} />
        <Stack.Screen name="web" options={{ headerShown: true, title: "" }} />
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
    </>
  );
}

function ThemedApp() {
  const { colors, isDark } = useTheme();
  const navTheme = useMemo(() => navigationTheme(colors, isDark), [colors, isDark]);
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthProvider>
        <RootNavigation />
      </AuthProvider>
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }
}));
