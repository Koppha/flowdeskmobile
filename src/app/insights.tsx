import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/request-forms";
import type { AssistantChartData } from "@/lib/assistant";
import AssistantChart from "@/components/AssistantChart";
import { Segmented } from "@/components/form";
import { Grid, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// My own money through FlowDesk, from the lists the app already reads
// (GET /advances?mine=true, GET /claims?mine=true) - nothing new on the
// server, so it's exactly what My Advances / My Clearances show, summed.

type Advance = { id: string; status: string; type?: string | null; requested_total: number | string; approved_total?: number | string; travel_currency?: string | null; created_at?: string; submitted_at?: string | null };
type Claim = { id: string; status: string; claim_total: number | string; currency?: string | null; created_at?: string; submitted_at?: string | null };

// Requests that never turned into money don't count.
const NOT_SPENT = new Set(["DRAFT", "CANCELLED", "REJECTED"]);
type Range = "6m" | "12m";

const amountOf = (a: Advance) => Number(a.approved_total) || Number(a.requested_total) || 0;
const whenOf = (x: { submitted_at?: string | null; created_at?: string }) => new Date(x.submitted_at || x.created_at || 0);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** The last n months, oldest first, as keys and short labels ("Jun"). */
function lastMonths(n: number) {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: monthKey(m), label: m.toLocaleDateString(undefined, { month: "short" }) });
  }
  return out;
}

/** The currency most of the money is in - totals only add up within one. */
function mainCurrency(codes: string[]) {
  const counts = new Map<string, number>();
  for (const c of codes) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "LSL";
}

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { gutter, isTablet } = useLayout();
  const [advances, setAdvances] = useState<Advance[] | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<Range>("6m");

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([api.myAdvances(), api.myClearances().catch(() => [])]);
      setAdvances(Array.isArray(a) ? a : a?.items || []);
      setClaims(Array.isArray(c) ? c : c?.items || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your requests.");
      setAdvances((prev) => prev ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const view = useMemo(() => {
    if (!advances) return null;
    const months = lastMonths(range === "6m" ? 6 : 12);
    const first = new Date(`${months[0].key}-01T00:00:00`);
    const spent = advances.filter((a) => !NOT_SPENT.has(a.status));
    const currency = mainCurrency(spent.map((a) => (a.travel_currency || "LSL").toUpperCase()));
    const inRange = spent.filter((a) => (a.travel_currency || "LSL").toUpperCase() === currency && whenOf(a) >= first);
    const otherCurrency = spent.filter((a) => (a.travel_currency || "LSL").toUpperCase() !== currency && whenOf(a) >= first).length;

    const byMonth = new Map(months.map((m) => [m.key, 0]));
    for (const a of inRange) {
      const k = monthKey(whenOf(a));
      if (byMonth.has(k)) byMonth.set(k, (byMonth.get(k) || 0) + amountOf(a));
    }
    const byType = new Map<string, number>();
    for (const a of inRange) {
      const t = String(a.type || "Advance").replace(/_/g, " ");
      byType.set(t, (byType.get(t) || 0) + amountOf(a));
    }
    const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    // Pie slices beyond five become "Other" - more can't be told apart.
    const slices = types.length > 6 ? [...types.slice(0, 5), ["Other", types.slice(5).reduce((s, [, v]) => s + v, 0)] as [string, number]] : types;

    const claimsInRange = claims.filter((c) => !NOT_SPENT.has(c.status) && whenOf(c) >= first && (c.currency || "LSL").toUpperCase() === currency);
    const total = inRange.reduce((s, a) => s + amountOf(a), 0);
    const paid = inRange.filter((a) => a.status === "PAID").reduce((s, a) => s + amountOf(a), 0);
    const pending = inRange.filter((a) => a.status !== "PAID").reduce((s, a) => s + amountOf(a), 0);
    const cleared = claimsInRange.reduce((s, c) => s + (Number(c.claim_total) || 0), 0);

    const monthly: AssistantChartData = {
      title: `Advances by month (${currency})`,
      type: "bar",
      labels: months.map((m) => m.label),
      series: [{ name: "Advances", values: months.map((m) => Math.round((byMonth.get(m.key) || 0) * 100) / 100) }]
    };
    const split: AssistantChartData | null =
      slices.length > 1
        ? { title: `By type (${currency})`, type: "pie", labels: slices.map(([t]) => t), series: [{ name: "Amount", values: slices.map(([, v]) => Math.round(v * 100) / 100) }] }
        : null;
    return { currency, total, paid, pending, cleared, count: inRange.length, claimsCount: claimsInRange.length, monthly, split, otherCurrency };
  }, [advances, claims, range]);

  if (!advances) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxWideWidth) }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.accent} />}
    >
      <Segmented value={range} options={[{ value: "6m", label: "Last 6 months" }, { value: "12m", label: "Last 12 months" }]} onChange={setRange} />
      {error && <Text style={styles.error}>{error}</Text>}

      {view && view.count === 0 ? (
        <Text style={styles.empty}>No advances in this period yet. Once you have some, you&apos;ll see where your money goes here.</Text>
      ) : view ? (
        <>
          <Grid columns={isTablet ? 4 : 2}>
            <Stat label="Advances" value={fmtMoney(view.total, view.currency)} sub={`${view.count} request${view.count === 1 ? "" : "s"}`} />
            <Stat label="Paid out" value={fmtMoney(view.paid, view.currency)} />
            <Stat label="Still in approval" value={fmtMoney(view.pending, view.currency)} />
            <Stat label="Cleared" value={fmtMoney(view.cleared, view.currency)} sub={`${view.claimsCount} clearance${view.claimsCount === 1 ? "" : "s"}`} />
          </Grid>
          <View style={styles.card}>
            <AssistantChart chart={view.monthly} />
          </View>
          {view.split && (
            <View style={styles.card}>
              <AssistantChart chart={view.split} />
            </View>
          )}
          {view.otherCurrency > 0 && (
            <Text style={styles.note}>
              {view.otherCurrency} request{view.otherCurrency === 1 ? " is" : "s are"} in another currency and {view.otherCurrency === 1 ? "isn't" : "aren't"} added in here.
            </Text>
          )}
          <Text style={styles.note}>Amounts are approved amounts where set, otherwise what you requested. Drafts, cancelled and rejected requests aren&apos;t counted.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1 },
  content: { paddingVertical: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  stat: { flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  statValue: { fontSize: 19, fontWeight: "700", color: colors.ink },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  statSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, fontSize: 13.5, textAlign: "center", marginTop: spacing.xl, lineHeight: 20 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.bad, fontSize: 13 }
}));
