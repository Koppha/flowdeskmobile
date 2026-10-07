import type { StatusPillProps } from "@/components/StatusPill";

/** Pill colour for an advance/claim status string. */
export function toneFor(status: string): StatusPillProps["tone"] {
  const s = status.toUpperCase();
  if (s.includes("REJECT") || s.includes("CANCEL")) return "bad";
  if (s.includes("APPROV") || s.includes("PAID") || s.includes("SETTLE")) return "good";
  if (s === "DRAFT") return "muted";
  return "warn";
}

export const statusLabel = (status: string) => status.replace(/_/g, " ");
