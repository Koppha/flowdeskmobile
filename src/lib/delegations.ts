import { addDays, todayIso } from "./request-forms";

// Same as the portal's Manager Delegations (App.tsx DELEGATION_REQUEST_TYPE_OPTIONS).
// None ticked = every approval type.
export const DELEGATION_TYPES = [
  { value: "ADVANCE_REQUEST", label: "Advance requests (salary, loan, travel)" },
  { value: "CLEARANCE_REQUEST", label: "Travel clearances" },
  { value: "CUSTOM_WORKFLOW", label: "Custom processes (all types)" },
  { value: "STANDBY_CLAIM", label: "Standby claims" }
];

export type DelegationStatus = "ACTIVE" | "UPCOMING" | "EXPIRING" | "EXPIRED" | "ENDED";

export const STATUS_LABEL: Record<DelegationStatus, string> = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  EXPIRING: "Ending soon",
  EXPIRED: "Expired",
  ENDED: "Ended"
};

export const STATUS_TONE: Record<DelegationStatus, "good" | "warn" | "bad" | "muted"> = {
  ACTIVE: "good",
  UPCOMING: "muted",
  EXPIRING: "warn",
  EXPIRED: "bad",
  ENDED: "bad"
};

/**
 * Derived from the dates and `active`, as on the portal - there's no stored
 * status. Dates are plain YYYY-MM-DD (the backend's pg date parser), so
 * comparing the strings is enough.
 */
export function delegationStatus(d: { active: boolean; from_date: string | null; to_date: string | null }): DelegationStatus {
  if (!d.active) return "ENDED";
  const today = todayIso();
  const from = d.from_date?.slice(0, 10) || null;
  const to = d.to_date?.slice(0, 10) || null;
  if (to && to < today) return "EXPIRED";
  if (from && from > today) return "UPCOMING";
  if (to && to <= addDays(today, 7)) return "EXPIRING";
  return "ACTIVE";
}

/** "All approvals" or the ticked types, in words. */
export function scopeLabel(types: string[], customNames: Record<string, string> = {}) {
  if (!types?.length) return "All approvals";
  return types.map((t) => DELEGATION_TYPES.find((o) => o.value === t)?.label || customNames[t] || t.replace(/_/g, " ").toLowerCase()).join(", ");
}
