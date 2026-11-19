import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import {
  BarChart3, Briefcase, Calendar, ChevronRight, Search, CheckCircle2, CircleHelp, ClipboardList, Clock3, FileSignature, GitBranch, LayoutGrid, Megaphone, MessageCircle,
  Radio, ShieldCheck, Sparkles, Truck, UserCheck, Users, Wrench, type LucideIcon
} from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, DELEGATING_ROLES, TEAM_ROLES, type InboxItem, type ModuleKey, type WebTile } from "@/lib/api";
import ModuleTile from "@/components/ModuleTile";
import UpdateBanner from "@/components/UpdateBanner";
import { DEFAULT_MODULES, isDocTypeEnabled, mergeModules } from "@/lib/mobile-modules";
import { fmtMoney } from "@/lib/request-forms";
import { Grid, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme, type Colors } from "@/theme";

// Icons a server-defined tile may use (by name) - anything else falls back to a grid.
const WEB_TILE_ICONS: Record<string, LucideIcon> = {
  wrench: Wrench, "file-signature": FileSignature, "clipboard-list": ClipboardList, "check-circle": CheckCircle2, clock: Clock3,
  radio: Radio, "git-branch": GitBranch, grid: LayoutGrid, briefcase: Briefcase, calendar: Calendar, truck: Truck, users: Users,
  "shield-check": ShieldCheck, megaphone: Megaphone, help: CircleHelp, "message-circle": MessageCircle
};
const TILE_COLORS: (keyof Colors)[] = ["accent", "good", "warn", "bad", "info", "purple"];

const MODULE_DEFS: {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  color: keyof Colors;
  bg: keyof Colors;
  route?: Href;
  /** Only these roles see the tile (in addition to the admin switch). */
  roles?: string[];
  /** Also shown, whatever the role, to anyone on a workflow step that allows delegation. */
  orDelegationEligible?: boolean;
}[] = [
  { key: "advances", label: "Advances", icon: ClipboardList, color: "accent", bg: "accentSoft", route: "/my-advances" },
  { key: "clearances", label: "Clearances", icon: CheckCircle2, color: "good", bg: "goodSoft", route: "/my-clearances" },
  // Server-built screens (mobile-web), opened by name like Profile's.
  { key: "overtime", label: "Overtime", icon: Clock3, color: "warn", bg: "warnSoft", route: { pathname: "/web", params: { go: "overtime" } } },
  { key: "standby", label: "Standby", icon: Radio, color: "info", bg: "infoSoft", route: { pathname: "/web", params: { go: "standby" } } },
  { key: "customProcesses", label: "Custom Processes", icon: GitBranch, color: "purple", bg: "purpleSoft", route: "/custom-processes" },
  { key: "signADocument", label: "Sign a Document", icon: FileSignature, color: "accent", bg: "accentSoft", route: "/sign" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "warn", bg: "warnSoft", route: "/maintenance" },
  { key: "myTeam", label: "My Team", icon: Users, color: "info", bg: "infoSoft", route: "/my-team", roles: TEAM_ROLES },
  { key: "delegation", label: "Delegation", icon: UserCheck, color: "purple", bg: "purpleSoft", route: "/delegation", roles: DELEGATING_ROLES, orDelegationEligible: true }
];

type WeekLine = { key: string; text: string; tone: "accent" | "warn" | "bad" | "muted"; go: () => void };

/** Whole days since an ISO date (0 for today or unknown). */
function daysSince(iso?: string | null) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : 0;
}

/** "Good morning" before noon, "Good afternoon" until 6pm, then "Good evening" - phone's local time. */
function greetingFor(date: Date) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [inProgressCount, setInProgressCount] = useState<number | null>(null);
  const [enabledModules, setEnabledModules] = useState<Record<ModuleKey, boolean>>(DEFAULT_MODULES);
  // Processes built on the server (screens of the server page) - new ones
  // appear here with no app release.
  const [webTiles, setWebTiles] = useState<WebTile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // The AI Assistant entry shows only while the portal has it set up, switched
  // on, and allowed for this person (Settings > AI Assistant, Roles & Permissions).
  const [assistantReady, setAssistantReady] = useState(false);
  // Delegation isn't only for managers: anyone assigned to a workflow step
  // that allows delegation may delegate it (same rule as the portal's menu).
  const [delegationEligible, setDelegationEligible] = useState(false);
  const role = user?.role || "";
  // "Your week": the few things worth doing now, built from what Home already loads.
  const [week, setWeek] = useState<WeekLine[]>([]);

  const load = useCallback(async () => {
    api.assistantStatus().then((s) => setAssistantReady(Boolean(s?.configured))).catch(() => setAssistantReady(false));
    if (!DELEGATING_ROLES.includes(role)) {
      api.delegationEligibility().then((r) => setDelegationEligible(Boolean(r?.eligible))).catch(() => setDelegationEligible(false));
    }
    try {
      const [inboxRes, advancesRes, configRes] = await Promise.all([api.inbox(), api.myAdvances(), api.mobileConfig()]);
      const items: InboxItem[] = inboxRes.items || [];
      const modules = mergeModules(configRes?.modules);
      // Same as the Inbox: my approval step, or a custom process waiting on my confirmation as an assignee.
      const mine = (i: InboxItem) => i.current_step_actionable_by_me || (i.doc_type === "CUSTOM_REQUEST" && Boolean(i.is_assignee_task));
      setPendingCount(items.filter((i) => mine(i) && isDocTypeEnabled(i.doc_type, modules)).length);
      const advances = Array.isArray(advancesRes) ? advancesRes : advancesRes.items || [];
      setInProgressCount(advances.filter((a: any) => !["DRAFT", "PAID", "CANCELLED", "REJECTED"].includes(a.status)).length);
      if (configRes?.modules) setEnabledModules(mergeModules(configRes.modules));

      const lines: WeekLine[] = [];
      const waiting = items.filter((i) => mine(i) && isDocTypeEnabled(i.doc_type, modules));
      if (waiting.length) {
        const oldest = Math.max(0, ...waiting.map((i) => daysSince(i.submitted_at || i.created_at)));
        lines.push({
          key: "approve",
          tone: oldest >= 3 ? "warn" : "accent",
          text: `${waiting.length} waiting on your approval${oldest >= 1 ? ` · oldest ${oldest} day${oldest === 1 ? "" : "s"}` : ""}`,
          go: () => router.push("/(tabs)/inbox")
        });
      }
      const drafts = advances.filter((a: any) => a.status === "DRAFT");
      if (drafts.length) {
        lines.push({
          key: "drafts",
          tone: "muted",
          text: `${drafts.length} advance draft${drafts.length === 1 ? "" : "s"} not sent yet`,
          go: () => router.push(drafts.length === 1 ? `/advance/${drafts[0].id}` : "/my-advances")
        });
      }
      // Clearances due: only for people the AI Assistant is open to (that's where the endpoint lives).
      const due = await api.assistantReminders().then((r) => r.clearances || []).catch(() => []);
      for (const c of due.filter((d) => d.overdue || d.days_left <= 7).slice(0, 2)) {
        lines.push({
          key: `clear-${c.advance_id}`,
          tone: c.overdue ? "bad" : "warn",
          text: `Clear ${c.reference} (${fmtMoney(Number(c.amount), c.currency)}) - ${c.due_text}`,
          go: () =>
            router.push(c.draft_clearance_id ? { pathname: "/new-clearance", params: { claim: c.draft_clearance_id } } : { pathname: "/new-clearance", params: { advance: c.advance_id } })
        });
      }
      setWeek(lines);
      setWebTiles(Array.isArray(configRes?.webTiles) ? configRes.webTiles.filter((t) => /^[a-z0-9-]{1,40}$/.test(t.go) && t.label) : []);
    } catch {
      // Home's stats/module list are a convenience, not critical - leave
      // stats blank and fall back to defaults rather than blocking the
      // screen with an error state.
    }
  }, [role, router]);

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

  const firstName = user?.fullName?.split(" ")[0] || "there";
  const { isTablet, gutter } = useLayout();
  const padX = { paddingHorizontal: gutter(layout.maxWideWidth, spacing.xl) };

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={[styles.header, padX]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <Text style={styles.brandLabel}>FlowDesk</Text>
        </View>
        <Text style={styles.greeting}>{greetingFor(new Date())}, {firstName}</Text>
        <Text style={styles.subGreeting}>Here&apos;s what&apos;s moving today</Text>
        <UpdateBanner />
        <TouchableOpacity style={styles.searchBar} onPress={() => router.push("/search")} accessibilityRole="search">
          <Search size={17} color={colors.muted} />
          <Text style={styles.askText}>Search requests and screens</Text>
        </TouchableOpacity>
        {assistantReady && (
          <TouchableOpacity style={styles.askBar} onPress={() => router.push("/assistant")} accessibilityRole="button">
            <Sparkles size={18} color={colors.accent} />
            <Text style={styles.askText}>Ask FlowDesk AI anything…</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.statsRow, padX]}>
        <TouchableOpacity style={styles.statCard} onPress={() => router.push("/(tabs)/inbox")}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{pendingCount ?? "–"}</Text>
          <Text style={styles.statLabel}>Awaiting your approval</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statCard} onPress={() => router.push("/my-advances")}>
          <Text style={styles.statValue}>{inProgressCount ?? "–"}</Text>
          <Text style={styles.statLabel}>Your advance in progress</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.weekSection, padX]}>
        {week.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Your week</Text>
            <View style={styles.weekCard}>
              {week.map((l, i) => (
                <TouchableOpacity key={l.key} style={[styles.weekRow, i > 0 && styles.weekBorder]} onPress={l.go} accessibilityRole="button">
                  <View style={[styles.weekDot, { backgroundColor: colors[l.tone] }]} />
                  <Text style={styles.weekText}>{l.text}</Text>
                  <ChevronRight size={16} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        <TouchableOpacity style={styles.insightsLink} onPress={() => router.push("/insights")} accessibilityRole="button">
          <BarChart3 size={16} color={colors.accent} />
          <Text style={styles.insightsLabel}>Your spending insights</Text>
          <ChevronRight size={16} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.modulesSection, padX]}>
        <Text style={styles.sectionLabel}>Modules</Text>
        <Grid columns={isTablet ? 3 : 2}>
          {MODULE_DEFS.filter((m) => enabledModules[m.key] && (!m.roles || m.roles.includes(role) || (m.orDelegationEligible && delegationEligible))).map((m) => (
            <ModuleTile
              key={m.key}
              icon={m.icon}
              label={m.label}
              iconColor={colors[m.color]}
              iconBg={colors[m.bg]}
              // A tile with no screen in the app yet still answers a tap -
              // a dead tile reads as the app not responding.
              onPress={
                m.route
                  ? () => router.push(m.route!)
                  : () => Alert.alert(m.label, `${m.label} isn't in the app yet. Use the FlowDesk portal for now.`)
              }
            />
          ))}
          {webTiles.map((t) => {
            const color: keyof Colors = TILE_COLORS.includes(t.color as keyof Colors) ? (t.color as keyof Colors) : "accent";
            return (
              <ModuleTile
                key={`web-${t.go}`}
                icon={WEB_TILE_ICONS[t.icon || ""] || LayoutGrid}
                label={t.label}
                iconColor={colors[color]}
                iconBg={colors[`${color}Soft` as keyof Colors]}
                onPress={() => router.push({ pathname: "/web", params: { go: t.go } })}
              />
            );
          })}
        </Grid>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  header: { paddingTop: spacing.xxl, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: { width: 22, height: 22, borderRadius: 6, backgroundColor: colors.accent },
  brandLabel: { fontSize: 15, fontWeight: "700", color: colors.ink },
  greeting: { marginTop: 12, fontSize: 22, fontWeight: "700", color: colors.ink },
  subGreeting: { fontSize: 13, color: colors.muted, marginTop: 2 },
  askBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: 11, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentSoft },
  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: 11, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper1 },
  weekSection: { paddingTop: spacing.lg },
  weekCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" },
  weekRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md },
  weekBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  weekDot: { width: 8, height: 8, borderRadius: 4 },
  weekText: { flex: 1, fontSize: 13.5, color: colors.ink },
  insightsLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, alignSelf: "flex-start", paddingVertical: 4 },
  insightsLabel: { fontSize: 13.5, fontWeight: "700", color: colors.accent },
  askText: { fontSize: 14, color: colors.muted, flex: 1 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  modulesSection: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.md }
}));
