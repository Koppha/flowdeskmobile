import { useEffect, useState } from "react";
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { BellRing, CircleHelp, Fingerprint, KeyRound, LogOut, Mail, PenLine, ScanFace } from "lucide-react-native";
import { api } from "@/lib/api";
import { enableNotifications } from "@/lib/notifications";
import { useAuth } from "@/context/auth-context";
import {
  AUTO_LOCK_OPTIONS,
  authenticate,
  capitalize,
  getAutoLockMs,
  isQuickUnlockEnabled,
  setAutoLockMs,
  setQuickUnlockEnabled,
  useUnlockMethod
} from "@/lib/biometrics";
import { Segmented, Select } from "@/components/form";
import { layout, makeStyles, radii, spacing, useTheme } from "@/theme";
import { sendTestNotification, TEST_DELAY_SECONDS, TEST_SCENARIOS, type TestScenario } from "@/lib/notifications";
import { Panes, useLayout } from "@/components/layout";

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
  const { colors, preference: theme, setPreference: setTheme } = useTheme();
  const styles = useStyles();
  const { user, logout } = useAuth();
  const method = useUnlockMethod();
  const [quickUnlock, setQuickUnlock] = useState<boolean | null>(null);
  const [lockAfter, setLockAfter] = useState<string | null>(null);
  const [notify, setNotify] = useState<{ email: boolean; push: boolean } | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const { gutter } = useLayout();

  useEffect(() => {
    isQuickUnlockEnabled().then(setQuickUnlock).catch(() => setQuickUnlock(true));
    getAutoLockMs().then((ms) => setLockAfter(String(ms)));
    api
      .notificationPrefs()
      .then(setNotify)
      .catch(() => setNotifyError("Couldn't load your notification settings."));
  }, []);

  async function changeNotify(kind: "email" | "push", on: boolean) {
    if (!notify) return;
    // At least one channel must stay on, or approvals would go unnoticed.
    if (!on && !notify[kind === "email" ? "push" : "email"]) {
      Alert.alert(
        "Keep one on",
        `You need at least one way to hear about approvals. Turn on ${kind === "email" ? "push" : "email"} notifications first, then you can turn ${kind} off.`
      );
      return;
    }
    if (kind === "push" && on && !(await enableNotifications())) {
      Alert.alert("Push notifications", "Allow notifications for FlowDesk in your phone's settings first.");
      return;
    }
    const previous = notify;
    setNotify({ ...notify, [kind]: on });
    try {
      setNotify(await api.setNotificationPrefs({ [kind]: on }));
      setNotifyError(null);
    } catch {
      setNotify(previous);
      setNotifyError("Couldn't save - check your connection and try again.");
    }
  }

  async function changeLockAfter(value: string) {
    await setAutoLockMs(Number(value));
    setLockAfter(value);
  }

  const noScreenLock = method?.kind === "none";
  const UnlockIcon = method?.kind === "face" ? ScanFace : method?.kind === "passcode" ? KeyRound : Fingerprint;
  const unlockLabel = method && !noScreenLock ? capitalize(method.label) : "fingerprint or PIN";

  async function changeQuickUnlock(next: boolean) {
    if (next) {
      // Prove it's the owner before trusting this phone's lock with the session.
      const result = await authenticate("Turn on quick unlock");
      if (!result.ok) {
        if (result.error) Alert.alert("Quick unlock", result.error);
        return;
      }
      await setQuickUnlockEnabled(true);
      setQuickUnlock(true);
      return;
    }
    Alert.alert("Turn off quick unlock?", "FlowDesk will ask for your password every time you open it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Turn off",
        style: "destructive",
        onPress: async () => {
          await setQuickUnlockEnabled(false);
          setQuickUnlock(false);
        }
      }
    ]);
  }

  const padX = { paddingHorizontal: gutter(layout.maxWideWidth, spacing.xl) };

  return (
    <ScrollView style={styles.screen}>
      <View style={[styles.header, padX]}>
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

      <View style={[styles.section, padX]}>
        <Panes
          left={
            <>
        <Text style={styles.sectionLabel}>Security</Text>
        <View style={[styles.card, styles.cardSpacing]}>
          <View style={styles.row}>
            <UnlockIcon size={18} color={colors.muted} strokeWidth={1.8} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Unlock with {unlockLabel}</Text>
              <Text style={styles.rowHint}>
                {noScreenLock
                  ? "Set up a screen lock in your phone's settings to use this."
                  : quickUnlock === false
                    ? "Off - you'll sign in with your password each time."
                    : "Opens FlowDesk without your password. Locks again after 5 minutes away."}
              </Text>
            </View>
            <Switch
              value={Boolean(quickUnlock) && !noScreenLock}
              onValueChange={changeQuickUnlock}
              disabled={quickUnlock === null || method === null || noScreenLock}
              trackColor={{ true: colors.accent }}
              accessibilityLabel={`Unlock with ${unlockLabel}`}
            />
          </View>
          {quickUnlock && !noScreenLock && (
            <View style={[styles.settingBlock, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Lock FlowDesk</Text>
              <Text style={[styles.rowHint, styles.settingHint]}>When you leave the app, ask for your {unlockLabel.toLowerCase()} again…</Text>
              <Select
                value={lockAfter}
                options={AUTO_LOCK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={changeLockAfter}
                title="Lock FlowDesk"
                searchable={false}
              />
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={[styles.card, styles.cardSpacing]}>
          <View style={styles.row}>
            <BellRing size={18} color={colors.muted} strokeWidth={1.8} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Push notifications</Text>
              <Text style={styles.rowHint}>On this phone when something needs your approval.</Text>
            </View>
            <Switch
              value={Boolean(notify?.push)}
              onValueChange={(v) => changeNotify("push", v)}
              disabled={!notify}
              trackColor={{ true: colors.accent }}
              accessibilityLabel="Push notifications"
            />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <Mail size={18} color={colors.muted} strokeWidth={1.8} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Email notifications</Text>
              <Text style={styles.rowHint}>Approval requests and status updates, with approve/reject links.</Text>
            </View>
            <Switch
              value={Boolean(notify?.email)}
              onValueChange={(v) => changeNotify("email", v)}
              disabled={!notify}
              trackColor={{ true: colors.accent }}
              accessibilityLabel="Email notifications"
            />
          </View>
          {notifyError && <Text style={[styles.rowHint, styles.notifyError]}>{notifyError}</Text>}
          <Text style={[styles.rowHint, styles.notifyNote]}>Choose at least one - you can have both.</Text>
        </View>
            </>
          }
          right={
            <>
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={[styles.card, styles.cardSpacing, styles.settingBlock]}>
          <Segmented
            value={theme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" }
            ]}
            onChange={setTheme}
          />
          <Text style={[styles.rowHint, styles.settingHint]}>
            {theme === "system" ? "Follows your phone's light/dark setting." : `Always ${theme}.`}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
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
            </>
          }
        />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  section: { paddingTop: spacing.lg },
  sectionLabel: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  devLabel: { marginTop: spacing.lg },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.ink },
  rowText: { flex: 1 },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardSpacing: { marginBottom: spacing.lg },
  notifyNote: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  notifyError: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, color: colors.warn },
  settingBlock: { padding: spacing.lg, gap: spacing.sm },
  settingHint: { marginTop: 0, marginBottom: 2 },
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
}));
