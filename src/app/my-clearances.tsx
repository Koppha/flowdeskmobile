import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useMobileModules } from "@/lib/mobile-modules";
import { api } from "@/lib/api";
import StatusPill, { type StatusPillProps } from "@/components/StatusPill";
import { Grid, useLayout } from "@/components/layout";
import { fmtMoney } from "@/lib/request-forms";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

type Claim = {
  id: string;
  month: string | null;
  status: string;
  claim_total: number;
  currency?: string | null;
  closed_at: string | null;
};

function toneFor(status: string): StatusPillProps["tone"] {
  const s = status.toUpperCase();
  if (s.includes("REJECT") || s.includes("CANCEL")) return "bad";
  if (s.includes("SETTLE") || s.includes("CLOSE")) return "good";
  if (s === "DRAFT") return "muted";
  return "warn";
}

export default function MyClearancesScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [items, setItems] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { modules } = useMobileModules();
  const { columns, gutter } = useLayout();

  // Reload on focus so a request created on the New screen shows up on return.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const res = await api.myClearances();
          setItems(Array.isArray(res) ? res : res.items || []);
          setError(null);
        } catch (e: any) {
          setError(e?.message || "Couldn't load your clearances.");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const header = (
    <Stack.Screen
      options={{
        headerRight: modules.createClearance
          ? () => (
              <TouchableOpacity onPress={() => router.push("/new-clearance")} hitSlop={10} style={styles.newButton} accessibilityLabel="New">
                <Plus size={18} color={colors.accent} />
                <Text style={styles.newLabel}>New</Text>
              </TouchableOpacity>
            )
          : undefined
      }}
    />
  );

  if (loading) {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxWideWidth) }]}>
      {header}
      <Grid columns={columns}>
      {items.map((c) => {
        // A draft (yours, or one the AI Assistant saved) opens in the form to finish and submit.
        const draft = c.status === "DRAFT" && modules.createClearance;
        return (
          <TouchableOpacity
            key={c.id}
            style={styles.card}
            disabled={!draft}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: "/new-clearance", params: { claim: c.id } })}
            accessibilityHint={draft ? "Opens the draft to finish and submit" : undefined}
          >
            <View style={styles.row}>
              <Text style={styles.title}>{c.month ? `${c.month} Travel Clearance` : "Travel Clearance"}</Text>
              <Text style={styles.amount}>{fmtMoney(Number(c.claim_total), c.currency)}</Text>
            </View>
            <View style={styles.pillRow}>
              <StatusPill label={c.status.replace(/_/g, " ")} tone={toneFor(c.status)} />
            </View>
            <Text style={[styles.meta, draft && styles.draftLink]}>
              {draft ? "Draft - tap to finish and submit" : c.closed_at ? `Closed ${new Date(c.closed_at).toLocaleDateString()}` : "In progress"}
            </Text>
          </TouchableOpacity>
        );
      })}
      </Grid>
      {items.length === 0 && <Text style={styles.empty}>{error ?? "No clearances yet."}</Text>}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1 },
  content: { paddingVertical: spacing.lg },
  card: { flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  title: { fontSize: 14.5, fontWeight: "600", color: colors.ink },
  amount: { fontSize: 15, fontWeight: "700", color: colors.ink },
  pillRow: { marginTop: spacing.sm },
  meta: { marginTop: spacing.sm, fontSize: 12, color: colors.muted },
  draftLink: { color: colors.accent, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  newButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  newLabel: { color: colors.accent, fontWeight: "700", fontSize: 15 }
}));
