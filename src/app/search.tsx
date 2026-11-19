import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Search as SearchIcon } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, type InboxItem, type ModuleKey } from "@/lib/api";
import { isDocTypeEnabled, useMobileModules } from "@/lib/mobile-modules";
import { statusLabel, toneFor } from "@/lib/status";
import StatusPill from "@/components/StatusPill";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// One search box for the whole app: screens ("delegation", "sign"), what's
// waiting in my Inbox, and advances/clearances via GET /search (the portal's
// Quick Search - role-scoped on the server, so it never shows more than the
// person could already see).

type Screen = { label: string; keywords: string; href: Href; module?: ModuleKey };
const SCREENS: Screen[] = [
  { label: "My advance requests", keywords: "advances travel money trip", href: "/my-advances", module: "advances" },
  { label: "New advance request", keywords: "create travel trip money", href: "/new-advance", module: "createAdvance" },
  { label: "My clearances", keywords: "claims receipts clear", href: "/my-clearances", module: "clearances" },
  { label: "New clearance", keywords: "claim receipts clear", href: "/new-clearance", module: "createClearance" },
  { label: "Custom Processes", keywords: "change request computer request processes", href: "/custom-processes", module: "customProcesses" },
  { label: "Sign a Document", keywords: "signature pdf sign", href: "/sign", module: "signADocument" },
  { label: "Maintenance", keywords: "repair fault building site", href: "/maintenance", module: "maintenance" },
  { label: "Delegation", keywords: "away leave out of office delegate", href: "/delegation", module: "delegation" },
  { label: "My Team", keywords: "team reports staff", href: "/my-team", module: "myTeam" },
  { label: "Spending insights", keywords: "charts spend totals report", href: "/insights" },
  { label: "Inbox", keywords: "approvals approve pending", href: "/(tabs)/inbox" },
  { label: "Phone number", keywords: "profile contact sms", href: { pathname: "/web", params: { go: "phone" } } },
  { label: "Help & support", keywords: "help chat support question", href: { pathname: "/web", params: { go: "support" } } },
  { label: "Leave feedback", keywords: "rate review feedback", href: "/feedback" }
];

type Found = { id: string; status: string; type: string | null; requester_id?: string; claimant_id?: string; requester_name: string | null; created_at: string };

function inboxText(i: InboxItem): string {
  const parts: (string | null | undefined)[] = [i.doc_type.replace(/_/g, " "), i.status, i.current_step_position_name];
  if (i.doc_type === "ADVANCE") parts.push(i.requester_name, i.purpose, i.advance_type);
  else if (i.doc_type === "CLAIM") parts.push(i.claimant_name);
  else if (i.doc_type === "CUSTOM_REQUEST") parts.push(i.request_type_name, i.requester_name);
  else if (i.doc_type === "SIGNABLE_DOCUMENT") parts.push(i.title, i.created_by_name);
  else if (i.doc_type === "MAINTENANCE_REQUEST") parts.push(i.request_no, i.site_name, i.location, i.category, i.requester_name);
  else if (i.doc_type === "SUPPORT_CHAT") parts.push(i.requester_name, i.preview);
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function inboxTitle(i: InboxItem): string {
  switch (i.doc_type) {
    case "ADVANCE": return `Advance · ${i.requester_name}`;
    case "CLAIM": return `Clearance · ${i.claimant_name}`;
    case "CUSTOM_REQUEST": return `${i.request_type_name}${i.requester_name ? ` · ${i.requester_name}` : ""}`;
    case "SIGNABLE_DOCUMENT": return `Sign · ${i.title}`;
    case "MAINTENANCE_REQUEST": return `Maintenance · ${i.request_no}`;
    case "SUPPORT_CHAT": return `Support · ${i.requester_name}`;
  }
}

function inboxHref(i: InboxItem): Href {
  switch (i.doc_type) {
    case "SIGNABLE_DOCUMENT": return { pathname: "/sign", params: { doc: i.id } };
    case "MAINTENANCE_REQUEST": return { pathname: "/maintenance", params: { req: i.id } };
    case "SUPPORT_CHAT": return { pathname: "/web", params: { go: "support" } };
    case "CUSTOM_REQUEST": return { pathname: "/custom-processes", params: { req: i.id } };
    default: return { pathname: "/item/[id]", params: { id: i.id, docType: i.doc_type } };
  }
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { user } = useAuth();
  const { modules } = useMobileModules();
  const { gutter } = useLayout();
  const [q, setQ] = useState("");
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [found, setFound] = useState<{ advances: Found[]; claims: Found[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    api.inbox().then((r) => setInbox(r.items || [])).catch(() => {});
  }, []);

  function onChange(text: string) {
    setQ(text);
    const short = text.trim().length < 2;
    // Too short to search: drop old results and any answer still on its way.
    if (short) {
      latest.current++;
      setFound(null);
    }
    setSearching(!short);
  }

  // Server search, debounced; an older answer never overwrites a newer one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ticket = ++latest.current;
    const t = setTimeout(() => {
      api
        .search(term)
        .then((r) => ticket === latest.current && (setFound({ advances: r.advances || [], claims: r.claims || [] }), setError(null)))
        .catch((e) => ticket === latest.current && setError(e?.message || "Couldn't search right now."))
        .finally(() => ticket === latest.current && setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const term = q.trim().toLowerCase();
  const screens = useMemo(
    () => (term ? SCREENS.filter((s) => (!s.module || modules[s.module]) && `${s.label} ${s.keywords}`.toLowerCase().includes(term)) : []),
    [term, modules]
  );
  const waiting = useMemo(
    () => (term ? inbox.filter((i) => isDocTypeEnabled(i.doc_type, modules) && inboxText(i).includes(term)).slice(0, 8) : []),
    [term, inbox, modules]
  );

  const me = user?.userId;
  const awaitsMe = (id: string) => inbox.some((i) => i.id === id && i.current_step_actionable_by_me);
  // Waiting on me: the review screen (approve/reject). Otherwise read-only
  // progress for an advance; my own clearance opens like My Clearances does.
  const openAdvance = (a: Found) =>
    router.push(awaitsMe(a.id) ? { pathname: "/item/[id]", params: { id: a.id, docType: "ADVANCE", name: a.requester_name || "" } } : `/advance/${a.id}`);
  const openClaim = (c: Found) => {
    if (awaitsMe(c.id)) return router.push({ pathname: "/item/[id]", params: { id: c.id, docType: "CLAIM", name: c.requester_name || "" } });
    if (c.claimant_id === me) return router.push(c.status === "DRAFT" ? { pathname: "/new-clearance", params: { claim: c.id } } : "/my-clearances");
    Alert.alert("Clearance", "Open this clearance on the FlowDesk portal to see it in full.");
  };

  const nothing = term.length >= 2 && !searching && !screens.length && !waiting.length && found && !found.advances.length && !found.claims.length;
  const padX = { paddingHorizontal: gutter(layout.maxContentWidth, spacing.lg) };

  return (
    <View style={styles.screen}>
      <View style={[styles.boxWrap, padX]}>
        <View style={styles.box}>
          <SearchIcon size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={onChange}
            placeholder="Name, type, status, screen…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, padX]}>
        {!term && <Text style={styles.hint}>Find an advance or clearance by person, type or status, something in your Inbox, or a screen of the app.</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <Group title="Screens" show={screens.length > 0}>
          {screens.map((s, i) => (
            <Row key={s.label} first={i === 0} title={s.label} onPress={() => router.push(s.href)} />
          ))}
        </Group>

        <Group title="Waiting on you" show={waiting.length > 0}>
          {waiting.map((i, n) => (
            <Row key={`${i.doc_type}-${i.id}`} first={n === 0} title={inboxTitle(i)} sub={i.current_step_position_name || statusLabel(i.status)} onPress={() => router.push(inboxHref(i))} />
          ))}
        </Group>

        <Group title="Advances" show={Boolean(found?.advances.length)}>
          {found?.advances.map((a, n) => (
            <Row
              key={a.id}
              first={n === 0}
              title={`${String(a.type || "Advance").replace(/_/g, " ")}${a.requester_name ? ` · ${a.requester_name}` : ""}`}
              sub={new Date(a.created_at).toLocaleDateString()}
              status={a.status}
              onPress={() => openAdvance(a)}
            />
          ))}
        </Group>

        <Group title="Clearances" show={Boolean(found?.claims.length)}>
          {found?.claims.map((c, n) => (
            <Row
              key={c.id}
              first={n === 0}
              title={`Clearance${c.type ? ` · ${String(c.type).replace(/_/g, " ")}` : ""}${c.requester_name ? ` · ${c.requester_name}` : ""}`}
              sub={new Date(c.created_at).toLocaleDateString()}
              status={c.status}
              onPress={() => openClaim(c)}
            />
          ))}
        </Group>

        {nothing && <Text style={styles.hint}>Nothing matches &ldquo;{q.trim()}&rdquo;.</Text>}
      </ScrollView>
    </View>
  );
}

function Group({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  const styles = useStyles();
  if (!show) return null;
  return (
    <>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </>
  );
}

function Row({ title, sub, status, first, onPress }: { title: string; sub?: string; status?: string; first: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity style={[styles.row, !first && styles.rowBorder]} onPress={onPress} accessibilityRole="button">
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {status ? <StatusPill label={statusLabel(status)} tone={toneFor(status)} /> : null}
      <ChevronRight size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  boxWrap: { paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  box: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper1 },
  input: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.ink },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  hint: { color: colors.muted, fontSize: 13, textAlign: "center", marginTop: spacing.lg, lineHeight: 19 },
  error: { color: colors.bad, fontSize: 13, marginTop: spacing.sm },
  groupTitle: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 }
}));
