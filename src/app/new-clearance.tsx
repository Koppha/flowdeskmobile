import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Camera, FileText, Image as ImageIcon, Plus, Trash2 } from "lucide-react-native";
import { api, type ClaimTripInput } from "@/lib/api";
import { useMobileModules } from "@/lib/mobile-modules";
import { RESERVED_TYPES, addDays, fmtMoney, formatDisplayDate, toNumber, todayIso } from "@/lib/request-forms";
import { DateInput, Field, Input, PrimaryButton, Section, Select, SummaryRow, type SelectOption, useFormStyles } from "@/components/form";
import { useLayout } from "@/components/layout";
import { KeyboardAvoider, KeyboardScrollView } from "@/components/keyboard";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

type Advance = { id: string; type: string; status: string; approved_total: number | string | null; requested_total: number | string; created_at: string; travel_type_name?: string; travel_currency?: string | null };
type Claim = { id: string; status: string; linked_advance_id: string | null };
type TripRow = { date: string; from: string; purpose: string; meals: string; transport: string; other: string };
type Receipt = { id: string; file_name: string; size_bytes?: number };

// Same limits as the backend's receipt upload (claims.routes.ts / lib/uploads.ts).
const RECEIPT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];
const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;

function monthOptions(): SelectOption[] {
  const out: SelectOption[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (let i = 0; i < 14; i++) {
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

const num = (v: unknown) => Number(v) || 0;
const money = (n: number) => (n ? String(Number(n.toFixed(2))) : "");

export default function NewClearanceScreen() {
  const { colors } = useTheme();
  const formStyles = useFormStyles();
  const receiptStyles = useReceiptStyles();
  const router = useRouter();
  const { gutter } = useLayout();
  const { modules, loaded: modulesLoaded } = useMobileModules();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pick, setPick] = useState("");

  // The draft claim being edited (created as soon as an advance is chosen).
  const [claimId, setClaimId] = useState<string | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [currency, setCurrency] = useState("LSL");
  const [month, setMonth] = useState("");
  const [dutyStation, setDutyStation] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [engineCc, setEngineCc] = useState("");
  const [vehicleRate, setVehicleRate] = useState("");
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [extraAmount, setExtraAmount] = useState("");
  const [extraDescription, setExtraDescription] = useState("");
  const [overspendReason, setOverspendReason] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(0);

  const [busy, setBusy] = useState<"start" | "save" | "submit" | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [me, adv, cl] = await Promise.all([api.me(), api.myAdvances(), api.myClearances()]);
        setProfileComplete(Boolean(me.profile_completed));
        setAdvances(Array.isArray(adv) ? adv : adv.items || []);
        setClaims(Array.isArray(cl) ? cl : cl.items || []);
      } catch (e: any) {
        setLoadError(e?.message || "Couldn't load your advances.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Paid travel advances with no active clearance yet - plus any of my
  // DRAFT clearances, which must be resumed (a draft blocks starting another).
  const options: SelectOption[] = useMemo(() => {
    const blocked = new Set(claims.filter((c) => c.status !== "REJECTED" && c.linked_advance_id).map((c) => c.linked_advance_id));
    const label = (a: Advance) =>
      `${a.travel_type_name || a.type.replace(/_/g, " ")} - ${fmtMoney(num(a.approved_total ?? a.requested_total), a.travel_currency)}`;
    const fresh = advances
      .filter((a) => a.status === "PAID" && a.type !== RESERVED_TYPES.SALARY && a.type !== RESERVED_TYPES.LOAN && !blocked.has(a.id))
      .map((a) => ({ value: `advance:${a.id}`, label: label(a), sub: a.created_at ? `Paid advance · ${formatDisplayDate(a.created_at.slice(0, 10))}` : "Paid advance" }));
    const drafts = claims
      .filter((c) => c.status === "DRAFT")
      .map((c) => {
        const a = advances.find((x) => x.id === c.linked_advance_id);
        return { value: `claim:${c.id}`, label: a ? label(a) : "Draft clearance", sub: "Resume draft" };
      });
    return [...drafts, ...fresh];
  }, [advances, claims]);

  async function loadClaim(id: string) {
    const c = await api.claimDetail(id);
    setClaimId(id);
    setAdvanceAmount(num(c.advance_amount));
    // A clearance is settled in its advance's currency - fall back to it if the claim has none.
    setCurrency(c.currency || advances.find((a) => a.id === c.linked_advance_id)?.travel_currency || "LSL");
    setMonth(c.month || "");
    setDutyStation(c.duty_station || "");
    setProjectNumber(c.project_number || "");
    setVehicleReg(c.vehicle_reg || "");
    setVehicleType(c.vehicle_type || "");
    setEngineCc(c.engine_cc || "");
    setVehicleRate(c.vehicle_rate != null ? String(c.vehicle_rate) : "");
    setExtraAmount(money(num(c.extra_cost_amount)));
    setExtraDescription(c.extra_cost_description || "");
    setOverspendReason(c.reason_for_overspend || "");
    setReceipts(c.receipts || []);
    setTrips(
      (c.trips || []).map((t: any) => ({
        date: String(t.trip_date).slice(0, 10),
        from: t.from_place || "",
        purpose: t.purpose || "",
        // The web form shows breakfast/lunch/dinner as one "Meals" figure.
        meals: money(num(t.breakfast) + num(t.lunch) + num(t.dinner)),
        transport: money(num(t.petrol_allowance)),
        other: money(num(t.other_expenses))
      }))
    );
  }

  async function start() {
    if (!pick) return;
    setBusy("start");
    setErrors([]);
    try {
      if (pick.startsWith("claim:")) {
        await loadClaim(pick.slice(6));
      } else {
        const thisMonth = todayIso().slice(0, 7);
        // The server copies the advance amount and seeds the trip lines from it.
        const { id } = await api.createClaim({ linked_advance_id: pick.slice(8), month: thisMonth });
        await loadClaim(id);
      }
    } catch (e: any) {
      setErrors([e?.message || "Couldn't start the clearance."]);
    } finally {
      setBusy(null);
    }
  }

  // --- Totals (mirrors the web reconciliation summary) ---
  const tripTotal = trips.reduce((s, t) => s + toNumber(t.meals) + toNumber(t.transport) + toNumber(t.other), 0);
  const extra = toNumber(extraAmount);
  const total = tripTotal + extra;
  const balance = advanceAmount - total;
  const settlement = Math.abs(balance) < 0.005 ? "Fully cleared" : balance > 0 ? "Employee owes company" : "Company owes employee";

  function updateTrip(i: number, patch: Partial<TripRow>) {
    setTrips((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTrip() {
    setTrips((prev) => [...prev, { date: prev.length ? addDays(prev[prev.length - 1].date, 1) : todayIso(), from: "", purpose: "", meals: "", transport: "", other: "" }]);
  }

  // --- Receipts ---
  async function uploadFiles(files: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }[]) {
    if (!claimId) return;
    for (const f of files) {
      const name = f.name || `receipt-${Date.now()}.jpg`;
      const ext = name.split(".").pop()?.toLowerCase() || "";
      if (!RECEIPT_EXTENSIONS.includes(ext)) {
        Alert.alert("Unsupported file", `${name}: receipts must be PDF, JPG or PNG.`);
        continue;
      }
      if (f.size && f.size > MAX_RECEIPT_BYTES) {
        Alert.alert("File too large", `${name} is over 25 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const type = f.mimeType || (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg");
        const res: any = await api.uploadClaimReceipt(claimId, { uri: f.uri, name, type });
        if (res?.receipt) setReceipts((r) => [...r, { ...res.receipt, file_name: name }]);
      } catch (e: any) {
        Alert.alert("Upload failed", `${name}: ${e?.message || "Something went wrong."}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function fromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Allow camera access in Settings to photograph receipts.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!res.canceled) uploadFiles(res.assets.map((a) => ({ uri: a.uri, name: a.fileName || `receipt-${Date.now()}.jpg`, mimeType: a.mimeType, size: a.fileSize })));
  }
  async function fromPhotos() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: true });
    if (!res.canceled) uploadFiles(res.assets.map((a) => ({ uri: a.uri, name: a.fileName, mimeType: a.mimeType, size: a.fileSize })));
  }
  async function fromFiles() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], multiple: true });
    if (!res.canceled) uploadFiles(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size })));
  }
  function removeReceipt(r: Receipt) {
    if (!claimId) return;
    Alert.alert("Remove receipt", `Remove ${r.file_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteClaimReceipt(claimId, r.id);
            setReceipts((list) => list.filter((x) => x.id !== r.id));
          } catch (e: any) {
            Alert.alert("Couldn't remove receipt", e?.message || "Something went wrong.");
          }
        }
      }
    ]);
  }

  // --- Save / submit ---
  function validate(submitting: boolean) {
    const e: string[] = [];
    if (!month) e.push("Choose the month.");
    if (!trips.length) e.push("Add at least one trip line.");
    trips.forEach((t, i) => i > 0 && t.date < trips[i - 1].date && e.push(`Line ${i + 1}: dates must be in order.`));
    if (submitting && !(total > 0)) e.push("The actual expenditure must be more than zero.");
    if (submitting && extra > 0 && !extraDescription.trim()) e.push("Justify the extra cost.");
    if (submitting && balance < 0 && !overspendReason.trim()) e.push("Explain why you spent more than the advance.");
    return e;
  }

  async function persist(submit: boolean) {
    if (!claimId) return;
    const problems = validate(submit);
    setErrors(problems);
    if (problems.length) return;
    setBusy(submit ? "submit" : "save");
    try {
      const rate = vehicleRate.trim() ? toNumber(vehicleRate) : undefined;
      await api.updateClaim(claimId, {
        month,
        duty_station: dutyStation.trim() || undefined,
        project_number: projectNumber.trim() || undefined,
        vehicle_reg: vehicleReg.trim() || undefined,
        vehicle_type: vehicleType.trim() || undefined,
        engine_cc: engineCc.trim() || undefined,
        vehicle_rate: rate,
        reason_for_overspend: overspendReason.trim() || undefined
      });
      const payload: ClaimTripInput[] = trips.map((t) => ({
        trip_date: t.date,
        from_place: t.from.trim() || undefined,
        purpose: t.purpose.trim() || undefined,
        km_travelled: 0,
        petrol_allowance: toNumber(t.transport),
        breakfast: 0,
        lunch: toNumber(t.meals),
        dinner: 0,
        other_expenses: toNumber(t.other)
      }));
      await api.updateClaimTrips(claimId, { trips: payload, extra_cost_amount: extra, extra_cost_description: extraDescription.trim() || undefined });
      if (submit) {
        await api.submitClaim(claimId);
        Alert.alert("Clearance submitted", "Your clearance has been submitted for approval.", [{ text: "OK", onPress: () => router.back() }]);
      } else {
        Alert.alert("Draft saved", "You can come back and finish this clearance later.");
      }
    } catch (e: any) {
      setErrors([e?.message || "Couldn't save the clearance."]);
    } finally {
      setBusy(null);
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
  if (!modules.createClearance) {
    return (
      <View style={formStyles.center}>
        <Text style={formStyles.notice}>Creating clearances in the app is switched off. Use the FlowDesk web app, or ask an admin to enable it.</Text>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={formStyles.center}>
        <Text style={formStyles.notice}>{loadError}</Text>
      </View>
    );
  }
  if (!profileComplete) {
    return (
      <View style={formStyles.center}>
        <Text style={formStyles.notice}>Complete your profile on the FlowDesk web app before requesting a clearance.</Text>
      </View>
    );
  }

  if (!claimId) {
    return (
      <ScrollView style={formStyles.screen} contentContainerStyle={[formStyles.content, { paddingHorizontal: gutter() }]}>
        <Section title="Advance to clear">
          {options.length ? (
            <>
              <Field label="Paid advance" hint="Only paid travel advances without a clearance are listed.">
                <Select value={pick} options={options} onChange={setPick} placeholder="Choose an advance" title="Advance to clear" />
              </Field>
              {errors.map((e, i) => (
                <Text key={i} style={formStyles.error}>
                  • {e}
                </Text>
              ))}
              <PrimaryButton label={busy === "start" ? "Starting…" : pick.startsWith("claim:") ? "Resume clearance" : "Start clearance"} onPress={start} disabled={!pick || busy !== null} />
            </>
          ) : (
            <Text style={formStyles.muted}>You have no paid travel advances waiting to be cleared.</Text>
          )}
        </Section>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoider style={formStyles.flex}>
      <KeyboardScrollView style={formStyles.screen} contentContainerStyle={[formStyles.content, { paddingHorizontal: gutter() }]} keyboardShouldPersistTaps="handled">
        <Section title="Details">
          <Field label="Month">
            <Select value={month} options={monthOptions()} onChange={setMonth} placeholder="Choose month" />
          </Field>
          <View style={formStyles.row}>
            <View style={formStyles.flex}>
              <Field label="Duty station">
                <Input value={dutyStation} onChangeText={setDutyStation} />
              </Field>
            </View>
            <View style={formStyles.flex}>
              <Field label="Project number">
                <Input value={projectNumber} onChangeText={setProjectNumber} />
              </Field>
            </View>
          </View>
          <View style={formStyles.row}>
            <View style={formStyles.flex}>
              <Field label="Vehicle reg.">
                <Input value={vehicleReg} onChangeText={setVehicleReg} autoCapitalize="characters" />
              </Field>
            </View>
            <View style={formStyles.flex}>
              <Field label="Vehicle type">
                <Input value={vehicleType} onChangeText={setVehicleType} />
              </Field>
            </View>
          </View>
          <View style={formStyles.row}>
            <View style={formStyles.flex}>
              <Field label="Engine CC">
                <Input value={engineCc} onChangeText={setEngineCc} keyboardType="number-pad" />
              </Field>
            </View>
            <View style={formStyles.flex}>
              <Field label="Rate per km">
                <Input value={vehicleRate} onChangeText={setVehicleRate} keyboardType="decimal-pad" />
              </Field>
            </View>
          </View>
        </Section>

        <Section
          title="Actual expenditure"
          right={
            <TouchableOpacity onPress={addTrip} hitSlop={8} accessibilityLabel="Add line">
              <Plus size={20} color={colors.accent} />
            </TouchableOpacity>
          }
        >
          {trips.map((t, i) => (
            <View key={i}>
              {i > 0 && <View style={formStyles.divider} />}
              <View style={[formStyles.row, { alignItems: "center", marginBottom: 8 }]}>
                <Text style={[formStyles.flex, { fontWeight: "700", color: colors.ink }]}>Line {i + 1}</Text>
                <Text style={{ color: colors.ink, fontWeight: "600" }}>{fmtMoney(toNumber(t.meals) + toNumber(t.transport) + toNumber(t.other), currency)}</Text>
                <TouchableOpacity onPress={() => setTrips((p) => p.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityLabel={`Remove line ${i + 1}`}>
                  <Trash2 size={18} color={colors.bad} />
                </TouchableOpacity>
              </View>
              <View style={formStyles.row}>
                <View style={formStyles.flex}>
                  <Field label="Date">
                    <DateInput value={t.date} onChange={(d) => updateTrip(i, { date: d })} />
                  </Field>
                </View>
                <View style={formStyles.flex}>
                  <Field label="Location">
                    <Input value={t.from} onChangeText={(v) => updateTrip(i, { from: v })} />
                  </Field>
                </View>
              </View>
              <Field label="Purpose">
                <Input value={t.purpose} onChangeText={(v) => updateTrip(i, { purpose: v })} />
              </Field>
              <View style={formStyles.row}>
                <View style={formStyles.flex}>
                  <Field label="Meals">
                    <Input value={t.meals} onChangeText={(v) => updateTrip(i, { meals: v })} keyboardType="decimal-pad" placeholder="0.00" />
                  </Field>
                </View>
                <View style={formStyles.flex}>
                  <Field label="Transport">
                    <Input value={t.transport} onChangeText={(v) => updateTrip(i, { transport: v })} keyboardType="decimal-pad" placeholder="0.00" />
                  </Field>
                </View>
                <View style={formStyles.flex}>
                  <Field label="Other">
                    <Input value={t.other} onChangeText={(v) => updateTrip(i, { other: v })} keyboardType="decimal-pad" placeholder="0.00" />
                  </Field>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={addTrip} style={{ marginTop: 4 }}>
            <Text style={formStyles.link}>+ Add line</Text>
          </TouchableOpacity>
        </Section>

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

        <Section title={`Receipts${receipts.length ? ` (${receipts.length})` : ""}`}>
          {receipts.map((r) => (
            <View key={r.id} style={receiptStyles.row}>
              <FileText size={18} color={colors.muted} />
              <Text style={receiptStyles.name} numberOfLines={1}>
                {r.file_name}
              </Text>
              <TouchableOpacity onPress={() => removeReceipt(r)} hitSlop={8} accessibilityLabel={`Remove ${r.file_name}`}>
                <Trash2 size={18} color={colors.bad} />
              </TouchableOpacity>
            </View>
          ))}
          {uploading > 0 && (
            <View style={receiptStyles.row}>
              <ActivityIndicator color={colors.accent} />
              <Text style={receiptStyles.name}>Uploading {uploading}…</Text>
            </View>
          )}
          <View style={receiptStyles.actions}>
            <ReceiptButton icon={<Camera size={18} color={colors.accent} />} label="Camera" onPress={fromCamera} />
            <ReceiptButton icon={<ImageIcon size={18} color={colors.accent} />} label="Photos" onPress={fromPhotos} />
            <ReceiptButton icon={<FileText size={18} color={colors.accent} />} label="Files" onPress={fromFiles} />
          </View>
          <Text style={formStyles.muted}>PDF, JPG or PNG, up to 25 MB each.</Text>
        </Section>

        <Section title="Reconciliation">
          <SummaryRow label="Advance received" value={fmtMoney(advanceAmount, currency)} />
          <SummaryRow label="Actual expenditure" value={fmtMoney(total, currency)} />
          <SummaryRow label="Variance" value={fmtMoney(balance, currency)} strong />
          <Text style={[formStyles.muted, { marginTop: 4 }]}>{settlement}</Text>
          {balance < 0 && (
            <View style={{ marginTop: spacing.md }}>
              <Field label="Reason for overspend">
                <Input value={overspendReason} onChangeText={setOverspendReason} multiline placeholder="Required when you spent more than the advance" />
              </Field>
            </View>
          )}
        </Section>

        {errors.map((e, i) => (
          <Text key={i} style={formStyles.error}>
            • {e}
          </Text>
        ))}
        <PrimaryButton label={busy === "submit" ? "Submitting…" : "Submit clearance"} onPress={() => persist(true)} disabled={busy !== null || uploading > 0} />
        <PrimaryButton label={busy === "save" ? "Saving…" : "Save draft"} variant="secondary" onPress={() => persist(false)} disabled={busy !== null || uploading > 0} />
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

function ReceiptButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  const receiptStyles = useReceiptStyles();
  return (
    <TouchableOpacity style={receiptStyles.button} onPress={onPress} accessibilityRole="button">
      {icon}
      <Text style={receiptStyles.buttonLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const useReceiptStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  name: { flex: 1, fontSize: 14, color: colors.ink },
  actions: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.sm },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.md
  },
  buttonLabel: { color: colors.accent, fontWeight: "600", fontSize: 13.5 }
}));
