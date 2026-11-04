import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { clearToken, getToken } from "./secure-storage";

// app.json's extra.apiUrl defaults to UAT (through the external proxy, so it
// works off the Econet network too; the proxy only forwards paths under /etl/), matching this project's standing
// rule of only ever deploying to UAT unless explicitly asked - a PROD build
// overrides this via an EAS build profile's environment config, not by
// editing this default.
export const API = (Constants.expoConfig?.extra?.apiUrl as string) || "https://dt-externalproxy-1.etl.co.ls/etl/flowdesk/uat";

function formatApiError(json: any, fallback: string) {
  const message = typeof json?.error === "string" ? json.error : fallback;
  const fieldErrors = json?.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    const details = Object.entries(fieldErrors)
      .flatMap(([field, errors]) => (Array.isArray(errors) ? errors.map((e) => `${field}: ${e}`) : []))
      .join("; ");
    if (details) return `${message}: ${details}`;
  }
  return message;
}

// AuthProvider registers this so a 401 (expired/revoked session) signs the
// user out and sends them to Login, instead of only deleting the token and
// leaving the open screens firing tokenless requests.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Mirrors frontend/src/api.ts's req() exactly - same base URL pattern,
// same bearer-token header, same error shape - so the mobile app talks to
// the identical backend-v2 endpoints the web app already uses, no new API
// surface (see the FlowDesk Mobile write-up's "How it fits" section).
/** The headers every call to the backend carries (also used by the AI Assistant's streaming chat). */
export async function clientHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  // Lets the backend tell a mobile login apart from a web login for the
  // admin Analytics tab - see auth.routes.ts's trackMobileLoginIfNeeded().
  headers["X-Flowdesk-Client"] = "mobile";
  // Which app version / platform made the call - Analytics shows who is on
  // which release.
  headers["X-Flowdesk-App-Version"] = Constants.expoConfig?.version ?? "";
  headers["X-Flowdesk-Platform"] = Platform.OS;
  // The phone, for the admin Analytics "devices in use" (backend mobileAppUsage.ts).
  if (Device.modelName) headers["X-Flowdesk-Device-Model"] = Device.modelName;
  if (Device.brand || Device.manufacturer) headers["X-Flowdesk-Device-Brand"] = (Device.brand || Device.manufacturer) as string;
  if (Device.osVersion) headers["X-Flowdesk-OS-Version"] = Device.osVersion;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** A 401 on a signed-in call: the session is gone - sign out and go to Login. */
export async function handleUnauthorized() {
  await clearToken();
  onUnauthorized?.();
}

async function req(path: string, options: RequestInit = {}) {
  const base = await clientHeaders();
  const token = base.Authorization;
  const headers: any = { Accept: "application/json", ...(options.headers || {}), ...base };
  // Multipart uploads (receipts) must let fetch set its own boundary header.
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));

  // Only for authenticated calls - a 401 from /auth/login is just wrong
  // credentials and must surface as an error on the Login screen.
  if (res.status === 401 && token) await handleUnauthorized();
  if (!res.ok) {
    const error = new Error(formatApiError(json, res.statusText)) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return json;
}

export type AdvanceInboxItem = {
  doc_type: "ADVANCE";
  id: string;
  status: string;
  requested_total: number;
  approved_total: number;
  purpose: string | null;
  requester_name: string;
  advance_type?: string;
  currency?: string | null;
  current_step_position_name?: string | null;
  current_step_actionable_by_me?: boolean;
};

export type ClaimInboxItem = {
  doc_type: "CLAIM";
  id: string;
  status: string;
  claim_total: number;
  advance_amount: number;
  balance_amount: number;
  claimant_name: string;
  currency?: string | null;
  current_step_position_name?: string | null;
  current_step_actionable_by_me?: boolean;
};

export type CustomRequestInboxItem = {
  doc_type: "CUSTOM_REQUEST";
  id: string;
  status: string;
  request_type_name: string;
  requester_name?: string;
  current_step_position_name?: string | null;
  current_step_actionable_by_me?: boolean;
};

// A routed document waiting for my signature (signatures module).
export type SignableDocumentInboxItem = {
  doc_type: "SIGNABLE_DOCUMENT";
  id: string;
  status: string;
  title: string;
  created_by_name: string | null;
  current_step_position_name?: string | null;
  current_step_actionable_by_me?: boolean;
};

// A maintenance request where I have the next move (maintenance module).
export type MaintenanceInboxItem = {
  doc_type: "MAINTENANCE_REQUEST";
  id: string;
  status: string;
  status_label?: string;
  request_no: string;
  site_name: string;
  location: string;
  category: string;
  priority: string;
  requester_name: string;
  task_label: string;
  current_step_position_name?: string | null;
  current_step_actionable_by_me?: boolean;
};

export type InboxItem = (AdvanceInboxItem | ClaimInboxItem | CustomRequestInboxItem | SignableDocumentInboxItem | MaintenanceInboxItem) & {
  submitted_at?: string | null;
  created_at?: string | null;
};

export const api = {
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{ token: string }>,

  inbox: () => req("/inbox") as Promise<{ items: InboxItem[] }>,

  myAdvances: () => req("/advances?mine=true"),
  myClearances: () => req("/claims?mine=true"),
  advanceDetail: (id: string) => req(`/advances/${id}`),
  advanceHistory: (id: string) => req(`/advances/${id}/history`),
  claimDetail: (id: string) => req(`/claims/${id}`),

  approveAdvance: (id: string, approved_total: number, comments?: string) =>
    req(`/advances/${id}/approve`, { method: "POST", body: JSON.stringify({ approved_total, comments }) }),
  rejectAdvance: (id: string, comments: string) =>
    req(`/advances/${id}/reject`, { method: "POST", body: JSON.stringify({ comments }) }),

  approveClaim: (id: string, comments?: string) =>
    req(`/claims/${id}/approve`, { method: "POST", body: JSON.stringify({ comments }) }),
  rejectClaim: (id: string, comments: string) =>
    req(`/claims/${id}/reject`, { method: "POST", body: JSON.stringify({ comments }) }),

  // Profile > Notifications - honoured by the backend's email and push senders.
  notificationPrefs: () => req("/auth/me/notifications") as Promise<{ email: boolean; push: boolean }>,
  setNotificationPrefs: (prefs: { email?: boolean; push?: boolean }) =>
    req("/auth/me/notifications", { method: "PUT", body: JSON.stringify(prefs) }) as Promise<{ email: boolean; push: boolean }>,

  registerPushToken: (expoPushToken: string) =>
    req("/auth/push-token", { method: "POST", body: JSON.stringify({ expoPushToken }) }),

  /** The newest app release on the portal (in-app update check). */
  latestBuild: () =>
    req("/mobile-app/latest?platform=ANDROID") as Promise<{ build: { version: string; sizeBytes: number | null; uploadedAt: string } | null }>,
  /** A two-minute token for downloading the release (GET /mobile-app/download?token=). */
  downloadToken: () => req("/mobile-app/download-token") as Promise<{ token: string }>,

  /** Admin Analytics: the app was opened/unlocked. Fire-and-forget - never blocks or errors the app. */
  trackOpen: () => {
    req("/mobile-app/events", { method: "POST", body: JSON.stringify({ type: "OPEN" }) }).catch(() => {});
  },

  mobileConfig: () =>
    req("/admin/mobile-config") as Promise<{
      modules: Partial<Record<ModuleKey, boolean>>;
      tabs: { key: "home" | "inbox" | "profile"; enabled: boolean }[];
      webTiles?: WebTile[];
    }>,

  // --- Creating advances & clearances (same endpoints and payloads as the
  // web app's ADVANCE / CLEARANCE pages; see advances.routes.ts and
  // claims.routes.ts in backend-v2).
  me: () => req("/auth/me") as Promise<Profile>,
  moduleFlags: () => req("/request-types/module-flags") as Promise<ModuleFlags>,
  travelTypes: () => req("/travel/types") as Promise<TravelType[]>,
  airports: (q: string) => req(`/travel/airports?q=${encodeURIComponent(q)}`) as Promise<Airport[]>,
  requestDirectory: () => req("/auth/request-directory") as Promise<DirectoryUser[]>,
  myPaPrincipals: () => req("/pa-assignments/my-principals") as Promise<DirectoryUser[]>,
  externalPayees: () => req("/advances/external-payees") as Promise<ExternalPayee[]>,
  createExternalPayee: (data: { full_name: string; category?: string; organisation?: string; phone?: string }) =>
    req("/advances/external-payees", { method: "POST", body: JSON.stringify(data) }) as Promise<{ id: string }>,
  resolveWorkflow: (params: Record<string, string | undefined>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
      .join("&");
    return req(`/workflows/resolve?${qs}`) as Promise<{ chain?: WorkflowStep[] }>;
  },

  createAdvance: (data: Record<string, unknown>) =>
    req("/advances", { method: "POST", body: JSON.stringify(data) }) as Promise<{ id: string }>,
  updateAdvance: (id: string, data: Record<string, unknown>) =>
    req(`/advances/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateAdvanceLines: (id: string, lines: AdvanceLineInput[]) =>
    req(`/advances/${id}/lines`, { method: "PUT", body: JSON.stringify({ lines }) }),
  submitAdvance: (id: string) =>
    req(`/advances/${id}/submit`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean; status: string; warning?: string }>,

  createClaim: (data: Record<string, unknown>) =>
    req("/claims", { method: "POST", body: JSON.stringify(data) }) as Promise<{ id: string }>,
  updateClaim: (id: string, data: Record<string, unknown>) =>
    req(`/claims/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateClaimTrips: (id: string, data: { trips: ClaimTripInput[]; extra_cost_amount: number; extra_cost_description?: string }) =>
    req(`/claims/${id}/trips`, { method: "PUT", body: JSON.stringify(data) }),
  uploadClaimReceipt: (id: string, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    // React Native's FormData takes a { uri, name, type } file descriptor.
    form.append("file", file as unknown as Blob);
    return req(`/claims/${id}/upload-receipt`, { method: "POST", body: form });
  },
  deleteClaimReceipt: (id: string, receiptId: string) => req(`/claims/${id}/receipts/${receiptId}`, { method: "DELETE" }),
  submitClaim: (id: string) =>
    req(`/claims/${id}/submit`, { method: "POST", body: JSON.stringify({}) }) as Promise<{ ok: boolean; status: string }>,

  // --- AI Assistant (backend-v2 ai.routes.ts). The service, model, daily
  // limit and who may use it are all set on the portal (Settings > AI
  // Assistant, Roles & Permissions) - nothing about the AI lives in the app.
  // The chat itself streams: see src/lib/assistant.ts.
  assistantStatus: () =>
    req("/ai/assistant/status") as Promise<{ configured: boolean; enabled?: boolean; daily_limit: number; used_today: number }>,
  assistantConversations: () =>
    req("/ai/assistant/conversations") as Promise<{ items: { id: string; title: string | null; updated_at: string }[] }>,
  assistantConversation: (id: string) =>
    req(`/ai/assistant/conversations/${id}`) as Promise<{ messages?: { role: "user" | "assistant"; text: string }[] }>,
  deleteAssistantConversation: (id: string) => req(`/ai/assistant/conversations/${id}`, { method: "DELETE" }),

  // --- First sign-in: "Complete your profile" (same endpoint and payload as
  // the web portal's profile screen - auth.routes.ts POST /complete-profile).
  orgStructure: () => req("/auth/org-structure") as Promise<OrgStructure>,
  employmentTypes: () => req("/auth/employment-types") as Promise<{ code: string; name: string; active: boolean }[]>,
  completeProfile: (data: {
    full_name: string;
    department: string;
    division_id: string | null;
    section_id: string | null;
    team_id: string | null;
    employment_type: string;
    employee_no?: string;
  }) => req("/auth/complete-profile", { method: "POST", body: JSON.stringify(data) }) as Promise<{ token: string }>,
  updatePhone: (phone: string) => req("/auth/me/profile", { method: "PATCH", body: JSON.stringify({ phone }) }),

  /** Managers: their direct reports (reporting-lines.routes.ts GET /my-team). */
  myTeam: () => req("/reporting-lines/my-team") as Promise<MyTeamResponse>
};

export type OrgStructure = {
  divisions?: { id: string; name: string; active?: boolean }[];
  departments?: { id: string; name: string; division_id: string | null; active?: boolean; is_business_partner?: boolean; division_ids?: string[] }[];
  sections?: { id: string; name: string; department_id: string | null; active?: boolean }[];
  teams?: { id: string; name: string; section_id: string | null; active?: boolean }[];
};

export type TeamMember = {
  id: string;
  full_name: string | null;
  email: string;
  phone?: string | null;
  title: string | null;
  role: string;
  department: string | null;
  is_active: boolean;
  pending_requests: number;
  total_requests: number;
  last_activity: string | null;
};

export type MyTeamResponse = {
  members: TeamMember[];
  active_delegation: { delegate_name?: string; from_date: string | null; to_date: string | null } | null;
  recent_activity: { id: string; action: string; entity_type: string; created_at: string; actor_name: string }[];
};

/** Roles that have a team (same list the backend's /reporting-lines/my-team allows). */
export const TEAM_ROLES = ["MANAGER", "HOD", "EXCO", "CEO", "ADMIN"];

// `createAdvance` / `createClearance` gate the "New" buttons; `advances` /
// `clearances` only show/hide the Home tiles that list existing requests.
/**
 * A Home tile for a process built on the server: opens /web?go=<go>. Icon is a
 * name from Home's WEB_TILE_ICONS, color one of the theme's tile colours.
 */
export type WebTile = { go: string; label: string; icon?: string; color?: string };

export type ModuleKey =
  | "advances"
  | "clearances"
  | "createAdvance"
  | "createClearance"
  | "overtime"
  | "standby"
  | "customProcesses"
  | "signADocument"
  | "maintenance"
  | "myTeam";

export type EmploymentType = "PERMANENT" | "INTERN" | "TEMPORARY" | string;

export type Profile = {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  employee_no: string | null;
  department: string | null;
  division_name: string | null;
  section_name: string | null;
  team_name: string | null;
  employment_type: EmploymentType | null;
  profile_completed: boolean;
  phone?: string | null;
};

export type DirectoryUser = {
  id: string;
  full_name: string | null;
  email: string;
  employee_no: string | null;
  department: string | null;
  employment_type: EmploymentType | null;
  role: string;
  profile_completed: boolean | null;
  section_name?: string | null;
  division_name?: string | null;
  team_name?: string | null;
};

export type ModuleFlags = {
  salary_advance_enabled: boolean;
  loan_advance_enabled: boolean;
  salary_advance_max_payback_months: number;
  loan_advance_max_payback_months: number;
};

export type TravelLocation = { id: string; district: string | null; country: string | null; province: string | null; city: string | null; active: boolean };

export type TravelType = {
  id: string;
  code: string;
  name: string;
  location_mode: "DISTRICT" | "COUNTRY_CITY";
  rate_kind: "MEAL" | "DAILY";
  rate_general_staff: number | string;
  rate_exco: number | string;
  rate_ceo: number | string;
  currency: string | null;
  active: boolean;
  allowed_payment_methods: ("ECOCASH" | "BANK")[] | null;
  allow_external_beneficiary: boolean;
  locations: TravelLocation[];
};

export type Airport = { iata_code: string; name: string; city: string; country: string };

export type ExternalPayee = { id: string; full_name: string; organisation: string | null; category: string | null };

export type WorkflowStep = { position_type_code?: string; position_name?: string; approver_title?: string; approver_name?: string | null };

export type AdvanceLineInput = {
  line_date: string;
  location?: string;
  travel_meta?: Record<string, unknown>;
  meals_count?: number;
  dinner?: number;
};

export type ClaimTripInput = {
  trip_date: string;
  from_place?: string;
  to_place?: string;
  purpose?: string;
  km_travelled: number;
  petrol_allowance: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  other_expenses: number;
};
