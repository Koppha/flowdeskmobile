import { useCallback, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { api, type MfaStatus } from "@/lib/api";
import { MfaSetup, RecoveryCodes } from "@/components/Mfa";
import { PrimaryButton } from "@/components/form";
import { KeyboardAvoider, KeyboardScrollView } from "@/components/keyboard";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// Profile > Two-step sign-in: turn it on, get new recovery codes, or turn it
// off (not when the portal's policy requires it for this person's role).
export default function TwoStepScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { gutter } = useLayout();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [mode, setMode] = useState<"idle" | "setup" | "codes" | "disable">("idle");
  const [code, setCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.mfaStatus().then(setStatus).catch((e) => setError(e?.message || "Couldn't load"));
  }, []);
  useFocusEffect(load);

  async function act() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "codes") setNewCodes((await api.mfaRecoveryCodes(code)).recoveryCodes);
      else {
        await api.mfaDisable(code);
        setMode("idle");
        load();
      }
      setCode("");
    } catch (e: any) {
      setError(e?.message || "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (!status) {
    body = error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />;
  } else if (newCodes) {
    body = <RecoveryCodes codes={newCodes} onDone={() => { setNewCodes(null); setMode("idle"); load(); }} />;
  } else if (mode === "setup") {
    body = (
      <>
        <MfaSetup onDone={() => { setMode("idle"); load(); }} />
        <PrimaryButton label="Cancel" variant="secondary" onPress={() => setMode("idle")} />
      </>
    );
  } else {
    body = (
      <>
        <View style={styles.card}>
          <View style={styles.row}>
            <ShieldCheck size={20} color={status.enabled ? colors.good : colors.muted} />
            <Text style={styles.state}>{status.enabled ? "On" : "Off"}</Text>
            {status.required && <Text style={styles.badge}>Required for your role</Text>}
          </View>
          <Text style={styles.hint}>
            When you sign in, FlowDesk also asks for a code from an authenticator app. Portal sign-ins can be approved right here on this phone
            instead. Someone with your password alone can&apos;t get in.
          </Text>
          {status.enabled && <Text style={styles.hint}>Recovery codes left: {status.recoveryCodesLeft}</Text>}
        </View>
        {!status.enabled && <PrimaryButton label="Set up two-step sign-in" onPress={() => setMode("setup")} />}
        {status.enabled && mode === "idle" && (
          <>
            <PrimaryButton label="New recovery codes" variant="secondary" onPress={() => setMode("codes")} />
            {!status.required && <PrimaryButton label="Turn off" variant="secondary" onPress={() => setMode("disable")} />}
          </>
        )}
        {(mode === "codes" || mode === "disable") && (
          <View style={styles.card}>
            <Text style={styles.hint}>Enter the current code from your authenticator app:</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.muted}
              style={styles.codeInput}
              autoFocus
            />
            <PrimaryButton label={busy ? "Checking…" : mode === "codes" ? "Make new codes" : "Turn off"} onPress={act} disabled={busy || code.length !== 6} />
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setMode("idle"); setCode(""); setError(null); }} />
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </>
    );
  }

  return (
    <KeyboardAvoider>
      <KeyboardScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxContentWidth) }]}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  state: { fontSize: 16, fontWeight: "700", color: colors.ink },
  badge: { fontSize: 12, fontWeight: "600", color: colors.accent },
  hint: { fontSize: 13, lineHeight: 19, color: colors.muted },
  codeInput: {
    fontSize: 22,
    letterSpacing: 4,
    textAlign: "center",
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.paper1,
    color: colors.ink
  },
  error: { color: colors.bad, fontSize: 13 }
}));
