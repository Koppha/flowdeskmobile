import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Check, Circle, Clock3, X } from "lucide-react-native";
import { api } from "@/lib/api";
import { fmtMoney, formatDisplayDate } from "@/lib/request-forms";
import { statusLabel, toneFor } from "@/lib/status";
import StatusPill from "@/components/StatusPill";
import { colors, radii, spacing } from "@/theme";

// Requester-side tracking for one advance: where it is in its approval route,
// who approved each step and when, payment, and the full activity log.
// Data: GET /advances/:id (approval_chain + workflow_step_order) and
// GET /advances/:id/history (audit log), the same as the web app uses.

type ChainStep = {
  position_name?: string | null;
  approver_title?: string | null;
  approver_name?: string | null;
  approval_group_name?: string | null;
  position_type_code?: string | null;
  approved?: boolean;
  approved_at?: string | null;
};

type HistoryRow = {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  after_json: Record<string, unknown> | null;
};

type StepState = "done" | "current" | "rejected" | "upcoming";

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
// Housekeeping entries that would only clutter the timeline.
const HIDDEN_ACTIONS = new Set(["ADVANCE_LINES_UPDATE"]);

const TERMINAL = new Set(["PAID", "REJECTED", "CANCELLED"]);

function when(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${formatDisplayDate(iso.slice(0, 10))}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function stepTitle(s: ChainStep) {
  const raw = String(s.position_name || s.approval_group_name || s.approver_title || "Approver");
  return raw.replace(/^(Team|Section): /, "");
}

export default function AdvanceTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [advance, setAdvance] = useState<any>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const chain: ChainStep[] = (Array.isArray(advance.approval_chain) ? advance.approval_chain : []).filter(
    (s: ChainStep) => s.position_type_code !== "EMPLOYEE"
  );
  const currentIdx = Number(advance.workflow_step_order ?? 0);
  const fullChain: ChainStep[] = Array.isArray(advance.approval_chain) ? advance.approval_chain : [];

  function stateOf(step: ChainStep): StepState {
    const idx = fullChain.indexOf(step);
    if (step.approved || status === "PAID") return "done";
    if (status === "REJECTED" && idx === currentIdx) return "rejected";
    if (!TERMINAL.has(status) && status !== "DRAFT" && idx === currentIdx) return "current";
    return "upcoming";
  }

  const waitingOn = chain.find((s) => stateOf(s) === "current");
  const rejection = [...history].reverse().find((h) => h.action === "ADVANCE_REJECT" || h.action === "ADVANCE_ROLLBACK");
  const events = history.filter((h) => !HIDDEN_ACTIONS.has(h.action)).slice().reverse();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load())} tintColor={colors.accent} />}
    >
      <View style={styles.card}>
        <Text style={styles.kind}>{(advance.travel_type_name || advance.type || "Advance").replace(/_/g, " ").toUpperCase()}</Text>
        <View style={styles.row}>
          <Text style={styles.amount}>{fmtMoney(amount, currency)}</Text>
          <StatusPill label={statusLabel(status)} tone={toneFor(status)} />
        </View>
        {advance.purpose ? <Text style={styles.purpose}>{advance.purpose}</Text> : null}
        {Number(advance.approved_total) > 0 && Number(advance.approved_total) !== Number(advance.requested_total) && (
          <Text style={styles.muted}>Requested {fmtMoney(Number(advance.requested_total), currency)}</Text>
        )}
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

      <Text style={styles.sectionLabel}>Progress</Text>
      <View style={styles.card}>
        <TimelineItem state={advance.submitted_at ? "done" : "upcoming"} title="Submitted" detail={when(advance.submitted_at) || "Not yet submitted"} />
        {chain.map((s, i) => {
          const st = stateOf(s);
          return (
            <TimelineItem
              key={i}
              state={st}
              title={stepTitle(s)}
              detail={[
                s.approver_name,
                st === "done" ? (s.approved_at ? `Approved ${when(s.approved_at)}` : "Approved") : st === "current" ? "Waiting for approval" : st === "rejected" ? "Rejected" : null
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          );
        })}
        <TimelineItem
          state={status === "PAID" ? "done" : "upcoming"}
          title="Paid"
          detail={
            status === "PAID"
              ? [when(advance.paid_at), advance.paid_reference ? `Ref ${advance.paid_reference}` : null].filter(Boolean).join(" · ")
              : "After final approval"
          }
          last
        />
      </View>

      {events.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Activity</Text>
          <View style={styles.card}>
            {events.map((h, i) => (
              <View key={h.id} style={[styles.event, i > 0 && styles.eventBorder]}>
                <Text style={styles.eventTitle}>
                  {ACTION_LABELS[h.action] || statusLabel(h.action.replace(/^ADVANCE_/, ""))}
                  {h.after_json?.step_name ? ` · ${String(h.after_json.step_name)}` : ""}
                </Text>
                <Text style={styles.muted}>{[h.actor_name, when(h.created_at)].filter(Boolean).join(" · ")}</Text>
                {h.after_json?.comments ? <Text style={styles.comment}>{`"${String(h.after_json.comments)}"`}</Text> : null}
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function TimelineItem({ state, title, detail, last }: { state: StepState; title: string; detail?: string | null; last?: boolean }) {
  const icon =
    state === "done" ? (
      <Check size={14} color="#fff" strokeWidth={3} />
    ) : state === "rejected" ? (
      <X size={14} color="#fff" strokeWidth={3} />
    ) : state === "current" ? (
      <Clock3 size={14} color="#fff" strokeWidth={2.5} />
    ) : (
      <Circle size={10} color={colors.muted} />
    );
  return (
    <View style={styles.tlRow}>
      <View style={styles.tlRail}>
        <View style={[styles.tlDot, styles[`dot_${state}`]]}>{icon}</View>
        {!last && <View style={[styles.tlLine, state === "done" && styles.tlLineDone]} />}
      </View>
      <View style={styles.tlBody}>
        <Text style={[styles.tlTitle, state === "upcoming" && styles.tlTitleMuted]}>{title}</Text>
        {detail ? <Text style={styles.muted}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1, padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  kind: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, color: colors.accent, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: { fontSize: 22, fontWeight: "700", color: colors.ink },
  purpose: { marginTop: spacing.sm, fontSize: 14, color: colors.ink },
  muted: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.warnSoft },
  bannerBad: { backgroundColor: colors.badSoft },
  bannerText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.sm },
  tlRow: { flexDirection: "row", gap: spacing.md },
  tlRail: { alignItems: "center", width: 24 },
  tlDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot_done: { backgroundColor: colors.good },
  dot_current: { backgroundColor: colors.warn },
  dot_rejected: { backgroundColor: colors.bad },
  dot_upcoming: { backgroundColor: colors.paper2 },
  tlLine: { flex: 1, width: 2, minHeight: 18, backgroundColor: colors.border, marginVertical: 2 },
  tlLineDone: { backgroundColor: colors.good },
  tlBody: { flex: 1, paddingBottom: spacing.md },
  tlTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  tlTitleMuted: { color: colors.muted },
  event: { paddingVertical: 10 },
  eventBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  eventTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  comment: { marginTop: 4, fontSize: 13, color: colors.ink, fontStyle: "italic" }
});
