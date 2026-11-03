import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Briefcase, Calendar, CheckCircle2, CircleHelp, ClipboardList, Clock3, FileSignature, GitBranch, LayoutGrid, Megaphone, MessageCircle,
  Radio, ShieldCheck, Sparkles, Truck, Users, Wrench, type LucideIcon
} from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, type InboxItem, type ModuleKey, type WebTile } from "@/lib/api";
import ModuleTile from "@/components/ModuleTile";
import UpdateBanner from "@/components/UpdateBanner";
import { DEFAULT_MODULES, isDocTypeEnabled, mergeModules } from "@/lib/mobile-modules";
import { Grid, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme, type Colors } from "@/theme";

// Icons a server-defined tile may use (by name) - anything else falls back to a grid.
const WEB_TILE_ICONS: Record<string, LucideIcon> = {
  wrench: Wrench, "file-signature": FileSignature, "clipboard-list": ClipboardList, "check-circle": CheckCircle2, clock: Clock3,
  radio: Radio, "git-branch": GitBranch, grid: LayoutGrid, briefcase: Briefcase, calendar: Calendar, truck: Truck, users: Users,
  "shield-check": ShieldCheck, megaphone: Megaphone, help: CircleHelp, "message-circle": MessageCircle
};
const TILE_COLORS: (keyof Colors)[] = ["accent", "good", "warn", "bad", "info", "purple"];

const MODULE_DEFS: { key: ModuleKey; label: string; icon: LucideIcon; color: keyof Colors; bg: keyof Colors; route?: "/my-advances" | "/my-clearances" | "/sign" | "/maintenance" }[] = [
  { key: "advances", label: "Advances", icon: ClipboardList, color: "accent", bg: "accentSoft", route: "/my-advances" },
  { key: "clearances", label: "Clearances", icon: CheckCircle2, color: "good", bg: "goodSoft", route: "/my-clearances" },
  { key: "overtime", label: "Overtime", icon: Clock3, color: "warn", bg: "warnSoft" },
  { key: "standby", label: "Standby", icon: Radio, color: "info", bg: "infoSoft" },
  { key: "customProcesses", label: "Custom Processes", icon: GitBranch, color: "purple", bg: "purpleSoft" },
  { key: "signADocument", label: "Sign a Document", icon: FileSignature, color: "accent", bg: "accentSoft", route: "/sign" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "warn", bg: "warnSoft", route: "/maintenance" }
];

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

  const load = useCallback(async () => {
    api.assistantStatus().then((s) => setAssistantReady(Boolean(s?.configured))).catch(() => setAssistantReady(false));
    try {
      const [inboxRes, advancesRes, configRes] = await Promise.all([api.inbox(), api.myAdvances(), api.mobileConfig()]);
      const items: InboxItem[] = inboxRes.items || [];
      const modules = mergeModules(configRes?.modules);
      setPendingCount(items.filter((i) => i.current_step_actionable_by_me && isDocTypeEnabled(i.doc_type, modules)).length);
      const advances = Array.isArray(advancesRes) ? advancesRes : advancesRes.items || [];
      setInProgressCount(advances.filter((a: any) => !["DRAFT", "PAID", "CANCELLED", "REJECTED"].includes(a.status)).length);
      if (configRes?.modules) setEnabledModules(mergeModules(configRes.modules));
      setWebTiles(Array.isArray(configRes?.webTiles) ? configRes.webTiles.filter((t) => /^[a-z0-9-]{1,40}$/.test(t.go) && t.label) : []);
    } catch {
      // Home's stats/module list are a convenience, not critical - leave
      // stats blank and fall back to defaults rather than blocking the
      // screen with an error state.
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
        <Text style={styles.greeting}>Good afternoon, {firstName}</Text>
        <Text style={styles.subGreeting}>Here&apos;s what&apos;s moving today</Text>
        <UpdateBanner />
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

      <View style={[styles.modulesSection, padX]}>
        <Text style={styles.sectionLabel}>Modules</Text>
        <Grid columns={isTablet ? 3 : 2}>
          {MODULE_DEFS.filter((m) => enabledModules[m.key]).map((m) => (
            <ModuleTile
              key={m.key}
              icon={m.icon}
              label={m.label}
              iconColor={colors[m.color]}
              iconBg={colors[m.bg]}
              onPress={m.route ? () => router.push(m.route!) : undefined}
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
  askText: { fontSize: 14, color: colors.muted, flex: 1 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  modulesSection: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.md }
}));
