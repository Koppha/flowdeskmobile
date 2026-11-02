import { useLocalSearchParams } from "expo-router";
import ServerPage from "@/components/ServerPage";

// Sign a Document - a server-built page (see ServerPage). ?doc=<id> opens a
// document straight away (inbox, push).
export default function SignScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  return <ServerPage section="sign" docId={doc} />;
}
