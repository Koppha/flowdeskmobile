import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Linking, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Mail, Phone, Search, UserCheck, Users } from "lucide-react-native";
import { api, type MyTeamResponse, type TeamMember } from "@/lib/api";
import { formatWhen } from "@/lib/request-forms";
import { Panes, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// Managers' view of their team - the same data as the web portal's My Team
// (GET /reporting-lines/my-team): who reports to them, what each has open,
// the manager's active delegation and the team's latest activity. Shown on
// Home only when an admin switches "My Team" on (portal > Mobile App >
// Modules), and only to MANAGER / HOD / EXCO / CEO / ADMIN.

function humanizeAction(action: string) {
  return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export default function MyTeamScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { gutter } = useLayout();
  const [data, setData] = useState<MyTeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.myTeam());
      setError(null);
    } catch (e: any) {
      setError(e?.status === 403 ? "My Team is only available to managers." : e?.message || "Couldn't load your team.");
    }
  }, []);

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

  const members = useMemo(() => {
    const all = data?.members || [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((m) => `${m.full_name || ""} ${m.email} ${m.title || ""} ${m.department || ""}`.toLowerCase().includes(term));
  }, [data, q]);

  if (!data) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.empty}>{error}</Text> : <ActivityIndicator color={colors.accent} size="large" />}
      </View>
    );
  }

  const all = data.members;
  const withOpen = all.filter((m) => Number(m.pending_requests) > 0).length;
  const openTotal = all.reduce((n, m) => n + Number(m.pending_requests || 0), 0);
  const delegation = data.active_delegation;

  const memberList = (
    <View>
      <View style={styles.searchBox}>
        <Search size={16} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search your team" placeholderTextColor={colors.muted} style={styles.searchInput} />
      </View>
      {members.length === 0 ? (
        <Text style={styles.empty}>{all.length === 0 ? "No one reports to you in FlowDesk yet. Reporting lines are set on the portal." : "No one matches that search."}</Text>
      ) : (
        members.map((m) => <MemberCard key={m.id} member={m} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />)
      )}
    </View>
  );

  const activity = (
    <View>
      <Text style={styles.sectionLabel}>Recent activity</Text>
      <View style={styles.card}>
        {data.recent_activity.length === 0 ? (
          <Text style={styles.muted}>Nothing recent from your team.</Text>
        ) : (
          data.recent_activity.map((a, i) => (
            <View key={a.id} style={[styles.activityRow, i > 0 && styles.divider]}>
              <Text style={styles.activityText}>
                <Text style={styles.bold}>{a.actor_name}</Text> · {humanizeAction(a.action)}
              </Text>
              <Text style={styles.muted}>{formatWhen(a.created_at)}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxWideWidth) }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Users size={16} color={colors.accent} />
          <Text style={styles.statValue}>{all.length}</Text>
          <Text style={styles.statLabel}>In your team</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.warn }]}>{openTotal}</Text>
          <Text style={styles.statLabel}>
            Open requests{withOpen ? ` · ${withOpen} ${withOpen === 1 ? "person" : "people"}` : ""}
          </Text>
        </View>
      </View>

      {delegation && (
        <View style={styles.delegation}>
          <UserCheck size={16} color={colors.info} />
          <Text style={styles.delegationText}>
            You&apos;re delegating approvals to <Text style={styles.bold}>{delegation.delegate_name || "someone"}</Text>
            {delegation.to_date ? ` until ${new Date(delegation.to_date).toLocaleDateString()}` : ""}.
          </Text>
        </View>
      )}

      <Panes left={memberList} right={activity} />
    </ScrollView>
  );
}

function MemberCard({ member: m, open, onToggle }: { member: TeamMember; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const name = m.full_name || m.email;
  const pending = Number(m.pending_requests || 0);
  return (
    <TouchableOpacity style={[styles.member, !m.is_active && { opacity: 0.55 }]} onPress={onToggle} activeOpacity={0.8}>
      <View style={styles.memberRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
          <Text style={styles.muted} numberOfLines={1}>
            {[m.title, m.department].filter(Boolean).join(" · ") || m.role}
            {!m.is_active ? " · Inactive" : ""}
          </Text>
        </View>
        {pending > 0 && (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{pending} open</Text>
          </View>
        )}
      </View>
      {open && (
        <View style={styles.details}>
          <Text style={styles.muted}>
            {Number(m.total_requests || 0)} advance/clearance request{Number(m.total_requests) === 1 ? "" : "s"} in total · last activity{" "}
            {m.last_activity ? formatWhen(m.last_activity) : "none"}
          </Text>
          <View style={styles.actions}>
            {m.phone ? (
              <TouchableOpacity style={styles.action} onPress={() => void Linking.openURL(`tel:${m.phone}`)}>
                <Phone size={15} color={colors.accent} />
                <Text style={styles.actionText}>Call</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.action} onPress={() => void Linking.openURL(`mailto:${m.email}`)}>
              <Mail size={15} color={colors.accent} />
              <Text style={styles.actionText}>Email</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1, padding: spacing.xl },
  empty: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20, paddingVertical: spacing.xl },
  stats: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, gap: 2 },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 11.5, color: colors.muted },
  delegation: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.infoSoft, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
  delegationText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14.5, color: colors.ink },
  member: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.accent, fontWeight: "700", fontSize: 13.5 },
  memberName: { fontSize: 14.5, fontWeight: "600", color: colors.ink },
  pill: { backgroundColor: colors.warnSoft, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { color: colors.warn, fontSize: 11.5, fontWeight: "700" },
  details: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.accentSoft },
  actionText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: spacing.md, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  activityRow: { paddingVertical: 8, gap: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  activityText: { fontSize: 13.5, color: colors.ink },
  bold: { fontWeight: "700" },
  muted: { fontSize: 12.5, color: colors.muted, lineHeight: 17 }
}));
