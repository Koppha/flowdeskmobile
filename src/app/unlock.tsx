import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Fingerprint } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { colors } from "@/theme";

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function UnlockScreen() {
  const { user, unlock, logout } = useAuth();
  const [status, setStatus] = useState<"idle" | "prompting" | "failed">("idle");

  async function attempt() {
    setStatus("prompting");
    const result = await unlock();
    if (!result.ok) setStatus("failed");
  }

  useEffect(() => {
    // Deferred a tick so setState from attempt() never runs synchronously
    // inside the effect body itself - auto-prompts once on arrival, matching
    // how a real biometric unlock screen greets you (see Unlock.dc.html).
    const timer = setTimeout(() => void attempt(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = user?.fullName?.split(" ")[0] || "there";

  return (
    <View style={styles.screen}>
      <Image source={require("../../assets/econet-logo.png")} style={styles.logo} resizeMode="contain" />

      <View style={styles.avatar}>
        <Text style={styles.avatarLabel}>{initials(user?.fullName || "")}</Text>
      </View>

      <Text style={styles.title}>Welcome back, {firstName}</Text>
      <Text style={styles.subtitle}>Unlock FlowDesk to continue</Text>

      <TouchableOpacity style={styles.unlockButton} onPress={attempt} accessibilityLabel="Unlock with Face ID">
        <Fingerprint size={34} color={colors.ink} strokeWidth={1.6} />
      </TouchableOpacity>
      <Text style={styles.status}>
        {status === "prompting" ? "Requesting Face ID…" : status === "failed" ? "Couldn't verify — tap to try again" : " "}
      </Text>

      <TouchableOpacity onPress={logout}>
        <Text style={styles.fallback}>Trouble unlocking? Sign in again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 32 },
  logo: { height: 34, width: 140, marginBottom: 28 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarLabel: { color: "#fff", fontSize: 21, fontWeight: "700" },
  title: { marginTop: 18, fontSize: 19, fontWeight: "700", color: colors.ink },
  subtitle: { marginTop: 4, marginBottom: 30, fontSize: 13, color: colors.muted },
  unlockButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.paper1,
    alignItems: "center",
    justifyContent: "center"
  },
  status: { marginTop: 14, fontSize: 12, color: colors.muted, minHeight: 16 },
  fallback: { marginTop: 40, fontSize: 13, color: colors.muted, textDecorationLine: "underline" }
});
