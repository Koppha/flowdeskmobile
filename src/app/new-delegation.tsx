import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { CheckSquare, Square } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { DELEGATION_TYPES } from "@/lib/delegations";
import { todayIso } from "@/lib/request-forms";
import { DateInput, Field, Input, PrimaryButton, Section, Select, type SelectOption, useFormStyles } from "@/components/form";
import { useLayout } from "@/components/layout";
import { KeyboardAvoider, KeyboardScrollView } from "@/components/keyboard";
import { makeStyles, spacing, useTheme } from "@/theme";

// Same fields and endpoint as the portal's "Create Delegation" (POST
// /auth/delegations). The delegate list comes from /delegations/candidates,
// i.e. only people the server would accept (same department or section,
// same division for division heads, anyone for the CEO).

export default function NewDelegationScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const formStyles = useFormStyles();
  const router = useRouter();
  const { gutter } = useLayout();
  const { user } = useAuth();

  const [people, setPeople] = useState<SelectOption[] | null>(null);
  const [customTypes, setCustomTypes] = useState<{ code: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.delegationCandidates().then(
      (rows) =>
        setPeople(
          rows.map((p) => ({
            value: p.id,
            label: p.full_name || p.email,
            sub: [p.title, p.department, p.employee_no].filter(Boolean).join(" · ") || p.email
          }))
        ),
      (e: any) => setLoadError(e?.status === 403 ? "You have no approvals to delegate." : e?.message || "Couldn't load the people you can delegate to.")
    );
    api
      .requestTypes()
      // Only live processes - drafts can't be submitted, so there's nothing to approve.
      .then((rows) => setCustomTypes((rows || []).filter((r) => r.is_active !== false && r.status === "ACTIVE").map((r) => ({ code: r.code, name: r.name }))))
      .catch(() => {});
  }, []);

  const allCustom = types.includes("CUSTOM_WORKFLOW");
  const toggle = (value: string) =>
    setTypes((current) => {
      if (current.includes(value)) return current.filter((v) => v !== value);
      // "All custom processes" makes picking individual ones redundant.
      const next = value === "CUSTOM_WORKFLOW" ? current.filter((v) => !customTypes.some((c) => c.code === v)) : current;
      return [...next, value];
    });

  const delegateName = useMemo(() => people?.find((p) => p.value === delegateId)?.label, [people, delegateId]);

  async function save() {
    setError(null);
    if (!delegateId) return setError("Choose who will approve for you.");
    if (toDate && fromDate && toDate < fromDate) return setError("The end date must be on or after the start date.");
    setSaving(true);
    try {
      await api.createDelegation({
        // Admins create delegations for others on the portal; in the app it's always your own.
        ...(user?.role === "ADMIN" ? { manager_id: user.userId } : {}),
        delegate_id: delegateId,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        reason: reason.trim() || undefined,
        comments: comments.trim() || undefined,
        request_types: types.length ? types : undefined
      });
      Alert.alert("Delegation created", `${delegateName || "Your delegate"} can now approve on your behalf. You'll both get an email.`, [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (e: any) {
      setError(e?.message || "Couldn't create the delegation.");
    } finally {
      setSaving(false);
    }
  }

  if (!people) {
    return (
      <View style={formStyles.center}>
        {loadError ? <Text style={formStyles.notice}>{loadError}</Text> : <ActivityIndicator color={colors.accent} size="large" />}
      </View>
    );
  }

  const check = (value: string, label: string, disabled = false) => {
    const on = types.includes(value);
    return (
      <TouchableOpacity
        key={value}
        style={[styles.check, disabled && { opacity: 0.45 }]}
        onPress={() => toggle(value)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled }}
      >
        {on ? <CheckSquare size={20} color={colors.accent} /> : <Square size={20} color={colors.muted} />}
        <Text style={styles.checkLabel}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoider style={formStyles.flex}>
      <KeyboardScrollView style={formStyles.screen} contentContainerStyle={[formStyles.content, { paddingHorizontal: gutter() }]} keyboardShouldPersistTaps="handled">
        <Section title="Delegate">
          <Field label="Who will approve for you" hint="Only colleagues you're allowed to delegate to are listed.">
            <Select
              value={delegateId}
              options={people}
              onChange={setDelegateId}
              title="Delegate"
              placeholder="Choose a colleague"
              emptyText="There's no one in your department or section you can delegate to."
            />
          </Field>
        </Section>

        <Section title="When">
          <View style={formStyles.row}>
            <View style={formStyles.flex}>
              <Field label="From">
                <DateInput value={fromDate} onChange={setFromDate} minimumDate={todayIso()} />
              </Field>
            </View>
            <View style={formStyles.flex}>
              <Field label="To (optional)">
                <DateInput value={toDate} onChange={setToDate} minimumDate={fromDate || todayIso()} placeholder="Until I end it" />
              </Field>
            </View>
          </View>
          {toDate ? (
            <TouchableOpacity onPress={() => setToDate("")}>
              <Text style={formStyles.link}>No end date</Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        <Section title="What they can approve">
          <Text style={[formStyles.muted, { marginBottom: spacing.sm }]}>Leave everything unticked to delegate all your approvals.</Text>
          {DELEGATION_TYPES.map((t) => check(t.value, t.label))}
          {customTypes.length > 0 && (
            <View style={styles.sub}>
              <Text style={[formStyles.muted, { marginBottom: 4 }]}>Or only these custom processes:</Text>
              {customTypes.map((c) => check(c.code, c.name, allCustom))}
            </View>
          )}
        </Section>

        <Section title="Notes">
          <Field label="Reason (optional)">
            <Input value={reason} onChangeText={setReason} placeholder="e.g. Annual leave" maxLength={200} />
          </Field>
          <Field label="Comments (optional)">
            <Input value={comments} onChangeText={setComments} placeholder="A note for the audit trail" multiline maxLength={2000} />
          </Field>
        </Section>

        {error && <Text style={formStyles.error}>{error}</Text>}
        <PrimaryButton label={saving ? "Creating…" : "Create delegation"} onPress={() => void save()} disabled={saving} />
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

const useStyles = makeStyles((colors) => ({
  check: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9 },
  checkLabel: { flex: 1, fontSize: 14.5, color: colors.ink },
  sub: { marginTop: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.border }
}));
