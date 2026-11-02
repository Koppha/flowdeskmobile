import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Download } from "lucide-react-native";
import { availableUpdate, downloadAndInstall, installedVersion } from "@/lib/app-update";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

// "Update available" on Home when the portal has a newer release than this
// app - one tap downloads it and opens Android's installer.
export default function UpdateBanner() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [update, setUpdate] = useState<{ version: string; sizeBytes: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      availableUpdate().then(setUpdate).catch(() => setUpdate(null));
    }, [])
  );

  if (!update) return null;
  const size = update.sizeBytes ? ` · ${Math.round(update.sizeBytes / 1048576)} MB` : "";

  async function install() {
    if (!update) return;
    setBusy(true);
    try {
      await downloadAndInstall(update.version);
    } catch (e: any) {
      Alert.alert("Couldn't update", `${e?.message || "The download failed."} You can also get it from Get the App on the FlowDesk portal.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Download size={18} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Update available</Text>
        <Text style={styles.sub}>FlowDesk {update.version}{size} · you have {installedVersion}</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={install} disabled={busy} accessibilityRole="button" accessibilityLabel={`Update to ${update.version}`}>
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonLabel}>Update</Text>}
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg
  },
  icon: { width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  button: { backgroundColor: colors.accent, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minWidth: 84, alignItems: "center" },
  buttonLabel: { color: "#fff", fontWeight: "700", fontSize: 14 }
}));
