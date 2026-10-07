import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Home, Inbox, User, type LucideIcon } from "lucide-react-native";
import { api } from "@/lib/api";
import { colors } from "@/theme";

type TabKey = "home" | "inbox" | "profile";
type TabConfig = { key: TabKey; enabled: boolean };

const DEFAULT_TABS: TabConfig[] = [
  { key: "home", enabled: true },
  { key: "inbox", enabled: true },
  { key: "profile", enabled: true }
];

// Route name (file under this (tabs) group) + title + icon per tab key -
// GET /admin/mobile-config only says which are enabled and in what order;
// everything else about a tab stays fixed here.
const TAB_META: Record<TabKey, { route: string; title: string; icon: LucideIcon }> = {
  home: { route: "index", title: "Home", icon: Home },
  inbox: { route: "inbox", title: "Inbox", icon: Inbox },
  profile: { route: "profile", title: "Profile", icon: User }
};

export default function TabsLayout() {
  const [tabs, setTabs] = useState<TabConfig[]>(DEFAULT_TABS);

  useEffect(() => {
    api.mobileConfig()
      .then((r) => {
        const fetched = (r as any)?.tabs as TabConfig[] | undefined;
        // Fail-safe: never actually hide every tab, even if a bad config
        // somehow made it past the admin API's own "at least one" guard.
        if (Array.isArray(fetched) && fetched.length && fetched.some((t) => t.enabled)) {
          setTabs(fetched);
        }
      })
      .catch(() => {
        // Keep the default (all three visible) if the config can't be
        // fetched - never leave the app with no way to navigate.
      });
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "#9aa3b5",
        tabBarStyle: { borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "700" }
      }}
    >
      {tabs.map((t) => {
        const meta = TAB_META[t.key];
        return (
          <Tabs.Screen
            key={t.key}
            name={meta.route}
            options={{
              title: meta.title,
              tabBarIcon: ({ color, size }) => <meta.icon color={color} size={size} />,
              // Hides the tab bar button when disabled (Expo Router's
              // documented pattern) without unregistering the route - the
              // screen stays reachable, it just isn't the initial route's
              // problem to solve.
              href: t.enabled ? undefined : null
            }}
          />
        );
      })}
    </Tabs>
  );
}
