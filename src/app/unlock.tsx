import UnlockPanel from "@/components/UnlockPanel";

// Cold-start unlock (a session is stored). The same panel also appears as an
// overlay when a running session re-locks - see src/app/_layout.tsx.
export default function UnlockScreen() {
  return <UnlockPanel />;
}
