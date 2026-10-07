import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CalendarDays, MapPin, Paperclip, Receipt, User, Wallet } from "lucide-react-native";
import { addDays, fmtMoney, formatDisplayDate } from "@/lib/request-forms";
import { colors, radii, spacing } from "@/theme";

// What an approver needs to decide on an advance or clearance: who, where,
// when, day by day, and how the amount adds up. Fed by GET /advances/:id and
// GET /claims/:id (the same payloads the web app's review panels use).

const num = (v: unknown) => Number(v) || 0;
const day = (v: unknown) => String(v || "").slice(0, 10);

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value?: string | null; strong?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function dateRange(from: string, to: string) {
  if (!from) return null;
  if (!to || to === from) return formatDisplayDate(from);
  return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
}

function inclusiveDays(from: string, to: string) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 86400000) + 1 : 0;
}

// ---------------------------------------------------------------- Advance

type Line = {
  line_date: string;
  location?: string | null;
  travel_meta?: { startDistrict?: string; destinationDistrict?: string; hotel?: string; country?: string; city?: string; province?: string } | null;
  meals_count?: number | string | null;
  breakfast?: number | string;
  lunch?: number | string;
  dinner?: number | string;
  line_total?: number | string;
};

function lineUnits(l: Line, daily: boolean) {
  const n = num(l.meals_count);
  if (daily) return `${n || 1} day${(n || 1) === 1 ? "" : "s"}`;
  if (n) return `${n} meal${n === 1 ? "" : "s"}`;
  // Older requests store amounts per meal instead of a count.
  const meals = [num(l.breakfast) && "breakfast", num(l.lunch) && "lunch", num(l.dinner) && "dinner"].filter(Boolean);
  return meals.length ? meals.join(", ") : null;
}

/** "Maseru → Mokhotlong → Butha-Buthe → Maseru" from a district day table. */
function districtRoute(lines: Line[]) {
  const stops: string[] = [];
  for (const l of lines) {
    const start = l.travel_meta?.startDistrict;
    const dest = l.travel_meta?.destinationDistrict;
    for (const s of [start, dest]) if (s && stops[stops.length - 1] !== s) stops.push(s);
  }
  if (stops.length) return stops.join(" → ");
  const places = [...new Set(lines.map((l) => l.location).filter(Boolean))];
  return places.length ? places.join(" → ") : null;
}

export function AdvanceDetails({ a }: { a: any }) {
  const currency = a.travel_currency || "LSL";
  const lines: Line[] = Array.isArray(a.lines) ? [...a.lines].sort((x, y) => day(x.line_date).localeCompare(day(y.line_date))) : [];
  const isTrip = a.travel_location_mode === "COUNTRY_CITY";
  const daily = a.travel_rate_kind === "DAILY";
  const isSalary = a.type === "SALARY";
  const isLoan = a.type === "LOAN";
  const isExternal = Boolean(a.external_beneficiary_id || a.external_beneficiary_name);
  const extra = num(a.extra_cost_amount);
  const requested = num(a.requested_total);
  const approved = num(a.approved_total);

  // Trip window: first line date to the return date (planner) or the last line's end.
  const first = day(lines[0]?.line_date);
  const lastLine = lines[lines.length - 1];
  const lastDay = lastLine ? (daily ? addDays(day(lastLine.line_date), Math.max(num(lastLine.meals_count), 1) - 1) : day(lastLine.line_date)) : "";
  const tripEnd = isTrip && a.travel_return_date ? day(a.travel_return_date) : lastDay;
  const tripDays = first && tripEnd ? inclusiveDays(first, tripEnd) : 0;
  const tripMeta = lines[0]?.travel_meta;
  const destination = isTrip ? [tripMeta?.city, tripMeta?.province, tripMeta?.country].filter(Boolean).join(", ") || lines[0]?.location : null;
  const hotels = [...new Set(lines.map((l) => l.travel_meta?.hotel).filter(Boolean))] as string[];

  return (
    <>
      <Section title="Requested by" icon={<User size={14} color={colors.muted} />}>
        <Row label="Name" value={a.requester_name} strong />
        <Row label="Employee no." value={a.requester_employee_no} />
        <Row label="Department" value={a.department} />
        {a.created_by_name && a.created_by_name !== a.requester_name && <Row label="Submitted by" value={`${a.created_by_name} (on their behalf)`} />}
        {isExternal && (
          <>
            <Row
              label="Traveller"
              value={[a.external_beneficiary_name, a.external_beneficiary_category, a.external_beneficiary_organisation].filter(Boolean).join(" · ")}
            />
            <Row label="Dates" value={dateRange(day(a.external_start_date), day(a.external_end_date))} />
            <Text style={styles.note}>Apply for Other - the requester receives the funds and stays accountable.</Text>
          </>
        )}
      </Section>

      {lines.length > 0 && !isExternal && (
        <Section title="Trip" icon={<MapPin size={14} color={colors.muted} />}>
          {isTrip ? (
            <>
              <Row label="From" value={a.travel_origin_iata || null} />
              <Row label="To" value={[destination, a.travel_destination_iata ? `(${a.travel_destination_iata})` : null].filter(Boolean).join(" ")} strong />
            </>
          ) : (
            <Text style={styles.route}>{districtRoute(lines)}</Text>
          )}
          <Row label="Dates" value={dateRange(first, tripEnd)} strong />
          <Row label="Duration" value={tripDays ? `${tripDays} day${tripDays === 1 ? "" : "s"}` : null} />
          {hotels.length > 0 && <Row label="Accommodation" value={hotels.join(", ")} />}
        </Section>
      )}

      {lines.length > 0 && !isExternal && (
        <Section title={isTrip ? "Allowance" : "Day by day"} icon={<CalendarDays size={14} color={colors.muted} />}>
          {lines.map((l, i) => {
            const where = l.travel_meta?.startDistrict
              ? l.travel_meta.startDistrict === l.travel_meta.destinationDistrict
                ? `In ${l.travel_meta.destinationDistrict}`
                : `${l.travel_meta.startDistrict} → ${l.travel_meta.destinationDistrict}`
              : l.location;
            return (
              <View key={i} style={[styles.line, i > 0 && styles.lineBorder]}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineDate}>{formatDisplayDate(day(l.line_date))}</Text>
                  <Text style={styles.lineTotal}>{fmtMoney(num(l.line_total), currency)}</Text>
                </View>
                <Text style={styles.lineWhere}>{where || "—"}</Text>
                <Text style={styles.lineMeta}>
                  {[lineUnits(l, daily), l.travel_meta?.hotel ? `Hotel: ${l.travel_meta.hotel}` : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
            );
          })}
        </Section>
      )}

      {(isSalary || isLoan) && (
        <Section title={isSalary ? "Salary advance" : "Loan"} icon={<Wallet size={14} color={colors.muted} />}>
          {isSalary && a.salary_month && (
            <Row label="Salary month" value={new Date(`${a.salary_month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })} />
          )}
          <Row label="Payback" value={a.payback_months ? `${a.payback_months} month${Number(a.payback_months) === 1 ? "" : "s"}` : null} />
          <Row
            label="Monthly deduction"
            value={a.payback_months ? `≈ ${fmtMoney((approved || requested) / Number(a.payback_months), currency)}` : null}
          />
        </Section>
      )}

      <Section title="Amount" icon={<Receipt size={14} color={colors.muted} />}>
        {lines.length > 0 && !isExternal && <Row label={daily ? "Allowance" : "Meals"} value={fmtMoney(requested - extra, currency)} />}
        {extra > 0 && <Row label="Extra cost" value={fmtMoney(extra, currency)} />}
        {extra > 0 && a.extra_cost_description ? <Text style={styles.note}>“{a.extra_cost_description}”</Text> : null}
        <Row label="Requested" value={fmtMoney(requested, currency)} strong />
        {approved > 0 && approved !== requested && <Row label="Approved so far" value={fmtMoney(approved, currency)} strong />}
        <Row label="Paid via" value={a.payment_method === "BANK" ? "Bank transfer" : a.payment_method === "ECOCASH" ? "EcoCash" : a.payment_method} />
        {a.project_number ? <Row label="Project no." value={a.project_number} /> : null}
      </Section>

      {a.purpose ? (
        <Section title="Purpose">
          <Text style={styles.purpose}>{a.purpose}</Text>
        </Section>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Clearance

export function ClaimDetails({ c, claimantName }: { c: any; claimantName?: string | null }) {
  const currency = c.currency || "LSL";
  const trips: any[] = Array.isArray(c.trips) ? [...c.trips].sort((x, y) => day(x.trip_date).localeCompare(day(y.trip_date))) : [];
  const receipts: any[] = Array.isArray(c.receipts) ? c.receipts : [];
  const balance = num(c.balance_amount);
  const extra = num(c.extra_cost_amount);
  const first = day(trips[0]?.trip_date);
  const last = day(trips[trips.length - 1]?.trip_date);

  return (
    <>
      <Section title="Claimant" icon={<User size={14} color={colors.muted} />}>
        <Row label="Name" value={claimantName || c.claimant_name} strong />
        <Row
          label="Month"
          value={c.month ? new Date(`${c.month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null}
        />
        <Row label="Duty station" value={c.duty_station} />
        <Row label="Project no." value={c.project_number} />
        <Row label="Vehicle" value={[c.vehicle_reg, c.vehicle_type, c.engine_cc ? `${c.engine_cc} cc` : null].filter(Boolean).join(" · ") || null} />
      </Section>

      {trips.length > 0 && (
        <Section title={`Actual expenditure · ${dateRange(first, last)}`} icon={<CalendarDays size={14} color={colors.muted} />}>
          {trips.map((t, i) => {
            const meals = num(t.breakfast) + num(t.lunch) + num(t.dinner);
            const parts = [
              meals ? `Meals ${fmtMoney(meals, currency)}` : null,
              num(t.petrol_allowance) ? `Transport ${fmtMoney(num(t.petrol_allowance), currency)}` : null,
              num(t.other_expenses) ? `Other ${fmtMoney(num(t.other_expenses), currency)}` : null,
              num(t.km_travelled) ? `${num(t.km_travelled)} km` : null
            ].filter(Boolean);
            return (
              <View key={i} style={[styles.line, i > 0 && styles.lineBorder]}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineDate}>{formatDisplayDate(day(t.trip_date))}</Text>
                  <Text style={styles.lineTotal}>{fmtMoney(num(t.line_total), currency)}</Text>
                </View>
                <Text style={styles.lineWhere}>{[t.from_place, t.to_place].filter(Boolean).join(" → ") || "—"}</Text>
                {t.purpose ? <Text style={styles.lineMeta}>{t.purpose}</Text> : null}
                {parts.length > 0 && <Text style={styles.lineMeta}>{parts.join(" · ")}</Text>}
              </View>
            );
          })}
        </Section>
      )}

      <Section title="Reconciliation" icon={<Receipt size={14} color={colors.muted} />}>
        <Row label="Advance received" value={fmtMoney(num(c.advance_amount), currency)} />
        {extra > 0 && <Row label="Extra cost" value={fmtMoney(extra, currency)} />}
        {extra > 0 && c.extra_cost_description ? <Text style={styles.note}>“{c.extra_cost_description}”</Text> : null}
        <Row label="Actual expenditure" value={fmtMoney(num(c.claim_total), currency)} strong />
        <Row
          label={Math.abs(balance) < 0.005 ? "Balance" : balance > 0 ? "Employee owes company" : "Company owes employee"}
          value={fmtMoney(Math.abs(balance), currency)}
          strong
        />
        {balance < 0 && c.reason_for_overspend ? <Text style={styles.note}>Overspend: “{c.reason_for_overspend}”</Text> : null}
      </Section>

      <Section title={`Receipts (${receipts.length})`} icon={<Paperclip size={14} color={colors.muted} />}>
        {receipts.length ? (
          receipts.map((r, i) => (
            <Text key={r.id || i} style={styles.receipt}>
              • {r.file_name}
              {r.category ? ` (${r.category})` : ""}
            </Text>
          ))
        ) : (
          <Text style={styles.note}>No receipts attached.</Text>
        )}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 4 },
  label: { fontSize: 13.5, color: colors.muted },
  value: { flexShrink: 1, fontSize: 13.5, color: colors.ink, textAlign: "right" },
  strong: { fontWeight: "700" },
  route: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 6, lineHeight: 21 },
  note: { fontSize: 12.5, color: colors.muted, fontStyle: "italic", marginTop: 2, marginBottom: 4 },
  purpose: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  line: { paddingVertical: 10 },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  lineTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  lineDate: { fontSize: 13.5, fontWeight: "700", color: colors.ink },
  lineTotal: { fontSize: 13.5, fontWeight: "700", color: colors.ink },
  lineWhere: { fontSize: 13.5, color: colors.ink, marginTop: 2 },
  lineMeta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  receipt: { fontSize: 13.5, color: colors.ink, paddingVertical: 2 }
});
