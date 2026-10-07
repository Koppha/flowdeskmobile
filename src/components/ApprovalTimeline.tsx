import { StyleSheet, Text, View } from "react-native";
import { Check, Circle, Clock3, X } from "lucide-react-native";
import { formatWhen } from "@/lib/request-forms";
import { colors, spacing } from "@/theme";

// Approval route of an advance or claim: approval_chain + workflow_step_order
// from GET /advances/:id or /claims/:id. Each step records approved /
// approved_at as it's actioned.

export type ChainStep = {
  position_name?: string | null;
  approver_title?: string | null;
  approver_name?: string | null;
  approval_group_name?: string | null;
  position_type_code?: string | null;
  approved?: boolean;
  approved_at?: string | null;
};

export type StepState = "done" | "current" | "rejected" | "upcoming";

const TERMINAL = new Set(["PAID", "REJECTED", "CANCELLED", "SETTLED", "CLOSED", "COMPLETED"]);

export function stepTitle(s: ChainStep) {
  const raw = String(s.position_name || s.approval_group_name || s.approver_title || "Approver");
  return raw.replace(/^(Team|Section): /, "");
}

/** Visible steps (the requester's own EMPLOYEE step is hidden) with their state. */
export function chainSteps(chain: unknown, workflowStepOrder: unknown, status: string) {
  const full: ChainStep[] = Array.isArray(chain) ? chain : [];
  const currentIdx = Number(workflowStepOrder ?? 0);
  const finished = status === "PAID" || status === "SETTLED" || status === "CLOSED" || status === "COMPLETED";
  return full
    .map((step, idx) => {
      let state: StepState = "upcoming";
      if (step.approved || finished) state = "done";
      else if (status === "REJECTED" && idx === currentIdx) state = "rejected";
      else if (!TERMINAL.has(status) && status !== "DRAFT" && idx === currentIdx) state = "current";
      return { step, state };
    })
    .filter(({ step }) => step.position_type_code !== "EMPLOYEE");
}

export function TimelineItem({ state, title, detail, last }: { state: StepState; title: string; detail?: string | null; last?: boolean }) {
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
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.dot, styles[`dot_${state}`]]}>{icon}</View>
        {!last && <View style={[styles.line, state === "done" && styles.lineDone]} />}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, state === "upcoming" && styles.titleMuted]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/** Submitted -> each approval step -> an optional final step (e.g. "Paid"). */
export default function ApprovalTimeline({
  chain,
  workflowStepOrder,
  status,
  submittedAt,
  final
}: {
  chain: unknown;
  workflowStepOrder: unknown;
  status: string;
  submittedAt?: string | null;
  final?: { title: string; done: boolean; detail: string };
}) {
  const steps = chainSteps(chain, workflowStepOrder, status);
  return (
    <View>
      <TimelineItem
        state={submittedAt ? "done" : "upcoming"}
        title="Submitted"
        detail={formatWhen(submittedAt) || "Not yet submitted"}
        last={!steps.length && !final}
      />
      {steps.map(({ step, state }, i) => (
        <TimelineItem
          key={i}
          state={state}
          title={stepTitle(step)}
          detail={[
            step.approver_name,
            state === "done"
              ? step.approved_at
                ? `Approved ${formatWhen(step.approved_at)}`
                : "Approved"
              : state === "current"
                ? "Waiting for approval"
                : state === "rejected"
                  ? "Rejected"
                  : null
          ]
            .filter(Boolean)
            .join(" · ")}
          last={i === steps.length - 1 && !final}
        />
      ))}
      {final && <TimelineItem state={final.done ? "done" : "upcoming"} title={final.title} detail={final.detail} last />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  rail: { alignItems: "center", width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot_done: { backgroundColor: colors.good },
  dot_current: { backgroundColor: colors.warn },
  dot_rejected: { backgroundColor: colors.bad },
  dot_upcoming: { backgroundColor: colors.paper2 },
  line: { flex: 1, width: 2, minHeight: 18, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.good },
  body: { flex: 1, paddingBottom: spacing.md },
  title: { fontSize: 14, fontWeight: "600", color: colors.ink },
  titleMuted: { color: colors.muted },
  detail: { fontSize: 12.5, color: colors.muted, marginTop: 2 }
});
