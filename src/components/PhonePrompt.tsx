import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, View } from "react-native";
import { MessageSquare, Smartphone } from "lucide-react-native";
import { api } from "@/lib/api";
import { Field, Input, PrimaryButton } from "@/components/form";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

// Asks everyone with no phone number on their profile to add one, so FlowDesk
// notifications can reach them by SMS (e.g. while Outlook is down) - the same
// prompt as the web portal, reported to the same admin "Phone number prompt"
// report. It shows at every login/unlock; "Later" hides it only until the
// next one. Once a number is saved it never shows again.

/** Lesotho mobile: 8 digits starting 5 or 6, optionally with 266 / +266 in front. */
export function lesothoMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("266")) d = d.slice(3);
  return /^[56]\d{7}$/.test(d) ? d : null;
}

export default function PhonePrompt({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each time the app is entered (login or unlock), check the profile again.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    api.me()
      .then((me) => {
        if (cancelled) return;
        if (me.phone && me.phone.trim()) return setVisible(false);
        setDone(false);
        setValue("");
        setError(null);
        setVisible(true);
        api.phonePromptEvent("SHOWN");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function save() {
    const n = lesothoMobile(value);
    if (!n) return setError("Enter your 8-digit mobile number, e.g. 6222 7247.");
    setSaving(true);
    setError(null);
    try {
      await api.updatePhone(n);
      api.phonePromptEvent("SAVED");
      setDone(true);
      setTimeout(() => setVisible(false), 2200);
    } catch (e: any) {
      setError(e?.message || "Couldn't save your number. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function later() {
    api.phonePromptEvent("LATER");
    setVisible(false);
  }

  return (
    // Hidden while locked/signed out; the next login or unlock decides again.
    <Modal visible={visible && active} transparent animationType="fade" onRequestClose={done ? () => setVisible(false) : later}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.head}>
            <View style={styles.icon}>
              {done ? <MessageSquare size={22} color={colors.accent} /> : <Smartphone size={22} color={colors.accent} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} accessibilityRole="header">{done ? "You're all set" : "Add your phone number"}</Text>
              <Text style={styles.sub}>
                {done
                  ? "FlowDesk notifications will now also reach you by SMS."
                  : "Outlook email is having an outage. Add your mobile number so FlowDesk can send you your approvals and updates by SMS."}
              </Text>
            </View>
          </View>
          {!done && (
            <>
              <Field label="Mobile number" error={error} hint="Only used for FlowDesk notifications and your team's contact list. You can change it under Profile.">
                <View style={styles.inputRow}>
                  <Text style={styles.prefix}>+266</Text>
                  <Input
                    value={value}
                    onChangeText={(t) => { setValue(t); setError(null); }}
                    onSubmitEditing={() => void save()}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    placeholder="6222 7247"
                    autoFocus
                    style={styles.input}
                  />
                </View>
              </Field>
              <View style={styles.buttons}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label="Later" variant="secondary" onPress={later} disabled={saving} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton label={saving ? "Saving…" : "Save my number"} onPress={() => void save()} disabled={saving || !value.trim()} />
                </View>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.md, width: "100%", maxWidth: 460, alignSelf: "center" },
  head: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  icon: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "700", color: colors.ink },
  sub: { fontSize: 13.5, color: colors.muted, marginTop: 4, lineHeight: 19 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  prefix: { fontSize: 15, fontWeight: "600", color: colors.muted },
  input: { flex: 1 },
  buttons: { flexDirection: "row", gap: spacing.sm }
}));
