import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Share, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyRound, ShieldCheck } from "lucide-react-native";
import { api, type MfaStep } from "@/lib/api";
import { PrimaryButton } from "@/components/form";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

// Two-step sign-in (backend lib/mfa.ts): the step after the password, and
// setting up the authenticator app. On a phone the authenticator is usually
// on the same phone, so setup opens it with the otpauth:// link instead of a
// QR code to scan; the key can also be typed in by hand.

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const styles = useStyles();
  const text = codes.join("\n");
  return (
    <View style={styles.block}>
      <Text style={styles.heading}>Your recovery codes</Text>
      <Text style={styles.hint}>
        Keep these somewhere safe, not only on this phone. Each one works once, if you lose your phone. They won&apos;t be shown again.
      </Text>
      <Text style={styles.codes} selectable>
        {text}
      </Text>
      <PrimaryButton
        label="Save or send them"
        variant="secondary"
        onPress={() => void Share.share({ message: `FlowDesk recovery codes\n\n${text}`, title: "FlowDesk recovery codes" }).catch(() => {})}
      />
      <PrimaryButton label="I've saved them - continue" onPress={onDone} />
    </View>
  );
}

/** Set up the authenticator app. challenge = during sign-in (SETUP); without it, the signed-in user. */
export function MfaSetup({ challenge, onDone }: { challenge?: string; onDone: (r: { recoveryCodes: string[]; token?: string }) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ recoveryCodes: string[]; token?: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.mfaSetupStart(challenge).then(setSetup).catch((e) => setError(e?.message || "Couldn't start the setup"));
  }, [challenge]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.mfaSetupConfirm(code.trim(), challenge);
      setResult({ recoveryCodes: r.recoveryCodes, token: r.token });
    } catch (e: any) {
      setError(e?.message || "That code didn't match");
    } finally {
      setBusy(false);
    }
  }

  if (result) return <RecoveryCodes codes={result.recoveryCodes} onDone={() => onDone(result)} />;

  return (
    <View style={styles.block}>
      <Text style={styles.hint}>1. Install Microsoft Authenticator or Google Authenticator from the Play Store.</Text>
      <Text style={styles.hint}>2. Add FlowDesk to it:</Text>
      {setup ? (
        <>
          <PrimaryButton
            label="Open in authenticator app"
            variant="secondary"
            onPress={() =>
              void Linking.openURL(setup.otpauthUrl).catch(() =>
                setError("No authenticator app found. Install one, or add the key below by hand.")
              )
            }
          />
          <Text style={styles.hint}>Or add an account by hand with this key:</Text>
          <Text style={styles.secret} selectable>
            {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
          </Text>
        </>
      ) : (
        !error && <ActivityIndicator color={colors.accent} />
      )}
      <Text style={styles.hint}>3. Come back and type the 6-digit code it shows:</Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        placeholder="123456"
        placeholderTextColor={colors.muted}
        style={styles.codeInput}
        accessibilityLabel="6-digit code"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <PrimaryButton label={busy ? "Checking…" : "Turn on two-step sign-in"} onPress={confirm} disabled={busy || code.length !== 6 || !setup} />
    </View>
  );
}

/** The sign-in step after a correct password: a code, a recovery code, or setup. */
export function MfaSignIn({ step, onSignedIn, onCancel }: { step: MfaStep; onSignedIn: (token: string) => Promise<void>; onCancel: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.mfaVerify(step.challenge, code.trim());
      await onSignedIn(r.token);
    } catch (e: any) {
      setError(e?.message || "That code didn't work");
      setBusy(false);
    }
  }

  if (step.mfa === "setup") {
    return (
      <View style={styles.block}>
        <View style={styles.titleRow}>
          <ShieldCheck size={20} color={colors.accent} />
          <Text style={styles.heading}>Set up two-step sign-in</Text>
        </View>
        <Text style={styles.hint}>Your role needs a second step when signing in to FlowDesk. It takes a minute, once.</Text>
        <MfaSetup challenge={step.challenge} onDone={(r) => (r.token ? void onSignedIn(r.token) : onCancel())} />
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <Text style={styles.link}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <KeyRound size={20} color={colors.accent} />
        <Text style={styles.heading}>{recovery ? "Enter a recovery code" : "Enter the code from your authenticator app"}</Text>
      </View>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(recovery ? t.slice(0, 20) : t.replace(/\D/g, "").slice(0, 6))}
        keyboardType={recovery ? "default" : "number-pad"}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        placeholder={recovery ? "xxxxx-xxxxx" : "123456"}
        placeholderTextColor={colors.muted}
        style={styles.codeInput}
        autoFocus
        accessibilityLabel={recovery ? "Recovery code" : "6-digit code"}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <PrimaryButton
        label={busy ? "Checking…" : "Verify"}
        onPress={verify}
        disabled={busy || (recovery ? code.trim().length < 10 : code.length !== 6)}
      />
      <View style={styles.linkRow}>
        <TouchableOpacity onPress={() => { setRecovery((r) => !r); setCode(""); setError(null); }} hitSlop={8}>
          <Text style={styles.link}>{recovery ? "Use the authenticator app" : "Lost your phone? Use a recovery code"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  block: { gap: spacing.md, alignSelf: "stretch" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heading: { flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  hint: { fontSize: 13, lineHeight: 19, color: colors.muted },
  secret: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 1,
    color: colors.ink,
    textAlign: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface
  },
  codes: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 4,
    textAlign: "center",
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.ink
  },
  error: { color: colors.bad, fontSize: 13 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" },
  link: { color: colors.accent, fontSize: 13.5, fontWeight: "600" }
}));
