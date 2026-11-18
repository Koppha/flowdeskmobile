import { useLocalSearchParams } from "expo-router";
import ServerPage from "@/components/ServerPage";

// Custom Processes (Change Request, Computer Request and every process built
// in the portal's Request Types) - a server-built page (see ServerPage), so
// new processes and form changes reach the app with no release.
// ?req=<id> opens a request straight away (inbox, push).
export default function CustomProcessesScreen() {
  const { req } = useLocalSearchParams<{ req?: string }>();
  return <ServerPage section="custom" requestId={req} />;
}
