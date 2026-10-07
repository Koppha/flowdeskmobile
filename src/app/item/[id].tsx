import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { colors, radii, spacing } from "@/theme";

type DocType = "ADVANCE" | "CLAIM" | "CUSTOM_REQUEST";

export default function ItemDetailScreen() {
  const { id, docType, action } = useLocalSearchParams<{ id: string; docType: DocType; action?: string }>();
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

  const isClaim = docType === "CLAIM";
  const title = isClaim ? detail?.claimant_name || detail?.full_name : detail?.requester_name || detail?.full_name;
  const amount = isClaim ? detail?.claim_total : detail?.requested_total;
  const kind = isClaim ? "Clearance Claim" : (detail?.type || "Advance").replace(/_/g, " ");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kind}>{kind.toUpperCase()}</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{title || "—"}</Text>
        {detail?.submitted_at && <Text style={styles.meta}>Submitted {new Date(detail.submitted_at).toLocaleDateString()}</Text>}

        <View style={styles.divider} />

        {!isClaim && detail?.purpose && (
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Purpose</Text>
            <Text style={styles.fieldValue}>{detail.purpose}</Text>
          </View>
        )}
        {isClaim && detail?.month && (
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Month</Text>
            <Text style={styles.fieldValue}>{detail.month}</Text>
          </View>
        )}

        <View style={[styles.fieldRow, styles.totalRow]}>
          <Text style={styles.fieldLabel}>{isClaim ? "Claim total" : "Requested amount"}</Text>
          <Text style={styles.totalValue}>M{Number(amount || 0).toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.commentLabel}>Comment</Text>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Optional — required if you reject"
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  kind: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, color: colors.accent, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  name: { fontSize: 19, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  fieldLabel: { fontSize: 13.5, color: colors.muted },
  fieldValue: { fontSize: 13.5, fontWeight: "600", color: colors.ink, maxWidth: 200, textAlign: "right" },
  totalRow: { paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: "dashed" },
  totalValue: { fontSize: 17, fontWeight: "700", color: colors.ink },
  commentLabel: { marginTop: spacing.xl, fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.3 },
  textarea: {
    marginTop: spacing.sm,
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
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  button: { flex: 1, paddingVertical: 13, borderRadius: radii.md, alignItems: "center" },
  rejectButton: { backgroundColor: colors.bad },
  approveButton: { backgroundColor: colors.good },
  buttonLabel: { color: "#fff", fontSize: 14.5, fontWeight: "700" }
});
