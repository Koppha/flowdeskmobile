import { useCallback, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react-native";
import { api, type InboxItem } from "@/lib/api";
import { confirmApproval } from "@/lib/biometrics";
import { fmtMoney, formatWhen } from "@/lib/request-forms";
import { isDocTypeEnabled, mergeModules } from "@/lib/mobile-modules";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme, type Colors } from "@/theme";

function itemMeta(item: InboxItem, colors: Colors) {
  if (item.doc_type === "ADVANCE") {
    return {
      kind: (item.advance_type || "Advance").replace(/_/g, " "),
      title: item.requester_name,
      subtitle: item.current_step_position_name || item.status,
      amount: fmtMoney(Number(item.requested_total), item.currency),
      kindColor: colors.accent
    };
  }
  if (item.doc_type === "CLAIM") {
    return {
      kind: "Clearance Claim",
      title: item.claimant_name,
      subtitle: item.current_step_position_name || item.status,
      amount: fmtMoney(Number(item.claim_total), item.currency),
      kindColor: colors.warn
    };
  }
  if (item.doc_type === "SIGNABLE_DOCUMENT") {
    return {
      kind: "Sign a Document",
      title: item.title,
      subtitle: item.created_by_name ? `From ${item.created_by_name}` : "Waiting for your signature",
      amount: null as string | null,
      kindColor: colors.purple
    };
  }
  if (item.doc_type === "MAINTENANCE_REQUEST") {
    return {
      kind: item.priority === "EMERGENCY" ? "Maintenance · Emergency" : "Maintenance",
      title: `${item.request_no} · ${item.site_name}`,
      subtitle: item.task_label,
      amount: null as string | null,
      kindColor: item.priority === "EMERGENCY" ? colors.bad : colors.warn
    };
  }
  if (item.doc_type === "SUPPORT_CHAT") {
    return {
      kind: "Help & Support",
      title: item.as_agent ? item.requester_name : "FlowDesk support replied",
      subtitle: item.preview || item.task_label,
      amount: null as string | null,
      kindColor: colors.info
    };
  }
  const assigneeOnly = item.is_assignee_task && !item.current_step_actionable_by_me;
  return {
    kind: item.request_type_name || "Custom Process",
    title: item.requester_name || item.request_type_name,
    subtitle: assigneeOnly ? "Confirm you're ready (assignee)" : item.current_step_position_name || item.status,
    amount: null as string | null,
    kindColor: colors.purple
  };
}

/** Waiting on me: my approval step, or (custom processes) my confirmation as an assignee. */
const isMine = (i: InboxItem) => i.current_step_actionable_by_me || (i.doc_type === "CUSTOM_REQUEST" && Boolean(i.is_assignee_task));

/** Only advances and clearances can be approved without opening them (same rule as swipe-to-approve). */
const isQuickApprovable = (i: InboxItem) => i.doc_type === "ADVANCE" || i.doc_type === "CLAIM";

function approveOne(item: InboxItem) {
  // approved_total is "0.00" (truthy) until someone sets it - the server needs a positive amount.
  if (item.doc_type === "ADVANCE") return api.approveAdvance(item.id, Number(item.approved_total) || Number(item.requested_total));
  if (item.doc_type === "CLAIM") return api.approveClaim(item.id);
  return Promise.reject(new Error("Open this item to act on it."));
}

export default function InboxScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Items waiting in modules the admin hasn't switched on for the app.
  const [hiddenCount, setHiddenCount] = useState(0);
  const rowRefs = useRef<Record<string, Swipeable | null>>({});
  // Approve several at once: "Select", tick advances/clearances, "Approve N".
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { gutter } = useLayout();

  const load = useCallback(async () => {
    try {
      const [res, config] = await Promise.all([api.inbox(), api.mobileConfig().catch(() => null)]);
      const modules = mergeModules(config?.modules);
      const actionable = (res.items || []).filter(isMine);
      const visible = actionable.filter((i) => isDocTypeEnabled(i.doc_type, modules));
      setItems(visible);
      setHiddenCount(actionable.length - visible.length);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your inbox.");
    } finally {
      setLoading(false);
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

  function closeRow(id: string) {
    rowRefs.current[id]?.close();
  }

  async function quickApprove(item: InboxItem) {
    closeRow(item.id);
    Alert.alert("Approve", `Approve this ${item.doc_type === "ADVANCE" ? "advance" : "clearance"}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: async () => {
          if (!(await confirmApproval("Approve this request"))) return;
          try {
            await approveOne(item);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          } catch (e: any) {
            Alert.alert("Couldn't approve", e?.message || "Something went wrong.");
          }
        }
      }
    ]);
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const approvable = items.filter(isQuickApprovable);
  const allSelected = approvable.length > 0 && approvable.every((i) => selected.has(i.id));

  function approveSelected() {
    const picked = items.filter((i) => selected.has(i.id) && isQuickApprovable(i));
    if (!picked.length) return;
    const n = picked.length;
    Alert.alert(`Approve ${n} item${n === 1 ? "" : "s"}?`, "Each is approved at the amount shown. Open an item first if you need to change or comment on it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve",
        onPress: async () => {
          if (!(await confirmApproval(`Approve ${n} item${n === 1 ? "" : "s"}`))) return;
          setBulkBusy(true);
          // One at a time: the approval chain moves per item, and a failure
          // (e.g. someone else just acted) must not stop the rest.
          const failed: { item: InboxItem; message: string }[] = [];
          const done = new Set<string>();
          for (const item of picked) {
            try {
              await approveOne(item);
              done.add(item.id);
            } catch (e: any) {
              failed.push({ item, message: e?.message || "Something went wrong." });
            }
          }
          setItems((prev) => prev.filter((i) => !done.has(i.id)));
          setBulkBusy(false);
          stopSelecting();
          if (failed.length) {
            const lines = failed.map((f) => `• ${itemMeta(f.item, colors).title}: ${f.message}`).join("\n");
            Alert.alert(`${done.size} approved, ${failed.length} not`, lines);
          }
        }
      }
    ]);
  }

  function goReject(item: InboxItem) {
    closeRow(item.id);
    router.push({ pathname: "/item/[id]", params: { id: item.id, docType: item.doc_type, action: "reject", name: itemMeta(item, colors).title } });
  }

  const padX = { paddingHorizontal: gutter(layout.maxContentWidth, spacing.xl) };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, padX]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Inbox</Text>
          {(selecting || approvable.length > 1) && (
            <TouchableOpacity onPress={selecting ? stopSelecting : () => setSelecting(true)} hitSlop={10} accessibilityRole="button" disabled={bulkBusy}>
              <Text style={styles.selectLabel}>{selecting ? "Cancel" : "Select"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {selecting && (
          <TouchableOpacity onPress={() => setSelected(allSelected ? new Set() : new Set(approvable.map((i) => i.id)))} accessibilityRole="button">
            <Text style={styles.selectAll}>{allSelected ? "Clear selection" : `Select all ${approvable.length} advances and clearances`}</Text>
          </TouchableOpacity>
        )}
        {!loading && <Text style={styles.subtitle}>{items.length} item{items.length === 1 ? "" : "s"} need your attention</Text>}
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        {items.map((item) => {
          const meta = itemMeta(item, colors);
          const canTick = selecting && isQuickApprovable(item);
          const ticked = selected.has(item.id);
          return (
            <Swipeable
              key={item.id}
              ref={(r) => {
                rowRefs.current[item.id] = r;
              }}
              // Signing needs a placed signature, maintenance has its own steps,
              // a support chat needs an answer and a custom process step may need
              // something written (e.g. a supervisor's justification), so none
              // gets swipe-to-approve.
              enabled={!selecting && isQuickApprovable(item)}
              renderRightActions={() => (
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.bad }]} onPress={() => goReject(item)}>
                    <Text style={styles.actionLabel}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.good }]} onPress={() => quickApprove(item)}>
                    <Text style={styles.actionLabel}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            >
              <TouchableOpacity
                style={[styles.row, padX, selecting && !canTick && styles.rowDimmed]}
                disabled={selecting && !canTick}
                accessibilityState={selecting ? { checked: ticked } : undefined}
                onPress={() =>
                  canTick
                    ? toggle(item.id)
                    : item.doc_type === "SIGNABLE_DOCUMENT"
                    ? router.push({ pathname: "/sign", params: { doc: item.id } })
                    : item.doc_type === "MAINTENANCE_REQUEST"
                      ? router.push({ pathname: "/maintenance", params: { req: item.id } })
                      : item.doc_type === "SUPPORT_CHAT"
                        ? router.push({ pathname: "/web", params: { go: "support" } })
                        : item.doc_type === "CUSTOM_REQUEST"
                          ? router.push({ pathname: "/custom-processes", params: { req: item.id } })
                          : router.push({ pathname: "/item/[id]", params: { id: item.id, docType: item.doc_type, name: meta.title } })
                }
              >
                {selecting && (
                  <View style={styles.tick}>
                    {ticked ? <CheckCircle2 size={22} color={colors.accent} /> : <Circle size={22} color={canTick ? colors.muted : colors.border} />}
                  </View>
                )}
                <View style={styles.rowContent}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.kind, { color: meta.kindColor }]}>{meta.kind.toUpperCase()}</Text>
                    {meta.amount && <Text style={styles.amount}>{meta.amount}</Text>}
                  </View>
                  <Text style={styles.rowTitle}>{meta.title}</Text>
                  <Text style={styles.rowSubtitle}>{meta.subtitle}</Text>
                  {formatWhen(item.submitted_at || item.created_at) && (
                    <Text style={styles.rowWhen}>Submitted {formatWhen(item.submitted_at || item.created_at)}</Text>
                  )}
                </View>
                {!selecting && <ChevronRight size={18} color={colors.muted} />}
              </TouchableOpacity>
            </Swipeable>
          );
        })}

        {!loading && items.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{error ? `${error} Pull down to retry.` : "Nothing waiting on you right now."}</Text>
          </View>
        )}

        {!loading && hiddenCount > 0 && (
          <Text style={styles.hiddenNote}>
            {hiddenCount} more {hiddenCount === 1 ? "item is" : "items are"} waiting in modules that aren&apos;t in the app yet - open FlowDesk on the web to action {hiddenCount === 1 ? "it" : "them"}.
          </Text>
        )}

        <Text style={styles.footerHint}>
          {selecting ? "Tick the advances and clearances to approve together." : "Swipe left on an item to approve or reject without opening it."}
        </Text>
      </ScrollView>

      {selecting && (
        <View style={[styles.bulkBar, padX]}>
          <TouchableOpacity
            style={[styles.bulkButton, (!selected.size || bulkBusy) && styles.bulkButtonOff]}
            onPress={approveSelected}
            disabled={!selected.size || bulkBusy}
            accessibilityRole="button"
          >
            <Text style={styles.bulkLabel}>{bulkBusy ? "Approving…" : selected.size ? `Approve ${selected.size}` : "Tick items to approve"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingTop: spacing.xl },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectLabel: { fontSize: 15, fontWeight: "700", color: colors.accent },
  selectAll: { fontSize: 13, fontWeight: "600", color: colors.accent, marginBottom: spacing.sm },
  rowDimmed: { opacity: 0.45 },
  tick: { paddingTop: 2 },
  bulkBar: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bulkButton: { backgroundColor: colors.good, borderRadius: radii.md, paddingVertical: 13, alignItems: "center" },
  bulkButtonOff: { opacity: 0.5 },
  bulkLabel: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  title: { fontSize: 30, fontWeight: "700", color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: colors.muted, marginTop: 4, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  kind: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  amount: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowTitle: { marginTop: 4, fontSize: 15, fontWeight: "600", color: colors.ink },
  rowSubtitle: { marginTop: 2, fontSize: 12.5, color: colors.muted },
  actions: { flexDirection: "row" },
  actionButton: { width: 78, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: "#fff", fontSize: 12.5, fontWeight: "700" },
  hiddenNote: { textAlign: "center", color: colors.muted, fontSize: 12.5, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  rowWhen: { fontSize: 11.5, color: colors.muted, marginTop: 3 },
  empty: { padding: spacing.xxl, alignItems: "center" },
  emptyText: { color: colors.muted, fontSize: 13 },
  footerHint: { textAlign: "center", fontSize: 12, color: colors.muted, paddingVertical: spacing.lg }
}));
