import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Monitor, ShieldAlert } from "lucide-react-native";
import { api, type MfaPending } from "@/lib/api";
import { authenticate, getUnlockMethod } from "@/lib/biometrics";
import { formatWhen } from "@/lib/request-forms";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";
import { useLayout } from "@/components/layout";

// A portal sign-in waiting for this phone's OK (two-step sign-in, backend
// lib/mfa.ts). Opened from the push, or Home's "Approve your sign-in" card.
// Approving needs the phone's fingerprint / face / PIN, so a phone left
// unlocked on a desk can't approve for its owner.

function browserOf(ua: string | null) {
  if (!ua) return "A web browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A web browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} on ${os}` : browser;
}

export default function ApproveSignInScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { gutter } = useLayout();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [items, setItems] = useState<MfaPending[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.mfaPending()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e?.message || "Couldn't load sign-in requests"));
  }, []);
  useFocusEffect(load);

  async function decide(item: MfaPending, approve: boolean) {
    if (approve && (await getUnlockMethod()).kind !== "none") {
      const r = await authenticate("Approve your FlowDesk sign-in");
      if (!r.ok) return;
    }
    setBusy(item.id);
    try {
      await api.mfaDecide(item.id, approve);
      if (approve) {
        Alert.alert("Approved", "You're signed in on the portal.");
      } else {
        Alert.alert("Denied", "That sign-in was blocked. If it wasn't you, someone knows your password - change it now and tell IT.");
      }
      const rest = (items || []).filter((i) => i.id !== item.id);
      if (rest.length) setItems(rest);
      else router.back();
    } catch (e: any) {
      setError(e?.message || "Couldn't send your answer");
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!items) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.hint}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  // The one from the push first.
  const sorted = [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxContentWidth) }]}>
      {sorted.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>Nothing to approve</Text>
          <Text style={styles.hint}>This sign-in request has expired or was already answered. Requests last 5 minutes.</Text>
        </View>
      )}
      {sorted.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.titleRow}>
            <Monitor size={22} color={colors.accent} />
            <Text style={styles.title}>Is this you signing in?</Text>
          </View>
          <Text style={styles.detail}>{browserOf(item.user_agent)}</Text>
          {item.ip ? <Text style={styles.hint}>From {item.ip}</Text> : null}
          <Text style={styles.hint}>{formatWhen(item.created_at)} · FlowDesk portal</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.deny]} onPress={() => decide(item, false)} disabled={busy !== null}>
              <Text style={styles.buttonLabel}>No, deny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.approve]} onPress={() => decide(item, true)} disabled={busy !== null}>
              <Text style={styles.buttonLabel}>{busy === item.id ? "Sending…" : "Yes, approve"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <View style={styles.note}>
        <ShieldAlert size={16} color={colors.muted} />
        <Text style={[styles.hint, styles.noteText]}>Only approve if you are signing in right now. FlowDesk will never ask you to approve for someone else.</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.paper1 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: "700", color: colors.ink },
  detail: { fontSize: 15, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  button: { flex: 1, paddingVertical: 13, borderRadius: radii.md, alignItems: "center" },
  deny: { backgroundColor: colors.bad },
  approve: { backgroundColor: colors.good },
  buttonLabel: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  note: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", paddingHorizontal: 4 },
  noteText: { flex: 1 },
  error: { color: colors.bad, fontSize: 13 }
}));
