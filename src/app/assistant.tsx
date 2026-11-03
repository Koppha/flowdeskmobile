import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Check, CircleHelp, FileText, History, Inbox, MapPin, Smartphone, Sparkles, SquarePen, Trash2, type LucideIcon } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { streamAssistantChat } from "@/lib/assistant";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

// The FlowDesk AI Assistant, the same assistant as the web portal's side
// panel: answers stream from POST /ai/assistant/chat and only use what the
// signed-in person can already see. It can save drafts (never submit) - an
// "Open" button appears when it does. Which AI service answers, the daily
// limit and who may use it are all set on the portal.

type Msg = { role: "user" | "assistant"; text: string; notes?: string[]; drafts?: { kind: string; id: string; label: string }[]; error?: boolean };
type Conv = { id: string; title: string | null; updated_at: string };
type Status = { configured: boolean; enabled?: boolean; daily_limit: number; used_today: number };
type Suggestion = { icon: LucideIcon; title: string; hint: string; ask: string };

const SUGGESTIONS: Suggestion[] = [
  { icon: FileText, title: "How many advances do I have?", hint: "Totals and what's not cleared", ask: "How many advances do I have, and how many are not cleared?" },
  { icon: Inbox, title: "What's waiting for my approval?", hint: "Your Approval Inbox", ask: "What's waiting for my approval?" },
  { icon: MapPin, title: "Where is my latest advance?", hint: "Who it's with and since when", ask: "Where is my latest advance?" },
  { icon: CircleHelp, title: "How do I clear an advance?", hint: "Step-by-step help", ask: "How do I clear an advance?" }
];
const ADMIN_SUGGESTION: Suggestion = { icon: Smartphone, title: "How many people use the app?", hint: "Users and mobile app usage", ask: "How many users are active, and how many use the mobile app?" };

export default function AssistantScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { user } = useAuth();
  const { gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Conv[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    api.assistantStatus().then(setStatus).catch((e: Error & { status?: number }) => {
      setStatusError(e.status === 403 ? "The AI Assistant isn't available to your account. An administrator can give access from Roles & Permissions." : e.message || "Couldn't reach the assistant.");
    });
    // Leaving the screen stops an answer that is still coming in.
    return () => abortRef.current?.abort();
  }, []);

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  }

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (!next) return;
    setHistory(null);
    try {
      setHistory((await api.assistantConversations()).items || []);
    } catch {
      setHistory([]);
    }
  }

  async function openConversation(id: string) {
    if (busy) return;
    try {
      const c = await api.assistantConversation(id);
      setConversationId(id);
      setMessages((c.messages || []).map((m) => ({ role: m.role, text: m.text })));
      setShowHistory(false);
    } catch (e: any) {
      Alert.alert("Couldn't open it", e?.message || "Try again.");
    }
  }

  function deleteConversation(c: Conv) {
    Alert.alert("Delete conversation?", c.title || "Conversation", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.deleteAssistantConversation(c.id).catch(() => {});
          setHistory((h) => (h || []).filter((x) => x.id !== c.id));
          if (conversationId === c.id) newChat();
        }
      }
    ]);
  }

  function openDraft(kind: string, id: string) {
    if (kind === "advance") router.push(`/advance/${id}`);
    else router.push("/my-clearances");
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setShowHistory(false);
    setMessages((m) => [...m, { role: "user", text: question }, { role: "assistant", text: "", notes: [] }]);
    const patchLast = (fn: (m: Msg) => Msg) => setMessages((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamAssistantChat(
        question,
        conversationId,
        (ev) => {
          if (ev.type === "conversation") setConversationId(ev.id);
          else if (ev.type === "text") patchLast((m) => ({ ...m, text: m.text + ev.delta }));
          else if (ev.type === "tool") patchLast((m) => ({ ...m, notes: [...(m.notes || []), ev.label] }));
          else if (ev.type === "draft") patchLast((m) => ({ ...m, drafts: [...(m.drafts || []), { kind: ev.kind, id: ev.id, label: ev.label }] }));
          else if (ev.type === "error") patchLast((m) => ({ ...m, text: (m.text ? m.text + "\n\n" : "") + ev.message, error: true }));
        },
        controller.signal
      );
      setStatus((s) => (s ? { ...s, used_today: s.used_today + 1 } : s));
    } catch (e: any) {
      if (e?.name !== "AbortError" && !controller.signal.aborted) patchLast((m) => ({ ...m, text: e?.message || "Something went wrong.", error: true }));
    } finally {
      if (abortRef.current === controller) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  }

  const notConfigured = Boolean(status && !status.configured);
  const switchedOff = status?.enabled === false;
  const left = status ? Math.max(0, status.daily_limit - status.used_today) : null;
  const suggestions = user?.role === "ADMIN" ? [SUGGESTIONS[0], SUGGESTIONS[1], ADMIN_SUGGESTION, SUGGESTIONS[3]] : SUGGESTIONS;
  const canAsk = Boolean(status && !notConfigured);
  const padX = { paddingHorizontal: gutter(layout.maxContentWidth, spacing.lg) };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={[styles.toolbar, padX]}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: !status ? colors.muted : canAsk ? colors.good : colors.bad }]} />
          <Text style={styles.statusText}>{statusError ? "Unavailable" : !status ? "Connecting…" : switchedOff ? "Switched off" : notConfigured ? "Not set up" : "Online"}</Text>
        </View>
        <TouchableOpacity onPress={() => void toggleHistory()} style={[styles.toolButton, showHistory && styles.toolButtonOn]} hitSlop={8} accessibilityLabel="Past conversations">
          <History size={18} color={showHistory ? colors.accent : colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity onPress={newChat} style={styles.toolButton} hitSlop={8} accessibilityLabel="New conversation">
          <SquarePen size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {showHistory && (
        <View style={[styles.history, padX]}>
          {history === null ? (
            <ActivityIndicator color={colors.accent} style={{ padding: spacing.md }} />
          ) : history.length === 0 ? (
            <Text style={styles.historyEmpty}>No past conversations.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {history.map((c) => (
                <View key={c.id} style={styles.historyRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => void openConversation(c.id)}>
                    <Text style={[styles.historyTitle, c.id === conversationId && { color: colors.accent }]} numberOfLines={1}>{c.title || "Conversation"}</Text>
                    <Text style={styles.historyWhen}>{new Date(c.updated_at).toLocaleString()}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteConversation(c)} hitSlop={10} accessibilityLabel="Delete conversation">
                    <Trash2 size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, padX]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.welcome}>
            <View style={styles.hero}>
              <Sparkles size={28} color={colors.accent} />
            </View>
            {statusError ? (
              <>
                <Text style={styles.welcomeTitle}>The assistant is unavailable</Text>
                <Text style={styles.welcomeText}>{statusError}</Text>
              </>
            ) : !status ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
            ) : notConfigured ? (
              <>
                <Text style={styles.welcomeTitle}>{switchedOff ? "The assistant is switched off" : "The assistant isn't set up yet"}</Text>
                <Text style={styles.welcomeText}>
                  {switchedOff ? "An administrator has turned it off for now." : "An administrator needs to connect it to an AI service on the portal (Settings > AI Assistant)."}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.welcomeTitle}>What would you like to know?</Text>
                <Text style={styles.welcomeText}>Ask in plain language about your advances, clearances and approvals, or how anything in FlowDesk works.</Text>
                <View style={styles.cards}>
                  {suggestions.map((s) => (
                    <TouchableOpacity key={s.title} style={styles.card} onPress={() => void ask(s.ask)} disabled={busy}>
                      <View style={styles.cardIcon}>
                        <s.icon size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{s.title}</Text>
                        <Text style={styles.cardHint}>{s.hint}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.disclaimer}>AI-generated from the FlowDesk records you can see. Check before acting on it.</Text>
              </>
            )}
          </View>
        ) : (
          messages.map((m, i) => {
            const last = i === messages.length - 1;
            if (m.role === "user") {
              return (
                <View key={i} style={styles.userBubble}>
                  <Text style={styles.userText} selectable>{m.text}</Text>
                </View>
              );
            }
            const notes = m.notes || [];
            return (
              <View key={i} style={[styles.aiBubble, m.error && styles.aiBubbleError]}>
                {notes.map((n, j) => (
                  <View key={j} style={styles.note}>
                    {busy && last && j === notes.length - 1 && !m.text ? <ActivityIndicator size="small" color={colors.muted} /> : <Check size={12} color={colors.good} />}
                    <Text style={styles.noteText}>{n}</Text>
                  </View>
                ))}
                {m.text ? (
                  <Formatted text={m.text} />
                ) : busy && last && !notes.length ? (
                  <View style={styles.note}>
                    <ActivityIndicator size="small" color={colors.muted} />
                    <Text style={styles.noteText}>Thinking…</Text>
                  </View>
                ) : null}
                {(m.drafts || []).map((d) => (
                  <TouchableOpacity key={d.id} style={styles.draftButton} onPress={() => openDraft(d.kind, d.id)}>
                    <Text style={styles.draftText}>Open {d.label} →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.composer, padX, { paddingBottom: spacing.md + insets.bottom }]}>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={canAsk ? "Ask about FlowDesk or your requests…" : "Not available"}
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={canAsk && !busy}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.send, (!canAsk || busy || !input.trim()) && styles.sendOff]}
            onPress={() => void ask(input)}
            disabled={!canAsk || busy || !input.trim()}
            accessibilityLabel="Send"
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <ArrowUp size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
        {left !== null && canAsk && (
          <Text style={styles.hint}>
            {left} question{left === 1 ? "" : "s"} left today · verify before acting
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// Minimal, safe formatting for answers: paragraphs, headings, bullet and
// numbered lists, simple | tables | and **bold** - as Text, never as HTML.
function Inline({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style} selectable>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <Text key={i} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</Text> : p))}
    </Text>
  );
}

function Formatted({ text }: { text: string }) {
  const styles = useStyles();
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;
  const flush = () => {
    if (table) {
      const [head, ...rows] = table;
      blocks.push(
        <ScrollView key={blocks.length} horizontal style={styles.tableWrap} showsHorizontalScrollIndicator={false}>
          <View>
            {[head, ...rows].map((r, i) => (
              <View key={i} style={[styles.tableRow, i === 0 && styles.tableHead]}>
                {r.map((c, j) => (
                  // A "#" or other very short header gets a narrow column.
                  <View key={j} style={[styles.tableCell, (head[j] || "").length <= 2 && { width: 44 }]}>
                    <Inline text={c} style={[styles.answer, i === 0 && { fontWeight: "700" }]} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
      table = null;
    }
    if (!list) return;
    const ordered = list.ordered;
    blocks.push(
      <View key={blocks.length} style={styles.list}>
        {list.items.map((it, i) => (
          <View key={i} style={styles.listItem}>
            <Text style={styles.answer}>{ordered ? `${i + 1}.` : "•"}</Text>
            <Inline text={it} style={[styles.answer, { flex: 1 }]} />
          </View>
        ))}
      </View>
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("|")) {
      if (list) flush();
      // The |---|---| line under the header carries no content.
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-")) continue;
      (table ??= []).push(line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      continue;
    }
    if (table) flush();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(<Inline key={blocks.length} text={heading ? heading[1] : line} style={[styles.answer, styles.paragraph, heading && { fontWeight: "700" }]} />);
  }
  flush();
  return <>{blocks}</>;
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12.5, color: colors.muted, fontWeight: "600" },
  toolButton: { padding: 8, borderRadius: radii.sm },
  toolButtonOn: { backgroundColor: colors.accentSoft },
  history: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.xs },
  historyEmpty: { fontSize: 13, color: colors.muted, paddingVertical: spacing.md },
  historyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  historyWhen: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  body: { flex: 1 },
  bodyContent: { paddingVertical: spacing.lg, gap: spacing.md },
  welcome: { alignItems: "center", paddingTop: spacing.xl },
  hero: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  welcomeTitle: { marginTop: spacing.lg, fontSize: 18, fontWeight: "700", color: colors.ink, textAlign: "center" },
  welcomeText: { marginTop: 6, fontSize: 13.5, color: colors.muted, textAlign: "center", lineHeight: 19 },
  cards: { alignSelf: "stretch", marginTop: spacing.xl, gap: spacing.sm },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  cardIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  cardTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  cardHint: { fontSize: 12, color: colors.muted, marginTop: 1 },
  disclaimer: { marginTop: spacing.lg, fontSize: 11.5, color: colors.muted, textAlign: "center" },
  userBubble: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.accent, borderRadius: radii.lg, borderBottomRightRadius: 4, paddingVertical: 9, paddingHorizontal: 13 },
  userText: { color: "#fff", fontSize: 14.5, lineHeight: 20 },
  aiBubble: { alignSelf: "stretch", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, borderBottomLeftRadius: 4, paddingVertical: 10, paddingHorizontal: 13 },
  aiBubbleError: { backgroundColor: colors.badSoft, borderColor: colors.bad },
  note: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  noteText: { fontSize: 12.5, color: colors.muted },
  answer: { fontSize: 14.5, lineHeight: 21, color: colors.ink },
  paragraph: { marginVertical: 3 },
  list: { marginVertical: 3, gap: 3 },
  listItem: { flexDirection: "row", gap: 6, paddingLeft: 4 },
  tableWrap: { marginVertical: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHead: { backgroundColor: colors.paper1 },
  tableCell: { width: 130, paddingVertical: 6, paddingHorizontal: 8 },
  draftButton: { alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: colors.accentSoft },
  draftText: { color: colors.accent, fontWeight: "700", fontSize: 13.5 },
  composer: { paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 14.5, color: colors.ink, backgroundColor: colors.paper1 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  sendOff: { opacity: 0.45 },
  hint: { marginTop: 6, fontSize: 11.5, color: colors.muted, textAlign: "center" }
}));
