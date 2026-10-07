import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/context/auth-context";
import UnlockPanel from "@/components/UnlockPanel";
import { useNotificationRouting } from "@/lib/notifications";
import { colors } from "@/theme";

const AUTH_SCREENS = ["login", "unlock", "push-permission"];

function RootNavigation() {
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigation />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }
});
