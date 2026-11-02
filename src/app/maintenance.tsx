import { useLocalSearchParams } from "expo-router";
import ServerPage from "@/components/ServerPage";

// Maintenance requests - a server-built page (see ServerPage). ?req=<id>
// opens a request straight away (inbox, push).
export default function MaintenanceScreen() {
  const { req } = useLocalSearchParams<{ req?: string }>();
  return <ServerPage section="maintenance" requestId={req} />;
}
