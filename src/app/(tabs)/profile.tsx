import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Bell, BellRing, CircleHelp, LogOut, PenLine } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { sendTestNotification, TEST_DELAY_SECONDS, TEST_SCENARIOS, type TestScenario } from "@/lib/notifications";
import { colors, radii, spacing } from "@/theme";

async function fireTest(scenario: TestScenario) {
  const result = await sendTestNotification(scenario);
  if (result.ok) Alert.alert("Test notification", `Arriving in ${TEST_DELAY_SECONDS}s - background the app to see it in the tray.`);
  else Alert.alert("Test notification", result.error);
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>{initials(user?.fullName || "")}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{user?.fullName || "—"}</Text>
          <Text style={styles.meta}>
            {[user?.department, user?.employeeNo].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Bell size={18} color={colors.muted} strokeWidth={1.8} />
            <Text style={styles.rowLabel}>Notifications</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <PenLine size={18} color={colors.muted} strokeWidth={1.8} />
            <Text style={styles.rowLabel}>Saved signature</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <CircleHelp size={18} color={colors.muted} strokeWidth={1.8} />
            <Text style={styles.rowLabel}>Help &amp; support</Text>
          </View>
        </View>

        {__DEV__ && (
          <>
            <Text style={[styles.sectionLabel, styles.devLabel]}>Test notifications (dev only)</Text>
            <View style={styles.card}>
              {TEST_SCENARIOS.map((s, i) => (
                <TouchableOpacity key={s.key} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => fireTest(s.key)}>
                  <BellRing size={18} color={colors.muted} strokeWidth={1.8} />
                  <Text style={styles.rowLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.logoutRow} onPress={logout}>
          <LogOut size={18} color={colors.bad} strokeWidth={1.8} />
          <Text style={styles.logoutLabel}>Log out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarLabel: { color: "#fff", fontSize: 20, fontWeight: "700" },
  headerText: { flex: 1 },
  name: { fontSize: 17, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  devLabel: { marginTop: spacing.lg },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.ink },
  logoutRow: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg
  },
  logoutLabel: { fontSize: 14, fontWeight: "600", color: colors.bad }
});
