import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useMobileModules } from "@/lib/mobile-modules";
import { api } from "@/lib/api";
import StatusPill from "@/components/StatusPill";
import { statusLabel, toneFor } from "@/lib/status";
import { fmtMoney } from "@/lib/request-forms";
import { Grid, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

type Advance = {
  id: string;
  type: string;
  status: string;
  requested_total: number;
  travel_currency?: string | null;
  submitted_at: string | null;
};

export default function MyAdvancesScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [items, setItems] = useState<Advance[]>([]);
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
          const res = await api.myAdvances();
          setItems(Array.isArray(res) ? res : res.items || []);
          setError(null);
        } catch (e: any) {
          setError(e?.message || "Couldn't load your advance requests.");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const header = (
    <Stack.Screen
      options={{
        headerRight: modules.createAdvance
          ? () => (
              <TouchableOpacity onPress={() => router.push("/new-advance")} hitSlop={10} style={styles.newButton} accessibilityLabel="New">
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
      {items.map((a) => (
        <TouchableOpacity key={a.id} style={styles.card} onPress={() => router.push(`/advance/${a.id}`)} accessibilityHint="Shows approval progress">
          <View style={styles.row}>
            <Text style={styles.title}>{(a.type || "Advance").replace(/_/g, " ")}</Text>
            <Text style={styles.amount}>{fmtMoney(Number(a.requested_total), a.travel_currency)}</Text>
          </View>
          <View style={styles.pillRow}>
            <StatusPill label={statusLabel(a.status)} tone={toneFor(a.status)} />
          </View>
          <Text style={styles.meta}>{a.submitted_at ? `Submitted ${new Date(a.submitted_at).toLocaleDateString()}` : "Not yet submitted"}</Text>
        </TouchableOpacity>
      ))}
      </Grid>
      {items.length === 0 && <Text style={styles.empty}>{error ?? "No advance requests yet."}</Text>}
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
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xxl },
  newButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  newLabel: { color: colors.accent, fontWeight: "700", fontSize: 15 }
}));
