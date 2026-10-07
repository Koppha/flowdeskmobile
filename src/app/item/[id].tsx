import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { fmtMoney, formatWhen } from "@/lib/request-forms";
import { statusLabel, toneFor } from "@/lib/status";
import StatusPill from "@/components/StatusPill";
import ApprovalTimeline from "@/components/ApprovalTimeline";
import { AdvanceDetails, ClaimDetails } from "@/components/RequestDetails";
import { colors, radii, spacing } from "@/theme";

type DocType = "ADVANCE" | "CLAIM" | "CUSTOM_REQUEST";

// Approver's review screen: everything needed to decide (itinerary, dates,
// day-by-day amounts, reconciliation, approval route), then Approve/Reject.
export default function ItemDetailScreen() {
  const { id, docType, action, name } = useLocalSearchParams<{ id: string; docType: DocType; action?: string; name?: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = docType === "CLAIM" ? await api.claimDetail(id) : await api.advanceDetail(id);
        setDetail(res);
      } catch (e: any) {
        setError(e?.message || "Couldn't load this item.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, docType]);

  async function handleApprove() {
    setError(null);
    setSubmitting(true);
    try {
      if (docType === "CLAIM") await api.approveClaim(id, comment || undefined);
      else await api.approveAdvance(id, detail?.approved_total || detail?.requested_total, comment || undefined);
      router.replace({ pathname: "/confirmed", params: { outcome: "approved" } });
    } catch (e: any) {
      setError(e?.message || "Couldn't approve this item.");
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!comment.trim()) {
      setError("Please say why you're rejecting this");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (docType === "CLAIM") await api.rejectClaim(id, comment);
      else await api.rejectAdvance(id, comment);
      router.replace({ pathname: "/confirmed", params: { outcome: "rejected" } });
    } catch (e: any) {
      setError(e?.message || "Couldn't reject this item.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>{error || "Couldn't load this item."}</Text>
      </View>
    );
  }

  const isClaim = docType === "CLAIM";
  // The claim payload has no claimant name - the inbox passes it along.
  const person = isClaim ? name || detail.claimant_name : detail.requester_name || name;
  const amount = Number(isClaim ? detail.claim_total : detail.approved_total || detail.requested_total) || 0;
  const currency = isClaim ? detail.currency : detail.travel_currency;
  const kind = isClaim ? "Clearance claim" : detail.travel_type_name || String(detail.type || "Advance").replace(/_/g, " ");
  const status = String(detail.status || "");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.kind}>{kind.toUpperCase()}</Text>
        <Text style={styles.name}>{person || "—"}</Text>
        {detail.submitted_at && <Text style={styles.meta}>Submitted {formatWhen(detail.submitted_at)}</Text>}
        <View style={styles.amountRow}>
          <Text style={styles.amount}>{fmtMoney(amount, currency)}</Text>
          {status ? <StatusPill label={statusLabel(status)} tone={toneFor(status)} /> : null}
        </View>
        {detail.is_overdue && <Text style={styles.overdue}>Overdue at this step</Text>}
      </View>

      {isClaim ? <ClaimDetails c={detail} claimantName={person} /> : <AdvanceDetails a={detail} />}

      {Array.isArray(detail.approval_chain) && detail.approval_chain.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Approval route</Text>
          <View style={styles.card}>
            <ApprovalTimeline chain={detail.approval_chain} workflowStepOrder={detail.workflow_step_order} status={status} submittedAt={detail.submitted_at} />
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Your decision</Text>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Comment - optional, required if you reject"
        placeholderTextColor={colors.muted}
        multiline
        style={styles.textarea}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {action === "reject" && !error && <Text style={styles.hint}>Add a comment, then confirm your rejection below.</Text>}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.rejectButton]} onPress={handleReject} disabled={submitting}>
          <Text style={styles.buttonLabel}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.approveButton]} onPress={handleApprove} disabled={submitting}>
          <Text style={styles.buttonLabel}>{submitting ? "Working…" : "Approve"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1, padding: spacing.xl },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  kind: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, color: colors.accent, marginBottom: 6 },
  name: { fontSize: 19, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  amount: { fontSize: 22, fontWeight: "700", color: colors.ink },
  overdue: { marginTop: spacing.sm, fontSize: 12.5, fontWeight: "600", color: colors.warn },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  textarea: {
    minHeight: 76,
    padding: spacing.md,
    fontSize: 13.5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    textAlignVertical: "top"
  },
  error: { color: colors.bad, fontSize: 12.5, marginTop: spacing.sm },
  hint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  button: { flex: 1, paddingVertical: 13, borderRadius: radii.md, alignItems: "center" },
  rejectButton: { backgroundColor: colors.bad },
  approveButton: { backgroundColor: colors.good },
  buttonLabel: { color: "#fff", fontSize: 14.5, fontWeight: "700" }
});
