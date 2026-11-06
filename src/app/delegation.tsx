import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, UserCheck } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, type Delegation } from "@/lib/api";
import { STATUS_LABEL, STATUS_TONE, delegationStatus, scopeLabel } from "@/lib/delegations";
import { formatDisplayDate } from "@/lib/request-forms";
import StatusPill from "@/components/StatusPill";
import { PrimaryButton } from "@/components/form";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// Delegating your own approvals while you're away - the same delegations as
// the portal's Manager Delegations (auth.routes.ts /delegations). Shown on
// Home when an admin switches "Delegation" on (portal > Mobile App >
// Modules), and only to people with approvals to delegate. Admins see
// everyone's delegations on the portal; here it's only your own.

function period(d: Delegation) {
  const from = d.from_date ? formatDisplayDate(d.from_date.slice(0, 10)) : null;
  const to = d.to_date ? formatDisplayDate(d.to_date.slice(0, 10)) : null;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}, until you end it`;
  if (to) return `Until ${to}`;
  return "Until you end it";
}

export default function DelegationScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { gutter } = useLayout();
  const { user } = useAuth();
  const [items, setItems] = useState<Delegation[] | null>(null);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await api.delegations();
      setItems(all.filter((d) => d.manager_id === user?.userId));
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your delegations.");
    }
    api
      .requestTypes()
      .then((rows) => setCustomNames(Object.fromEntries((rows || []).map((r) => [r.code, r.name]))))
      .catch(() => {});
  }, [user?.userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function end(d: Delegation) {
    Alert.alert("End delegation?", `${d.delegate_name || "Your delegate"} will immediately stop approving on your behalf.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "End delegation",
        style: "destructive",
        onPress: async () => {
          setEnding(d.id);
          try {
            const updated = await api.endDelegation(d.id);
            setItems((list) => (list || []).map((x) => (x.id === d.id ? { ...x, ...updated } : x)));
          } catch (e: any) {
            Alert.alert("Couldn't end the delegation", e?.message || "Something went wrong.");
          } finally {
            setEnding(null);
          }
        }
      }
    ]);
  }

  if (!items) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.accent} size="large" />}
      </View>
    );
  }

  const current = items.filter((d) => ["ACTIVE", "UPCOMING", "EXPIRING"].includes(delegationStatus(d)));
  const past = items.filter((d) => !current.includes(d));

  const card = (d: Delegation) => {
    const status = delegationStatus(d);
    const live = d.active && status !== "EXPIRED";
    return (
      <View key={d.id} style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.avatar}>
            <UserCheck size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{d.delegate_name || "Delegate"}</Text>
            {d.delegate_title ? <Text style={styles.muted} numberOfLines={1}>{d.delegate_title}</Text> : null}
          </View>
          <StatusPill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
        </View>
        <Text style={styles.line}>{period(d)}</Text>
        <Text style={styles.muted}>{scopeLabel(d.request_types, customNames)}</Text>
        {d.reason ? <Text style={styles.muted}>Reason: {d.reason}</Text> : null}
        {d.reference ? <Text style={styles.ref}>{d.reference}</Text> : null}
        {live && (
          <TouchableOpacity style={styles.endBtn} onPress={() => end(d)} disabled={ending === d.id}>
            <Text style={styles.endText}>{ending === d.id ? "Ending…" : "End delegation"}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxContentWidth) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <Text style={styles.intro}>Away or on leave? Let a colleague approve on your behalf for a set period. You can end it at any time.</Text>
      <View style={{ marginBottom: spacing.lg }}>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push("/new-delegation")} accessibilityRole="button">
          <Plus size={18} color="#fff" />
          <Text style={styles.newText}>New delegation</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Current</Text>
      {current.length ? current.map(card) : <Text style={styles.empty}>You&apos;re not delegating your approvals to anyone.</Text>}

      {past.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Past</Text>
          {past.map(card)}
        </>
      )}
      {error ? <PrimaryButton label="Try again" variant="secondary" onPress={() => void load()} /> : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1, padding: spacing.xl },
  intro: { fontSize: 13.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.md },
  newBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 13 },
  newText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.sm },
  empty: { fontSize: 13.5, color: colors.muted, paddingVertical: spacing.md },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, gap: 4 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "600", color: colors.ink },
  line: { fontSize: 13.5, color: colors.ink, fontWeight: "600" },
  muted: { fontSize: 12.5, color: colors.muted, lineHeight: 17 },
  ref: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  endBtn: { alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.badSoft },
  endText: { color: colors.bad, fontWeight: "700", fontSize: 13 }
}));
