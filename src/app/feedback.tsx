import { useState } from "react";
import { Alert, Platform, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Star } from "lucide-react-native";
import { api } from "@/lib/api";
import { Input, PrimaryButton } from "@/components/form";
import { KeyboardAvoider, KeyboardScrollView } from "@/components/keyboard";
import { useLayout } from "@/components/layout";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";

const RATING_WORDS = ["", "Poor", "Could be better", "Okay", "Good", "Great"];

// Profile > Leave feedback. Sent as a message in the person's Help & support
// chat (no new server API): the admins see it in the Support inbox and can
// reply in that chat. The app version and phone go with it.
export default function FeedbackScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { gutter } = useLayout();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!rating && !text.trim()) {
      setError("Pick a rating or write a few words");
      return;
    }
    setError(null);
    setSending(true);
    const phone = [Device.brand, Device.modelName].filter(Boolean).join(" ");
    const about = [`FlowDesk Mobile ${Constants.expoConfig?.version ?? ""}`.trim(), phone, `${Platform.OS === "ios" ? "iOS" : "Android"} ${Device.osVersion ?? ""}`.trim()]
      .filter(Boolean)
      .join(" · ");
    const lines = ["App feedback", rating ? `Rating: ${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}/5)` : null, text.trim() || null, `(${about})`];
    try {
      await api.sendFeedback(lines.filter(Boolean).join("\n"));
      Alert.alert("Thank you", "Your feedback was sent to the FlowDesk team. If they reply, you'll see it in Help & support.");
      router.back();
    } catch (e: any) {
      setError(e?.message || "Couldn't send - check your connection and try again.");
      setSending(false);
    }
  }

  return (
    <KeyboardAvoider>
      <KeyboardScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter(layout.maxWideWidth) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>How is FlowDesk Mobile working for you?</Text>
        <Text style={styles.hint}>Tell us what you like, what&apos;s missing or what went wrong. The FlowDesk team reads every message.</Text>

        <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setRating(n === rating ? 0 : n)}
              hitSlop={6}
              accessibilityRole="radio"
              accessibilityState={{ selected: n === rating }}
              accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
            >
              <Star size={34} color={n <= rating ? colors.warn : colors.muted} fill={n <= rating ? colors.warn : "transparent"} strokeWidth={1.6} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ratingWord}>{RATING_WORDS[rating] || "Tap a star"}</Text>

        <Input value={text} onChangeText={setText} placeholder="Your feedback (optional)" multiline maxLength={3500} style={styles.textarea} />

        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.button}>
          <PrimaryButton label={sending ? "Sending…" : "Send feedback"} onPress={send} disabled={sending} />
        </View>
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  hint: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  stars: { flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: spacing.xl },
  ratingWord: { textAlign: "center", fontSize: 13, color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.lg },
  textarea: { minHeight: 120, borderRadius: radii.md },
  error: { color: colors.bad, fontSize: 12.5, marginTop: spacing.sm },
  button: { marginTop: spacing.lg }
}));
