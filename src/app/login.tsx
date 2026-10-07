import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/context/auth-context";
import { useUnlockMethod } from "@/lib/biometrics";
import { colors, radii, spacing } from "@/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const method = useUnlockMethod();

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError("Enter your username and password");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e?.message || "Sign in failed. Check your details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.center}>
        <Image source={require("../../assets/econet-logo.png")} style={styles.logo} resizeMode="contain" />

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue to FlowDesk</Text>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your username"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.buttonLabel}>{submitting ? "Signing in…" : "Sign In"}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          {method?.kind === "none"
            ? "Set up a screen lock on this phone and FlowDesk will unlock with it next time."
            : `First sign-in on this device. Next time, you'll unlock with your ${method?.label ?? "fingerprint or PIN"} instead.`}
        </Text>
      </View>

      <Text style={styles.disclaimer}>This is a secure system. Unauthorised access is prohibited.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { height: 40, width: 160, marginBottom: 22 },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 13.5, color: colors.muted, marginTop: 6, marginBottom: 28 },
  form: { width: "100%", gap: spacing.md },
  input: {
    width: "100%",
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 14.5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.paper1,
    color: colors.ink
  },
  error: { color: colors.bad, fontSize: 12.5, marginTop: spacing.md, textAlign: "center" },
  button: {
    width: "100%",
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: "center"
  },
  buttonDisabled: { opacity: 0.7 },
  buttonLabel: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  hint: { marginTop: 16, fontSize: 11.5, color: colors.muted, textAlign: "center" },
  disclaimer: { fontSize: 11, color: colors.muted, textAlign: "center", lineHeight: 16 }
});
