import { useEffect, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Fingerprint, KeyRound, ScanFace } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { useUnlockMethod } from "@/lib/biometrics";
import { makeStyles, radii, useTheme } from "@/theme";

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

// The Unlock screen's content - used by the /unlock route on a cold start and
// as a full-screen overlay when the app re-locks after time in the background.
export default function UnlockPanel() {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { user, unlock, logout } = useAuth();
  const method = useUnlockMethod();
  const [status, setStatus] = useState<"idle" | "prompting" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function attempt() {
    setStatus("prompting");
    setMessage(null);
    const result = await unlock();
    if (!result.ok) {
      setStatus("failed");
      setMessage(result.error ?? null);
    }
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
  const label = method?.label ?? "your phone's lock";
  const Icon = method?.kind === "face" ? ScanFace : method?.kind === "passcode" ? KeyRound : Fingerprint;

  return (
    <View style={styles.screen}>
      <View style={isDark ? styles.logoBackdrop : undefined}>
        <Image source={require("../../assets/econet-logo.png")} style={[styles.logo, isDark && styles.logoInBackdrop]} resizeMode="contain" />
      </View>

      <View style={styles.avatar}>
        <Text style={styles.avatarLabel}>{initials(user?.fullName || "")}</Text>
      </View>

      <Text style={styles.title}>Welcome back, {firstName}</Text>
      <Text style={styles.subtitle}>Unlock FlowDesk with your {label}</Text>

      <TouchableOpacity style={styles.unlockButton} onPress={attempt} accessibilityLabel={`Unlock with ${label}`}>
        <Icon size={34} color={colors.ink} strokeWidth={1.6} />
      </TouchableOpacity>
      <Text style={styles.status}>
        {status === "prompting" ? "Waiting for you to confirm…" : status === "failed" ? message || "Not unlocked - tap to try again" : " "}
      </Text>

      <TouchableOpacity onPress={logout}>
        <Text style={styles.fallback}>Sign in with your password instead</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 32 },
  logo: { height: 34, width: 140, marginBottom: 28 },
  logoInBackdrop: { marginBottom: 0 },
  logoBackdrop: { backgroundColor: "#ffffff", borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 22 },
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
  status: { marginTop: 14, fontSize: 12, color: colors.muted, minHeight: 16, textAlign: "center" },
  fallback: { marginTop: 40, fontSize: 13, color: colors.muted, textDecorationLine: "underline" }
}));
