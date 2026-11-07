import { useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAvoider, KeyboardScrollView } from "@/components/keyboard";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { useUnlockMethod } from "@/lib/biometrics";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    // Android is edge-to-edge, so adjustResize no longer shrinks the window — pad on both platforms.
    <KeyboardAvoider style={styles.screen}>
      <KeyboardScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.center}>
        <View style={isDark ? styles.logoBackdrop : undefined}>
        <Image source={require("../../assets/econet-logo.png")} style={[styles.logo, isDark && styles.logoInBackdrop]} resizeMode="contain" />
      </View>

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
          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, styles.passwordInput]}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
            />
            <TouchableOpacity
              style={styles.eye}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
            </TouchableOpacity>
          </View>
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
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 32 },
  center: { flex: 1, width: "100%", maxWidth: 420, alignSelf: "center", alignItems: "center", justifyContent: "center", paddingBottom: 24 },
  logo: { height: 40, width: 160, marginBottom: 22 },
  logoInBackdrop: { marginBottom: 0 },
  logoBackdrop: { backgroundColor: "#ffffff", borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 22 },
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
  passwordWrap: { width: "100%", justifyContent: "center" },
  passwordInput: { paddingRight: 48 },
  eye: { position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" },
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
}));
