import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Trash2 } from "lucide-react-native";
import {
  api,
  type Airport,
  type AdvanceLineInput,
  type DirectoryUser,
  type ExternalPayee,
  type ModuleFlags,
  type Profile,
  type TravelType
} from "@/lib/api";
import { useMobileModules } from "@/lib/mobile-modules";
import {
  LESOTHO_DISTRICTS,
  PATTERNS,
  RESERVED_TYPES,
  SOUTH_AFRICA_PROVINCES,
  BACKDATE_GRACE_DAYS,
  addDays,
  canRequestForSelf,
  daysInclusive,
  earliestTripDate,
  eligibleBeneficiaries,
  fmtMoney,
  isPermanent,
  maxUnitsForRow,
  personLabel,
  titleCase,
  toNumber,
  todayIso,
  travelRate
} from "@/lib/request-forms";
import { DateInput, Field, Input, PrimaryButton, Section, Segmented, Select, SummaryRow, type SelectOption, useFormStyles } from "@/components/form";
import { useLayout } from "@/components/layout";
import { KeyboardAvoider, KeyboardScrollView } from "@/components/keyboard";
import { useTheme } from "@/theme";

const SELF = "__SELF__";
const EXTERNAL = "__EXTERNAL__";

type DayRow = { date: string; start: string; dest: string; units: string };

export default function NewAdvanceScreen() {
  const { colors } = useTheme();
  const formStyles = useFormStyles();
  const router = useRouter();
  const { gutter } = useLayout();
  const { modules, loaded: modulesLoaded } = useMobileModules();

  // Reference data
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [flags, setFlags] = useState<ModuleFlags | null>(null);
  const [travelTypes, setTravelTypes] = useState<TravelType[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [principals, setPrincipals] = useState<DirectoryUser[]>([]);
  const [payees, setPayees] = useState<ExternalPayee[]>([]);

  // Who it's for
  const [requestFor, setRequestFor] = useState<string>(SELF);
  const [payeeId, setPayeeId] = useState("");
  const [showNewPayee, setShowNewPayee] = useState(false);
  const [newPayee, setNewPayee] = useState({ full_name: "", category: "", organisation: "", phone: "" });
  const [savingPayee, setSavingPayee] = useState(false);
  const [otherAmount, setOtherAmount] = useState("");
  const [otherStart, setOtherStart] = useState("");
  const [otherEnd, setOtherEnd] = useState("");

  // What
  const [typeCode, setTypeCode] = useState("");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState(""); // salary / loan
  const [salaryMonth, setSalaryMonth] = useState("");
  const [payback, setPayback] = useState("");

  // Local travel day table
  const [rows, setRows] = useState<DayRow[]>([]);
  // International trip planner
  const [originIata, setOriginIata] = useState("");
  const [originManual, setOriginManual] = useState("");
  const [destIata, setDestIata] = useState("");
  const [destManual, setDestManual] = useState(false);
  const [destCity, setDestCity] = useState("");
  const [destCountry, setDestCountry] = useState("");
  const [departure, setDeparture] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [province, setProvince] = useState("");
  const [airports, setAirports] = useState<Airport[]>([]);
  const [pickedAirports, setPickedAirports] = useState<Record<string, Airport>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [extraAmount, setExtraAmount] = useState("");
  const [extraDescription, setExtraDescription] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<"ECOCASH" | "BANK">("ECOCASH");
  const [ecocash, setEcocash] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankBranch, setBankBranch] = useState("");

  // Approval route preview
  const [chainResult, setChainResult] = useState<{ key: string; steps: string[] } | null>(null);

  // Submit
  const [draftId, setDraftId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setProfile(me);
        // Everything else is best-effort: a missing list only hides that option.
        const [f, types, dir, pas] = await Promise.all([
          api.moduleFlags().catch(() => null),
          api.travelTypes().catch(() => [] as TravelType[]),
          api.requestDirectory().catch(() => [] as DirectoryUser[]),
          api.myPaPrincipals().catch(() => [] as DirectoryUser[])
        ]);
        setFlags(f);
        setTravelTypes(types.filter((t) => t.active !== false));
        setDirectory(dir);
        setPrincipals(pas);
        if (isPermanent(me)) api.externalPayees().then(setPayees).catch(() => setPayees([]));
        if (!canRequestForSelf(me)) {
          const first = eligibleBeneficiaries(me, dir, pas)[0];
          if (first) setRequestFor(first.id);
        }
      } catch (e: any) {
        setLoadError(e?.message || "Couldn't load the advance form.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --- Derived ---
  const selfAllowed = canRequestForSelf(profile);
  const beneficiaries = useMemo(() => eligibleBeneficiaries(profile, directory, principals), [profile, directory, principals]);
  const othersAllowed = isPermanent(profile) || principals.length > 0;
  const externalAllowed = isPermanent(profile);
  const isExternal = requestFor === EXTERNAL;
  const onBehalf = requestFor !== SELF && !isExternal;
  const principal = principals.find((p) => p.id === requestFor);
  const traveller: { role?: string; department?: string | null; section?: string | null; division?: string | null; team?: string | null } =
    onBehalf
      ? (() => {
          const u = principal || directory.find((d) => d.id === requestFor);
          return { role: u?.role, department: u?.department, section: u?.section_name, division: u?.division_name, team: u?.team_name };
        })()
      : { role: profile?.role, department: profile?.department, section: profile?.section_name, division: profile?.division_name, team: profile?.team_name };

  const travelType = travelTypes.find((t) => t.code === typeCode) || null;
  const isSalary = typeCode === RESERVED_TYPES.SALARY;
  const isLoan = typeCode === RESERVED_TYPES.LOAN;
  const showTravel = Boolean(travelType) && !isExternal;
  const isTrip = showTravel && travelType?.location_mode === "COUNTRY_CITY";
  const isDaily = travelType?.rate_kind === "DAILY";
  const rate = travelRate(travelType, traveller.role);
  const currency = travelType?.currency || "LSL";
  const maxPayback = isSalary ? flags?.salary_advance_max_payback_months ?? 6 : flags?.loan_advance_max_payback_months ?? 6;

  const typeOptions: SelectOption[] = (() => {
    const travel = travelTypes
      .filter((t) => !isExternal || t.allow_external_beneficiary)
      .map((t) => ({
        value: t.code,
        label: t.name,
        sub: `Travel · ${fmtMoney(travelRate(t, traveller.role), t.currency)} per ${t.rate_kind === "DAILY" ? "day" : "meal"}`
      }));
    // Salary/Loan are only ever for yourself, and only when HR has them on.
    const other: SelectOption[] = [];
    if (requestFor === SELF && flags?.salary_advance_enabled) other.push({ value: RESERVED_TYPES.SALARY, label: "Salary advance", sub: "Other advances" });
    if (requestFor === SELF && flags?.loan_advance_enabled) other.push({ value: RESERVED_TYPES.LOAN, label: "Loan advance", sub: "Other advances" });
    return [...travel, ...other];
  })();

  const allowedMethods: ("ECOCASH" | "BANK")[] = travelType?.allowed_payment_methods?.length ? travelType.allowed_payment_methods : ["ECOCASH", "BANK"];
  // A travel type can restrict how it's paid out - fall back to its first allowed method.
  const method = allowedMethods.includes(paymentMethod) ? paymentMethod : allowedMethods[0];

  function changeRequestFor(value: string) {
    setRequestFor(value);
    // Salary/Loan are self-only, and Apply for Other only allows opted-in travel types.
    const t = travelTypes.find((x) => x.code === typeCode);
    const stillValid = t ? value !== EXTERNAL || t.allow_external_beneficiary : value === SELF;
    if (typeCode && !stillValid) setTypeCode("");
  }

  function changeType(code: string) {
    setTypeCode(code);
    // Start a fresh day table when a local travel type is picked.
    const t = travelTypes.find((x) => x.code === code);
    if (t && t.location_mode !== "COUNTRY_CITY" && !rows.length) setRows([{ date: todayIso(), start: "", dest: "", units: "" }]);
  }

  const districtOptions: SelectOption[] = (() => {
    const fromType = (travelType?.locations || []).filter((l) => l.active !== false).map((l) => String(l.district || "").trim()).filter(Boolean);
    return Array.from(new Set(fromType.length ? fromType : LESOTHO_DISTRICTS)).map((d) => ({ value: d, label: d }));
  })();

  const destAirport = pickedAirports[destIata];
  const tripCountry = destManual ? destCountry.trim() : destAirport?.country || "";
  const tripCity = destManual ? destCity.trim() : destAirport?.city || "";
  const tripIsSouthAfrica = tripCountry.toLowerCase() === "south africa";
  const tripDays = departure && returnDate ? daysInclusive(departure, returnDate) : 0;

  const travelUnits = isTrip
    ? tripDays
    : rows.reduce((sum, r) => sum + (isDaily && !toNumber(r.units) ? 1 : toNumber(r.units)), 0);
  const extra = showTravel ? toNumber(extraAmount) : 0;
  const total = isExternal ? toNumber(otherAmount) : showTravel ? travelUnits * rate + extra : isSalary || isLoan ? toNumber(amount) : 0;

  // Approval route preview - same lookup the web form does.
  const chainKey = [typeCode, traveller.department, traveller.section, traveller.division, traveller.team, traveller.role].join("|");
  useEffect(() => {
    if (!profile || !typeCode || !traveller.department) return;
    let cancelled = false;
    api
      .resolveWorkflow({
        requestType: "ADVANCE_REQUEST",
        department: traveller.department || undefined,
        section: traveller.section || undefined,
        division: traveller.division || undefined,
        team: traveller.team || undefined,
        advance_sub_type: typeCode,
        requester_role: traveller.role
      })
      .then((res) => {
        if (cancelled) return;
        const steps = (res?.chain || []).filter((step) => step.position_type_code !== "EMPLOYEE");
        setChainResult({
          key: chainKey,
          steps: steps.map((step) => {
            const title = String(step.position_name || step.approver_title || "Approver").replace(/^Team: /, "");
            return step.approver_name && !String(step.position_name || "").startsWith("Team: ") ? `${title} — ${step.approver_name}` : title;
          })
        });
      })
      .catch(() => !cancelled && setChainResult({ key: chainKey, steps: [] }));
    return () => {
      cancelled = true;
    };
  }, [chainKey, profile, typeCode, traveller.department, traveller.section, traveller.division, traveller.team, traveller.role]);
  // null = still resolving; [] = no workflow configured.
  const chain: string[] | null = !typeCode ? null : !traveller.department ? [] : chainResult?.key === chainKey ? chainResult.steps : null;
  const noWorkflow = chain !== null && chain.length === 0;

  // --- Day table ---
  function updateRow(index: number, patch: Partial<DayRow>) {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, ...patch } : r));
      // Each day starts where the previous day ended.
      return next.map((r, i) => (i === 0 ? r : { ...r, start: next[i - 1].dest }));
    });
  }
  function addRow() {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { date: last ? addDays(last.date, 1) : todayIso(), start: last?.dest || "", dest: "", units: "" }];
    });
  }
  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((r, i) => (i === 0 ? r : { ...r, start: next[i - 1].dest }));
    });
  }
  function setUnits(index: number, text: string) {
    const digits = text.replace(/[^0-9]/g, "");
    const capped = digits ? String(Math.min(Number(digits), maxUnitsForRow(travelType, index))) : "";
    updateRow(index, { units: capped });
  }

  // --- Airports ---
  function searchAirports(q: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setAirports([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      api.airports(q).then((rows) => setAirports(rows.slice(0, 50))).catch(() => setAirports([]));
    }, 250);
  }
  function airportOptions(selected: string): SelectOption[] {
    const list = [...airports];
    const picked = pickedAirports[selected];
    if (picked && !list.some((a) => a.iata_code === picked.iata_code)) list.unshift(picked);
    return list.map((a) => ({ value: a.iata_code, label: `${a.city} (${a.iata_code})`, sub: `${a.name}, ${a.country}` }));
  }
  function pickAirport(iata: string, set: (v: string) => void) {
    const a = airports.find((x) => x.iata_code === iata);
    if (a) setPickedAirports((p) => ({ ...p, [iata]: a }));
    set(iata);
  }

  async function savePayee() {
    if (!newPayee.full_name.trim()) return;
    setSavingPayee(true);
    try {
      const created = await api.createExternalPayee({
        full_name: newPayee.full_name.trim(),
        category: newPayee.category.trim() || undefined,
        organisation: newPayee.organisation.trim() || undefined,
        phone: newPayee.phone.trim() || undefined
      });
      setPayees(await api.externalPayees());
      setPayeeId(created.id);
      setShowNewPayee(false);
      setNewPayee({ full_name: "", category: "", organisation: "", phone: "" });
    } catch (e: any) {
      Alert.alert("Couldn't save payee", e?.message || "Something went wrong.");
    } finally {
      setSavingPayee(false);
    }
  }

  // --- Validate & submit ---
  function validate(): string[] {
    const e: string[] = [];
    const earliest = earliestTripDate();
    const tooOld = `can't be more than ${BACKDATE_GRACE_DAYS} days in the past.`;
    if (!typeCode) e.push("Choose an advance type.");
    if (purpose.trim().length < 5) e.push("Describe the purpose (at least 5 characters).");
    if (isExternal) {
      if (!payeeId) e.push("Choose who this advance is for.");
      if (!(toNumber(otherAmount) > 0)) e.push("Enter the amount.");
      if (!otherStart || !otherEnd) e.push("Enter the start and finish dates.");
      else if (otherEnd < otherStart) e.push("The finish date can't be before the start date.");
      else if (otherStart < earliest) e.push(`The start date ${tooOld}`);
    } else if (isSalary || isLoan) {
      if (!(toNumber(amount) > 0)) e.push(`Enter the ${isSalary ? "salary" : "loan"} amount.`);
      if (isSalary && !salaryMonth) e.push("Choose the salary month.");
      if (!payback) e.push("Choose a payback duration.");
    } else if (showTravel && !isTrip) {
      if (!rows.length) e.push("Add at least one travel day.");
      else if (rows[0].date < earliest) e.push(`The first travel day ${tooOld}`);
      rows.forEach((r, i) => {
        if (!r.start || !r.dest) e.push(`Day ${i + 1}: choose where you start and where you're going.`);
        if (!isDaily && !toNumber(r.units)) e.push(`Day ${i + 1}: enter the number of meals.`);
        if (i > 0 && r.date < rows[i - 1].date) e.push(`Day ${i + 1}: dates must be in order.`);
      });
    } else if (isTrip) {
      if (!originIata && !originManual.trim()) e.push("Enter where you're travelling from.");
      if (!tripCity || !tripCountry) e.push("Enter where you're travelling to.");
      if (!departure || !returnDate) e.push("Enter departure and return dates.");
      else if (returnDate < departure) e.push("Return can't be before departure.");
      else if (departure < earliest) e.push(`The departure date ${tooOld}`);
      if (tripIsSouthAfrica && !province) e.push("Choose the South African province.");
    }
    if (extra > 0 && !extraDescription.trim()) e.push("Justify the extra cost.");
    if (method === "ECOCASH" && !PATTERNS.ecocash.test(ecocash.replace(/[\s-]/g, ""))) e.push("Enter a valid EcoCash number (7–15 digits).");
    if (method === "BANK") {
      if (!PATTERNS.bankName.test(bankName.trim())) e.push("Enter the bank name.");
      if (!PATTERNS.bankAccount.test(bankAccount.trim())) e.push("Enter a valid account number.");
      if (!PATTERNS.bankBranch.test(bankBranch.trim())) e.push("Enter the branch.");
    }
    if (total <= 0 && typeCode) e.push("The amount requested must be more than zero.");
    if (noWorkflow) e.push("No approval route is set up for this advance - submit it on the FlowDesk web app, where you can pick approvers.");
    return e;
  }

  function buildPayload() {
    const p: Record<string, unknown> = { type: typeCode, purpose: purpose.trim(), payment_method: method };
    if (method === "ECOCASH") {
      const n = ecocash.replace(/[\s-]/g, "");
      p.ecocash_number = n;
      p.payment_account = n;
    } else {
      Object.assign(p, { bank_name: bankName.trim(), bank_account_number: bankAccount.trim(), bank_branch: bankBranch.trim() });
    }
    if (isExternal) {
      Object.assign(p, { requested_total: toNumber(otherAmount), external_beneficiary_id: payeeId, external_start_date: otherStart, external_end_date: otherEnd });
    } else if (isSalary) {
      Object.assign(p, { requested_total: toNumber(amount), salary_month: salaryMonth, payback_months: Number(payback) });
    } else if (isLoan) {
      Object.assign(p, { requested_total: toNumber(amount), payback_months: Number(payback) });
    } else if (showTravel) {
      Object.assign(p, { requested_total: total, extra_cost_amount: extra, extra_cost_description: extraDescription.trim() || undefined });
      if (isTrip) {
        if (originIata) p.travel_origin_iata = originIata;
        if (destIata && !destManual) p.travel_destination_iata = destIata;
        p.travel_return_date = returnDate;
      }
    }
    return p;
  }

  function buildLines(): AdvanceLineInput[] {
    if (!showTravel) return [];
    if (isTrip) {
      const prov = tripIsSouthAfrica ? province : "";
      return [
        {
          line_date: departure,
          location: [tripCountry, prov, tripCity].filter(Boolean).join(" / "),
          travel_meta: { location_mode: "COUNTRY_CITY", country: tripCountry, province: prov, city: tripCity },
          meals_count: tripDays,
          dinner: 0
        }
      ];
    }
    return rows.map((r) => ({
      line_date: r.date,
      location: `${r.start} → ${r.dest}`,
      travel_meta: { location_mode: "DISTRICT", startDistrict: r.start, destinationDistrict: r.dest },
      meals_count: isDaily && !toNumber(r.units) ? 1 : toNumber(r.units),
      dinner: 0
    }));
  }

  async function submit() {
    const problems = validate();
    setErrors(problems);
    if (problems.length) return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      let id = draftId;
      if (!id) {
        if (onBehalf) payload.beneficiary_user_id = requestFor;
        id = (await api.createAdvance(payload)).id;
        setDraftId(id);
      } else {
        // Retrying after a later step failed - update the same draft rather than creating a duplicate.
        await api.updateAdvance(id, payload);
      }
      if (showTravel) await api.updateAdvanceLines(id, buildLines());
      const result = await api.submitAdvance(id);
      Alert.alert("Advance submitted", result?.warning || "Your advance request has been submitted for approval.", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (e: any) {
      setErrors([
        e?.message || "Couldn't submit the advance.",
        ...(draftId ? ["It's saved as a draft - fix the problem and tap Submit again."] : [])
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  // --- Render ---
  if (loading || !modulesLoaded) {
    return (
      <View style={formStyles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!modules.createAdvance) {
    return (
      <View style={formStyles.center}>
        <Text style={formStyles.notice}>Creating advance requests in the app is switched off. Use the FlowDesk web app, or ask an admin to enable it.</Text>
      </View>
    );
  }
  if (loadError || !profile) {
    return (
      <View style={formStyles.center}>
        <Text style={formStyles.notice}>{loadError || "Couldn't load your profile."}</Text>
      </View>
    );
  }
  if (!selfAllowed && !(othersAllowed && beneficiaries.length) && !externalAllowed) {
    return (
      <View style={formStyles.center}>
        <Text style={formStyles.notice}>
          {profile.profile_completed
            ? "Advance requests aren't available for your employment type."
            : "Complete your profile on the FlowDesk web app before requesting an advance."}
        </Text>
      </View>
    );
  }

  const requestForOptions: SelectOption[] = [
    ...(selfAllowed ? [{ value: SELF, label: "Myself" }] : []),
    ...(othersAllowed
      ? beneficiaries.map((u) => ({
          value: u.id,
          label: personLabel(u),
          sub: principals.some((p) => p.id === u.id) ? "You're their PA" : titleCase(String(u.employment_type || ""))
        }))
      : []),
    ...(externalAllowed ? [{ value: EXTERNAL, label: "Apply for Other", sub: "Someone outside Econet - you receive the funds" }] : [])
  ];
  const salaryMonthOptions: SelectOption[] = [0, 1, 2].map((offset) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  });
  const paybackOptions: SelectOption[] = Array.from({ length: Math.max(1, maxPayback) }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} month${i ? "s" : ""}`
  }));

  return (
    <KeyboardAvoider style={formStyles.flex}>
      <KeyboardScrollView style={formStyles.screen} contentContainerStyle={[formStyles.content, { paddingHorizontal: gutter() }]} keyboardShouldPersistTaps="handled">
        {requestForOptions.length > 1 && (
          <Section title="Request for">
            <Field label="Who is this advance for?" hint={draftId ? "Locked - a draft already exists for this person." : undefined}>
              {draftId ? (
                <Input editable={false} value={requestForOptions.find((o) => o.value === requestFor)?.label} />
              ) : (
                <Select value={requestFor} options={requestForOptions} onChange={changeRequestFor} title="Request for" />
              )}
            </Field>
            {isExternal && (
              <>
                <Field label="External beneficiary">
                  <Select
                    value={payeeId}
                    options={payees.map((p) => ({ value: p.id, label: p.full_name, sub: p.organisation || p.category || undefined }))}
                    onChange={setPayeeId}
                    placeholder="Select who this is for…"
                    emptyText="No external payees yet - add one below."
                  />
                </Field>
                <TouchableOpacity onPress={() => setShowNewPayee((v) => !v)}>
                  <Text style={formStyles.link}>{showNewPayee ? "Cancel new payee" : "+ New external payee"}</Text>
                </TouchableOpacity>
                {showNewPayee && (
                  <View style={{ marginTop: 12 }}>
                    <Field label="Full name">
                      <Input value={newPayee.full_name} onChangeText={(t) => setNewPayee((p) => ({ ...p, full_name: t }))} placeholder="e.g. Karabo Ntsane" />
                    </Field>
                    <View style={formStyles.row}>
                      <View style={formStyles.flex}>
                        <Field label="Category">
                          <Input value={newPayee.category} onChangeText={(t) => setNewPayee((p) => ({ ...p, category: t }))} placeholder="e.g. Contractor" />
                        </Field>
                      </View>
                      <View style={formStyles.flex}>
                        <Field label="Organisation">
                          <Input value={newPayee.organisation} onChangeText={(t) => setNewPayee((p) => ({ ...p, organisation: t }))} placeholder="Optional" />
                        </Field>
                      </View>
                    </View>
                    <Field label="Phone / email">
                      <Input value={newPayee.phone} onChangeText={(t) => setNewPayee((p) => ({ ...p, phone: t }))} placeholder="Optional" />
                    </Field>
                    <PrimaryButton label={savingPayee ? "Saving…" : "Save payee"} variant="secondary" onPress={savePayee} disabled={savingPayee || !newPayee.full_name.trim()} />
                  </View>
                )}
                <View style={formStyles.divider} />
                <Field label="Amount">
                  <Input value={otherAmount} onChangeText={setOtherAmount} keyboardType="decimal-pad" placeholder="0.00" />
                </Field>
                <View style={formStyles.row}>
                  <View style={formStyles.flex}>
                    <Field label="Start date">
                      <DateInput value={otherStart} onChange={setOtherStart} minimumDate={earliestTripDate()} />
                    </Field>
                  </View>
                  <View style={formStyles.flex}>
                    <Field label="Finish date">
                      <DateInput value={otherEnd} onChange={setOtherEnd} minimumDate={otherStart || earliestTripDate()} />
                    </Field>
                  </View>
                </View>
                <Text style={formStyles.muted}>You receive the funds and remain accountable - approval follows your own workflow.</Text>
              </>
            )}
          </Section>
        )}

        <Section title="Advance">
          <Field label="Advance type">
            <Select value={typeCode} options={typeOptions} onChange={changeType} placeholder="Choose a type" title="Advance type" emptyText="No advance types are available to you." />
          </Field>
          <Field label="Purpose">
            <Input value={purpose} onChangeText={setPurpose} multiline placeholder="What is this advance for?" />
          </Field>

          {(isSalary || isLoan) && (
            <>
              <Field label={isSalary ? "Salary amount" : "Loan amount"}>
                <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
              </Field>
              {isSalary && (
                <Field label="Salary month">
                  <Select value={salaryMonth} options={salaryMonthOptions} onChange={setSalaryMonth} placeholder="Choose month" />
                </Field>
              )}
              <Field label="Payback duration">
                <Select value={payback} options={paybackOptions} onChange={setPayback} placeholder="Choose duration" />
              </Field>
            </>
          )}
        </Section>

        {showTravel && travelType && !isTrip && (
          <Section
            title={`${travelType.name} · ${fmtMoney(rate, currency)} per ${isDaily ? "day" : "meal"}`}
            right={
              <TouchableOpacity onPress={addRow} hitSlop={8} accessibilityLabel="Add day">
                <Plus size={20} color={colors.accent} />
              </TouchableOpacity>
            }
          >
            {rows.map((r, i) => (
              <View key={i}>
                {i > 0 && <View style={formStyles.divider} />}
                <View style={[formStyles.row, { alignItems: "center", marginBottom: 8 }]}>
                  <Text style={[formStyles.flex, { fontWeight: "700", color: colors.ink }]}>Day {i + 1}</Text>
                  {rows.length > 1 && (
                    <TouchableOpacity onPress={() => removeRow(i)} hitSlop={8} accessibilityLabel={`Remove day ${i + 1}`}>
                      <Trash2 size={18} color={colors.bad} />
                    </TouchableOpacity>
                  )}
                </View>
                <Field label="Date">
                  <DateInput
                    value={r.date}
                    onChange={(d) => updateRow(i, { date: d })}
                    minimumDate={i > 0 ? rows[i - 1].date : earliestTripDate()}
                    maximumDate={i < rows.length - 1 ? rows[i + 1].date : undefined}
                  />
                </Field>
                <View style={formStyles.row}>
                  <View style={formStyles.flex}>
                    <Field label="From">
                      {i === 0 ? (
                        <Select value={r.start} options={districtOptions} onChange={(v) => updateRow(i, { start: v })} placeholder="District" />
                      ) : (
                        <Input editable={false} value={r.start} placeholder="Previous day's destination" />
                      )}
                    </Field>
                  </View>
                  <View style={formStyles.flex}>
                    <Field label="To">
                      <Select value={r.dest} options={districtOptions} onChange={(v) => updateRow(i, { dest: v })} placeholder="District" />
                    </Field>
                  </View>
                </View>
                <Field
                  label={isDaily ? "Days" : "Meals"}
                  hint={isDaily ? "Leave blank to count as 1 day." : `Up to ${maxUnitsForRow(travelType, i)} meals on ${i === 0 ? "the first day" : "later days"}.`}
                >
                  <Input value={r.units} onChangeText={(t) => setUnits(i, t)} keyboardType="number-pad" placeholder="0" />
                </Field>
              </View>
            ))}
            <TouchableOpacity onPress={addRow} style={{ marginTop: 4 }}>
              <Text style={formStyles.link}>+ Add another day</Text>
            </TouchableOpacity>
          </Section>
        )}

        {isTrip && travelType && (
          <Section title={`Plan your trip · ${fmtMoney(rate, currency)} per day`}>
            <Field label="Where from?">
              <Select
                value={originIata}
                options={airportOptions(originIata)}
                onChange={(v) => {
                  pickAirport(v, setOriginIata);
                  setOriginManual("");
                }}
                onSearch={searchAirports}
                placeholder={originManual ? originManual : "Departure city or airport code"}
                title="Where from?"
                emptyText="Type at least 2 letters to search airports."
              />
            </Field>
            <Field label="…or travelling by road from" hint="e.g. Maseru - leave blank if you picked an airport.">
              <Input
                value={originManual}
                onChangeText={(t) => {
                  setOriginManual(t);
                  if (t) setOriginIata("");
                }}
                placeholder="Town / city"
              />
            </Field>
            <Field label="Where to?">
              <Segmented
                value={destManual ? "road" : "air"}
                options={[
                  { value: "air", label: "Airport" },
                  { value: "road", label: "By road" }
                ]}
                onChange={(v) => {
                  setDestManual(v === "road");
                  setDestIata("");
                  setDestCity("");
                  setDestCountry("");
                }}
              />
            </Field>
            {destManual ? (
              <View style={formStyles.row}>
                <View style={formStyles.flex}>
                  <Field label="Town / city">
                    <Input value={destCity} onChangeText={setDestCity} placeholder="e.g. Ladybrand" />
                  </Field>
                </View>
                <View style={formStyles.flex}>
                  <Field label="Country">
                    <Input value={destCountry} onChangeText={setDestCountry} placeholder="e.g. South Africa" />
                  </Field>
                </View>
              </View>
            ) : (
              <Field label="Destination airport">
                <Select
                  value={destIata}
                  options={airportOptions(destIata)}
                  onChange={(v) => pickAirport(v, setDestIata)}
                  onSearch={searchAirports}
                  placeholder="Destination city or airport code"
                  title="Where to?"
                  emptyText="Type at least 2 letters to search airports."
                />
              </Field>
            )}
            <View style={formStyles.row}>
              <View style={formStyles.flex}>
                <Field label="Departure">
                  <DateInput value={departure} onChange={setDeparture} minimumDate={earliestTripDate()} />
                </Field>
              </View>
              <View style={formStyles.flex}>
                <Field label="Return">
                  <DateInput value={returnDate} onChange={setReturnDate} minimumDate={departure || earliestTripDate()} />
                </Field>
              </View>
            </View>
            {tripIsSouthAfrica && (
              <Field label="Province">
                <Select value={province} options={SOUTH_AFRICA_PROVINCES.map((p) => ({ value: p, label: p }))} onChange={setProvince} placeholder="Select province" />
              </Field>
            )}
            {tripDays > 0 && (
              <SummaryRow label={`${tripDays} ${tripDays === 1 ? "day" : "days"} × ${fmtMoney(rate, currency)}`} value={fmtMoney(tripDays * rate, currency)} />
            )}
          </Section>
        )}

        {showTravel && (
          <Section title="Extra cost (if any)">
            <View style={formStyles.row}>
              <View style={[formStyles.flex, { flex: 2 }]}>
                <Field label="Justification">
                  <Input value={extraDescription} onChangeText={setExtraDescription} placeholder={extra > 0 ? "Required" : "What is it for?"} />
                </Field>
              </View>
              <View style={formStyles.flex}>
                <Field label="Amount">
                  <Input value={extraAmount} onChangeText={setExtraAmount} keyboardType="decimal-pad" placeholder="0.00" />
                </Field>
              </View>
            </View>
          </Section>
        )}

        <Section title="Payment">
          {allowedMethods.length > 1 && (
            <Field label="Receive via">
              <Segmented
                value={method}
                options={allowedMethods.map((m) => ({ value: m, label: m === "ECOCASH" ? "EcoCash" : "Bank" }))}
                onChange={setPaymentMethod}
              />
            </Field>
          )}
          {method === "ECOCASH" ? (
            <Field label="EcoCash number">
              <Input value={ecocash} onChangeText={setEcocash} keyboardType="phone-pad" placeholder="e.g. 6xxxxxxx" />
            </Field>
          ) : (
            <>
              <Field label="Bank">
                <Input value={bankName} onChangeText={setBankName} placeholder="e.g. Standard Lesotho Bank" />
              </Field>
              <View style={formStyles.row}>
                <View style={formStyles.flex}>
                  <Field label="Account number">
                    <Input value={bankAccount} onChangeText={setBankAccount} keyboardType="number-pad" />
                  </Field>
                </View>
                <View style={formStyles.flex}>
                  <Field label="Branch">
                    <Input value={bankBranch} onChangeText={setBankBranch} />
                  </Field>
                </View>
              </View>
            </>
          )}
        </Section>

        <Section title="Summary">
          {showTravel && extra > 0 && <SummaryRow label="Travel" value={fmtMoney(total - extra, currency)} />}
          {showTravel && extra > 0 && <SummaryRow label="Extra cost" value={fmtMoney(extra, currency)} />}
          <SummaryRow label="Amount requested" value={fmtMoney(total, currency)} strong />
          {showTravel && <Text style={[formStyles.muted, { marginTop: 4 }]}>{"Final amount is calculated by FlowDesk from HR's current rates."}</Text>}
          {typeCode ? (
            <>
              <View style={formStyles.divider} />
              <Text style={[formStyles.muted, { fontWeight: "700", marginBottom: 4 }]}>APPROVAL ROUTE</Text>
              {chain === null ? (
                <ActivityIndicator color={colors.accent} />
              ) : chain.length ? (
                chain.map((step, i) => <Text key={i} style={{ color: colors.ink, fontSize: 13.5, paddingVertical: 2 }}>{`${i + 1}. ${step}`}</Text>)
              ) : (
                <Text style={formStyles.error}>No approval workflow is configured for this advance. Submit it on the FlowDesk web app, where you can choose approvers.</Text>
              )}
            </>
          ) : null}
        </Section>

        {errors.map((e, i) => (
          <Text key={i} style={formStyles.error}>
            • {e}
          </Text>
        ))}
        <PrimaryButton label={submitting ? "Submitting…" : "Submit advance"} onPress={submit} disabled={submitting || noWorkflow} />
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}
