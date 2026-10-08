import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, ClipboardList, Clock3, FileSignature, GitBranch, Radio, type LucideIcon } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, type InboxItem, type ModuleKey } from "@/lib/api";
import ModuleTile from "@/components/ModuleTile";
import { DEFAULT_MODULES, isDocTypeEnabled, mergeModules } from "@/lib/mobile-modules";
import { colors, radii, spacing } from "@/theme";

const MODULE_DEFS: { key: ModuleKey; label: string; icon: LucideIcon; color: string; bg: string; route?: "/my-advances" | "/my-clearances" }[] = [
  { key: "advances", label: "Advances", icon: ClipboardList, color: colors.accent, bg: colors.accentSoft, route: "/my-advances" },
  { key: "clearances", label: "Clearances", icon: CheckCircle2, color: colors.good, bg: colors.goodSoft, route: "/my-clearances" },
  { key: "overtime", label: "Overtime", icon: Clock3, color: colors.warn, bg: colors.warnSoft },
  { key: "standby", label: "Standby", icon: Radio, color: colors.info, bg: colors.infoSoft },
  { key: "customProcesses", label: "Custom Processes", icon: GitBranch, color: colors.purple, bg: colors.purpleSoft },
  { key: "signADocument", label: "Sign a Document", icon: FileSignature, color: colors.accent, bg: colors.accentSoft }
];

export default function HomeScreen() {
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

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <Text style={styles.brandLabel}>FlowDesk</Text>
        </View>
        <Text style={styles.greeting}>Good afternoon, {firstName}</Text>
        <Text style={styles.subGreeting}>Here&apos;s what&apos;s moving today</Text>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statCard} onPress={() => router.push("/(tabs)/inbox")}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{pendingCount ?? "–"}</Text>
          <Text style={styles.statLabel}>Awaiting your approval</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statCard} onPress={() => router.push("/my-advances")}>
          <Text style={styles.statValue}>{inProgressCount ?? "–"}</Text>
          <Text style={styles.statLabel}>Your advance in progress</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modulesSection}>
        <Text style={styles.sectionLabel}>Modules</Text>
        <View style={styles.grid}>
          {MODULE_DEFS.filter((m) => enabledModules[m.key]).map((m) => (
            <ModuleTile
              key={m.key}
              icon={m.icon}
              label={m.label}
              iconColor={m.color}
              iconBg={m.bg}
              onPress={m.route ? () => router.push(m.route!) : undefined}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: { width: 22, height: 22, borderRadius: 6, backgroundColor: colors.accent },
  brandLabel: { fontSize: 15, fontWeight: "700", color: colors.ink },
  greeting: { marginTop: 12, fontSize: 22, fontWeight: "700", color: colors.ink },
  subGreeting: { fontSize: 13, color: colors.muted, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  modulesSection: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }
});
