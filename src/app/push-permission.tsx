import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { enableNotifications } from "@/lib/notifications";
import { makeStyles, radii } from "@/theme";

export default function PushPermissionScreen() {
  const styles = useStyles();
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  async function continueToApp() {
    setAsking(true);
    try {
      await enableNotifications();
    } finally {
      router.replace("/(tabs)");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.iconBadge}>
        <Bell size={24} color="#fff" strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>Stay on top of approvals</Text>
      <Text style={styles.body}>
        Notifications may include alerts about approvals waiting for you, sent even when the app is closed.
      </Text>

      <TouchableOpacity style={styles.primaryButton} onPress={continueToApp} disabled={asking}>
        <Text style={styles.primaryLabel}>{asking ? "One moment…" : "Enable notifications"}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.replace("/(tabs)")} disabled={asking}>
        <Text style={styles.skipLabel}>Not now</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1, alignItems: "center", justifyContent: "center", padding: 32 },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18
  },
  title: { fontSize: 19, fontWeight: "700", color: colors.ink, textAlign: "center" },
  body: { marginTop: 8, fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 19, maxWidth: 300 },
  primaryButton: {
    marginTop: 26,
    width: "100%",
    maxWidth: 420,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: "center"
  },
  primaryLabel: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  skipLabel: { marginTop: 14, fontSize: 13, color: colors.muted }
}));
