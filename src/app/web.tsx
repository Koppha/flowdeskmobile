import { Stack, useLocalSearchParams } from "expo-router";
import ServerPage from "@/components/ServerPage";

// Opens any screen of the server-built page by name - /web?go=phone - so the
// server can add screens (and point pushes at them) without an app release.
const TITLES: Record<string, string> = { phone: "Phone number", signature: "Saved signature", support: "Help & support" };

export default function WebScreen() {
  const { go } = useLocalSearchParams<{ go?: string }>();
  // Only a plain screen name; the page itself decides what it shows.
  const start = typeof go === "string" && /^[a-z0-9-]{1,40}$/.test(go) ? go : undefined;
  return (
    <>
      <Stack.Screen options={{ title: (start && TITLES[start]) || "FlowDesk" }} />
      <ServerPage section="account" start={start} />
    </>
  );
}
