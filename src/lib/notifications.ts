import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { api, type InboxItem } from "./api";

// Every FlowDesk notification is { title, body,
// data: { url } }, where url is an Expo Router path (e.g.
// "/item/123?docType=ADVANCE"). Remote pushes from the backend (Expo's push
// service - see the FlowDesk Mobile write-up's Notification delivery
// section) and the local ones posted below share that shape, so the tap
// handling in useNotificationRouting() covers both.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

// Also set as expo-notifications' defaultChannel in app.json, so remote
// pushes that don't name a channel land here rather than Expo's fallback.
const CHANNEL = "default";
let granted: boolean | null = null;
let pushToken: string | null = null;

/**
 * Ask once, at a moment that explains itself (the post-login
 * push-permission screen). Resolves to whether notifications may be shown,
 * and registers this device's push token with the backend when allowed.
 * Safe to call repeatedly.
 */
export async function enableNotifications(): Promise<boolean> {
  if (granted !== null) return granted;
  if (Platform.OS === "web") return (granted = false);

  // Android 13+ only shows the permission prompt once a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Approvals & updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#283889"
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  granted = status === "granted";
  if (granted) void registerForPush();
  return granted;
}

/** Expo push token for this device, or null until registered (needs an EAS project ID and a real device). */
export const getPushToken = () => pushToken;

async function registerForPush() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return; // run `eas init` to add one to app.json
  try {
    pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.registerPushToken(pushToken);
  } catch {
    // Emulators can't get a push token, and a failed registration is
    // non-fatal - the app still works, just without remote alerts.
  }
}

/** Show a notification, now or after `delaySeconds`. Returns false when notifications are off, so callers can fall back to in-app UI. */
export async function notify(title: string, body: string, url?: string, delaySeconds?: number): Promise<boolean> {
  if (!granted) return false;
  // `{ channelId }` = show now, on our channel (a bare `null` trigger uses Expo's fallback channel on Android).
  const trigger: Notifications.NotificationTriggerInput = delaySeconds
    ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds, channelId: CHANNEL }
    : { channelId: CHANNEL };
  await Notifications.scheduleNotificationAsync({ content: { title, body, data: url ? { url } : {} }, trigger });
  return true;
}

/**
 * Open the screen a notification points at, including when the tap launched
 * the app. A tap can arrive while the user is still on Login/Unlock, so the
 * URL is held until `ready` (signed in and past the auth screens).
 */
export function useNotificationRouting(ready: boolean) {
  const readyRef = useRef(ready);
  const pendingUrl = useRef<string | null>(null);

  useEffect(() => {
    readyRef.current = ready;
    if (ready && pendingUrl.current) {
      openUrl(pendingUrl.current);
      pendingUrl.current = null;
    }
  }, [ready]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    function handle(n: Notifications.Notification | undefined) {
      const url = n?.request.content.data?.url;
      if (typeof url !== "string") return;
      if (readyRef.current) openUrl(url);
      else pendingUrl.current = url;
    }
    handle(Notifications.getLastNotificationResponse()?.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handle(r.notification));
    return () => sub.remove();
  }, []);
}

function openUrl(url: string) {
  router.push(url as Href);
  // Otherwise the same tap would re-open this screen on every reload.
  Notifications.clearLastNotificationResponse();
}

// ---------------------------------------------------------------------------
// Dev-only test scenarios. Emulators can't receive remote push, so these post
// a local notification with the same title/body/url a backend push would
// carry.

export type TestScenario = "approval" | "advanceApproved" | "clearanceDue";

export const TEST_SCENARIOS: { key: TestScenario; label: string }[] = [
  { key: "approval", label: "Approval request" },
  { key: "advanceApproved", label: "Advance approved" },
  { key: "clearanceDue", label: "Clearance reminder" }
];

// Long enough to background the app and see it arrive in the system tray.
export const TEST_DELAY_SECONDS = 5;

type Content = { title: string; body: string; url: string };

async function approvalContent(): Promise<Content> {
  let item: InboxItem | undefined;
  try {
    const { items } = await api.inbox();
    item = items.find((i) => i.current_step_actionable_by_me && i.doc_type !== "CUSTOM_REQUEST");
  } catch {
    // Fall through to the generic inbox version below.
  }
  if (item?.doc_type === "ADVANCE") {
    return {
      title: "Advance awaiting your approval",
      body: `${item.requester_name} · M${Number(item.requested_total).toFixed(2)}`,
      url: `/item/${item.id}?docType=ADVANCE`
    };
  }
  if (item?.doc_type === "CLAIM") {
    return {
      title: "Clearance claim awaiting your approval",
      body: `${item.claimant_name} · M${Number(item.claim_total).toFixed(2)}`,
      url: `/item/${item.id}?docType=CLAIM`
    };
  }
  // Nothing actionable in this account's inbox - still exercise the flow.
  return { title: "New request awaiting your approval", body: "Open your inbox to review it.", url: "/inbox" };
}

const STATIC_CONTENT: Record<Exclude<TestScenario, "approval">, Content> = {
  advanceApproved: {
    title: "Your advance was approved",
    body: "Your advance request has been fully approved and is ready for payment.",
    url: "/my-advances"
  },
  clearanceDue: {
    title: "Clearance due",
    body: "Submit your clearance for your last advance before the deadline.",
    url: "/my-clearances"
  }
};

export async function sendTestNotification(scenario: TestScenario): Promise<{ ok: boolean; error?: string }> {
  if (!(await enableNotifications())) return { ok: false, error: "Notifications are off for FlowDesk" };
  const { title, body, url } = scenario === "approval" ? await approvalContent() : STATIC_CONTENT[scenario];
  await notify(title, body, url, TEST_DELAY_SECONDS);
  return { ok: true };
}
