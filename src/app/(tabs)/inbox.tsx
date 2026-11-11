import { useCallback, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { api, type InboxItem } from "@/lib/api";
import { fmtMoney, formatWhen } from "@/lib/request-forms";
import { isDocTypeEnabled, mergeModules } from "@/lib/mobile-modules";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, spacing, useTheme, type Colors } from "@/theme";

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
  return {
    kind: "Custom Process",
    title: item.request_type_name,
    subtitle: item.current_step_position_name || item.status,
    amount: null as string | null,
    kindColor: colors.muted
  };
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
  const { gutter } = useLayout();

  const load = useCallback(async () => {
    try {
      const [res, config] = await Promise.all([api.inbox(), api.mobileConfig().catch(() => null)]);
      const modules = mergeModules(config?.modules);
      const actionable = (res.items || []).filter((i) => i.current_step_actionable_by_me);
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
          try {
            if (item.doc_type === "ADVANCE") await api.approveAdvance(item.id, Number(item.approved_total) || Number(item.requested_total));
            else if (item.doc_type === "CLAIM") await api.approveClaim(item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          } catch (e: any) {
            Alert.alert("Couldn't approve", e?.message || "Something went wrong.");
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
        <Text style={styles.title}>Inbox</Text>
        {!loading && <Text style={styles.subtitle}>{items.length} item{items.length === 1 ? "" : "s"} need your attention</Text>}
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        {items.map((item) => {
          const meta = itemMeta(item, colors);
          return (
            <Swipeable
              key={item.id}
              ref={(r) => {
                rowRefs.current[item.id] = r;
              }}
              // Signing needs a placed signature and maintenance has its own
              // steps, so neither gets swipe-to-approve.
              enabled={item.doc_type !== "SIGNABLE_DOCUMENT" && item.doc_type !== "MAINTENANCE_REQUEST"}
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
                style={[styles.row, padX]}
                onPress={() =>
                  item.doc_type === "SIGNABLE_DOCUMENT"
                    ? router.push({ pathname: "/sign", params: { doc: item.id } })
                    : item.doc_type === "MAINTENANCE_REQUEST"
                      ? router.push({ pathname: "/maintenance", params: { req: item.id } })
                      : router.push({ pathname: "/item/[id]", params: { id: item.id, docType: item.doc_type, name: meta.title } })
                }
              >
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
                <ChevronRight size={18} color={colors.muted} />
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

        <Text style={styles.footerHint}>Swipe left on an item to approve or reject without opening it.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingTop: spacing.xl },
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
