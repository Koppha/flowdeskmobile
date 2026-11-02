import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, ClipboardList, Clock3, FileSignature, GitBranch, Radio, Wrench, type LucideIcon } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, type InboxItem, type ModuleKey } from "@/lib/api";
import ModuleTile from "@/components/ModuleTile";
import { DEFAULT_MODULES, isDocTypeEnabled, mergeModules } from "@/lib/mobile-modules";
import { Grid, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme, type Colors } from "@/theme";

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
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [inboxRes, advancesRes, configRes] = await Promise.all([api.inbox(), api.myAdvances(), api.mobileConfig()]);
      const items: InboxItem[] = inboxRes.items || [];
      const modules = mergeModules(configRes?.modules);
      setPendingCount(items.filter((i) => i.current_step_actionable_by_me && isDocTypeEnabled(i.doc_type, modules)).length);
      const advances = Array.isArray(advancesRes) ? advancesRes : advancesRes.items || [];
      setInProgressCount(advances.filter((a: any) => !["DRAFT", "PAID", "CANCELLED", "REJECTED"].includes(a.status)).length);
      if (configRes?.modules) setEnabledModules(mergeModules(configRes.modules));
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
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  modulesSection: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.md }
}));
