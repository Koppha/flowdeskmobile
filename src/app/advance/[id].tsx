import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Clock3, X } from "lucide-react-native";
import { api } from "@/lib/api";
import { fmtMoney, formatWhen } from "@/lib/request-forms";
import { statusLabel, toneFor } from "@/lib/status";
import StatusPill from "@/components/StatusPill";
import ApprovalTimeline, { chainSteps, stepTitle } from "@/components/ApprovalTimeline";
import { AdvanceDetails } from "@/components/RequestDetails";
import { Panes, useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// Requester-side tracking for one advance: where it is in its approval route,
// who approved each step and when, payment, the itinerary, and the full
// activity log. Data: GET /advances/:id and GET /advances/:id/history.

type HistoryRow = {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  after_json: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  ADVANCE_CREATE: "Draft created",
  ADVANCE_UPDATE: "Request edited",
  ADVANCE_SUBMIT: "Submitted for approval",
  ADVANCE_APPROVE: "Approved",
  ADVANCE_REJECT: "Rejected",
  ADVANCE_ROLLBACK: "Sent back for changes",
  ADVANCE_REVOKE: "Withdrawn",
  ADVANCE_MARK_PAID: "Paid out",
  ADVANCE_PAYMENT_RECALLED: "Payment recalled",
  ADVANCE_CANCELLED: "Cancelled",
  ADVANCE_CAPTURE_UNDONE: "Capture undone"
};
// Housekeeping entries that would only clutter the log.
const HIDDEN_ACTIONS = new Set(["ADVANCE_LINES_UPDATE"]);

export default function AdvanceTrackingScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [advance, setAdvance] = useState<any>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { gutter, twoPane } = useLayout();

  const load = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([api.advanceDetail(id), api.advanceHistory(id).catch(() => [] as HistoryRow[])]);
      setAdvance(a);
      setHistory(Array.isArray(h) ? h : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load this advance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!advance) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error || "Advance not found."}</Text>
      </View>
    );
  }

  const status = String(advance.status || "");
  const currency = advance.travel_currency || "LSL";
  const amount = Number(advance.approved_total || advance.requested_total || 0);
  const waitingOn = chainSteps(advance.approval_chain, advance.workflow_step_order, status).find((s) => s.state === "current")?.step;
  const rejection = [...history].reverse().find((h) => h.action === "ADVANCE_REJECT" || h.action === "ADVANCE_ROLLBACK");
  const events = history.filter((h) => !HIDDEN_ACTIONS.has(h.action)).slice().reverse();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxWideWidth) }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Panes
        left={
          <>
      <View style={styles.card}>
        <Text style={styles.kind}>{String(advance.travel_type_name || advance.type || "Advance").replace(/_/g, " ").toUpperCase()}</Text>
        <View style={styles.row}>
          <Text style={styles.amount}>{fmtMoney(amount, currency)}</Text>
          <StatusPill label={statusLabel(status)} tone={toneFor(status)} />
        </View>
        {waitingOn && (
          <View style={styles.banner}>
            <Clock3 size={16} color={colors.warn} />
            <Text style={styles.bannerText}>
              Waiting on {stepTitle(waitingOn)}
              {waitingOn.approver_name ? ` (${waitingOn.approver_name})` : ""}
              {advance.is_overdue ? " - overdue" : ""}
            </Text>
          </View>
        )}
        {rejection && (status === "REJECTED" || status === "DRAFT") && (
          <View style={[styles.banner, styles.bannerBad]}>
            <X size={16} color={colors.bad} />
            <Text style={styles.bannerText}>
              {status === "REJECTED" ? "Rejected" : "Sent back"} by {rejection.actor_name || "an approver"}
              {rejection.after_json?.comments ? `: "${String(rejection.after_json.comments)}"` : ""}
            </Text>
          </View>
        )}
      </View>
      {twoPane && <AdvanceDetails a={advance} />}
          </>
        }
        right={
          <>
      <Text style={styles.sectionLabel}>Progress</Text>
      <View style={styles.card}>
        <ApprovalTimeline
          chain={advance.approval_chain}
          workflowStepOrder={advance.workflow_step_order}
          status={status}
          submittedAt={advance.submitted_at}
          final={{
            title: "Paid",
            done: status === "PAID",
            detail:
              status === "PAID"
                ? [formatWhen(advance.paid_at), advance.paid_reference ? `Ref ${advance.paid_reference}` : null].filter(Boolean).join(" · ")
                : "After final approval"
          }}
        />
      </View>

      {!twoPane && <AdvanceDetails a={advance} />}

      {events.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, styles.spaced]}>Activity</Text>
          <View style={styles.card}>
            {events.map((h, i) => (
              <View key={h.id} style={[styles.event, i > 0 && styles.eventBorder]}>
                <Text style={styles.eventTitle}>
                  {ACTION_LABELS[h.action] || statusLabel(h.action.replace(/^ADVANCE_/, ""))}
                  {h.after_json?.step_name ? ` · ${String(h.after_json.step_name)}` : ""}
                </Text>
                <Text style={styles.muted}>{[h.actor_name, formatWhen(h.created_at)].filter(Boolean).join(" · ")}</Text>
                {h.after_json?.comments ? <Text style={styles.comment}>{`"${String(h.after_json.comments)}"`}</Text> : null}
              </View>
            ))}
          </View>
        </>
      )}
          </>
        }
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1, padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  kind: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, color: colors.accent, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: 22, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.warnSoft },
  bannerBad: { backgroundColor: colors.badSoft },
  bannerText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.sm },
  spaced: { marginTop: spacing.lg },
  event: { paddingVertical: 10 },
  eventBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  eventTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  comment: { marginTop: 4, fontSize: 13, color: colors.ink, fontStyle: "italic" }
}));
