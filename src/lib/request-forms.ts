import type { DirectoryUser, Profile, TravelType } from "./api";

// Same lists as the web app's frontend/src/constants.ts.
export const LESOTHO_DISTRICTS = [
  "Butha-Buthe",
  "Leribe",
  "Berea",
  "Maseru",
  "Mafeteng",
  "Mohale's Hoek",
  "Quthing",
  "Qacha's Nek",
  "Mokhotlong",
  "Thaba-Tseka"
];

export const SOUTH_AFRICA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape"
];

// Client-side checks mirrored from the web advance form (App.tsx) so errors
// show next to the field instead of coming back from the server.
export const PATTERNS = {
  ecocash: /^\+?\d{7,15}$/,
  bankName: /^[A-Za-z0-9 .,&'-]{2,60}$/,
  bankAccount: /^[A-Za-z0-9-]{4,34}$/,
  bankBranch: /^[A-Za-z0-9 .,'/-]{2,60}$/
};

export const RESERVED_TYPES = { SALARY: "SALARY", LOAN: "LOAN" } as const;

// --- Dates (always local-calendar YYYY-MM-DD, never UTC-shifted) ---

export function toIsoDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const todayIso = () => toIsoDate(new Date());

export function addDays(iso: string, days: number) {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Inclusive day count, e.g. Mon -> Wed = 3 (matches the web trip planner). */
export function daysInclusive(fromIso: string, toIso: string) {
  const ms = fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function formatDisplayDate(iso: string) {
  return fromIsoDate(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// --- Money ---

export function fmtMoney(amount: number, currency?: string | null) {
  const value = Number.isFinite(amount) ? amount : 0;
  const code = (currency || "LSL").toUpperCase();
  const prefix = code === "LSL" ? "M" : code === "ZAR" ? "R" : `${code} `;
  return `${prefix}${value.toFixed(2)}`;
}

export const toNumber = (s: string) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// --- Travel rates (server recomputes; this is the preview) ---

/** The rate the *traveller* is billed at - CEO/EXCO have their own rates. */
export function travelRate(type: TravelType | null, travellerRole: string | undefined) {
  if (!type) return 0;
  const raw = travellerRole === "CEO" ? type.rate_ceo : travellerRole === "EXCO" ? type.rate_exco : type.rate_general_staff;
  return Number(raw) || 0;
}

/** Meals allowed per day row: 3 on day 1, 2 after (breakfast eaten at home); DAILY types hold a day count instead. */
export function maxUnitsForRow(type: TravelType | null, index: number) {
  if (type?.rate_kind === "DAILY") return 180;
  return index === 0 ? 3 : 2;
}

// --- Who can request what (mirrors App.tsx canRequestForSelf etc.) ---

const upper = (s?: string | null) => String(s || "").toUpperCase();

export function canRequestForSelf(p: Profile | null) {
  // A missing employment type counts as PERMANENT (backend isPermanentEmployee).
  return Boolean(p?.profile_completed) && ["PERMANENT", "INTERN", "TEMPORARY"].includes(upper(p?.employment_type) || "PERMANENT");
}

export function isPermanent(p: Profile | null) {
  return Boolean(p?.profile_completed) && (upper(p?.employment_type) || "PERMANENT") === "PERMANENT";
}

/** Interns/temps in my department, plus bosses I'm an assigned PA for. */
export function eligibleBeneficiaries(me: Profile | null, directory: DirectoryUser[], principals: DirectoryUser[]) {
  const fromDirectory = directory.filter(
    (u) => u.id !== me?.id && ["INTERN", "TEMPORARY"].includes(upper(u.employment_type)) && Boolean(u.profile_completed)
  );
  const seen = new Set(fromDirectory.map((u) => u.id));
  return [...fromDirectory, ...principals.filter((u) => u.id !== me?.id && !seen.has(u.id))];
}

export function personLabel(u: { full_name: string | null; email: string; employee_no?: string | null }) {
  const name = u.full_name || u.email;
  return u.employee_no ? `${name} (${u.employee_no})` : name;
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
