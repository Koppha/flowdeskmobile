import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserRound } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { api, type OrgStructure } from "@/lib/api";
import { Field, Input, PrimaryButton, Section, Select, useFormStyles } from "@/components/form";
import { useLayout } from "@/components/layout";
import { makeStyles, radii, spacing, useTheme } from "@/theme";

// First sign-in: the account has no profile yet, so - like the web portal -
// nothing else opens until it is filled in. Same fields, rules and endpoint
// as the portal's "Complete Your Profile" (POST /auth/complete-profile); the
// org structure and employment types come from the server. The org levels
// use the portal's labels: Company > Division > Department > Section
// (divisions > departments > sections > teams in the database).

const CAN_REQUEST = ["PERMANENT", "INTERN", "TEMPORARY"];

/** Lesotho numbers: 8 digits, with or without +266. Returns null if it doesn't look like one. */
function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, "").replace(/^266(?=\d{8}$)/, "");
  return /^\d{8}$/.test(digits) ? `+266${digits}` : null;
}

export default function CompleteProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const formStyles = useFormStyles();
  const insets = useSafeAreaInsets();
  const { gutter } = useLayout();
  const { profileSaved, logout } = useAuth();

  const [org, setOrg] = useState<OrgStructure | null>(null);
  const [empTypes, setEmpTypes] = useState<{ code: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState("PERMANENT");
  const [employeeNo, setEmployeeNo] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return Promise.all([api.orgStructure(), api.employmentTypes(), api.me().catch(() => null)]).then(([o, types, me]) => {
      setOrg(o);
      const active = (types || []).filter((t) => t.active !== false);
      setEmpTypes(active);
      if (active.length && !active.some((t) => t.code === "PERMANENT")) setEmploymentType(active[0].code);
      // Whatever the account already has (e.g. the name from the company directory).
      const [first, ...rest] = (me?.full_name || "").trim().split(/\s+/);
      if (first) setFirstName(first);
      if (rest.length) setLastName(rest.join(" "));
      if (me?.employee_no) setEmployeeNo(me.employee_no);
      if (me?.phone) setPhone(me.phone);
    }, (e: any) => setLoadError(e?.message || "Couldn't load the organisation structure."));
  }

  useEffect(() => {
    void load();
  }, []);

  const divisions = useMemo(() => (org?.divisions || []).filter((d) => d.active !== false), [org]);
  const departments = useMemo(() => {
    const all = (org?.departments || []).filter((d) => d.active !== false);
    if (!divisions.length || !divisionId) return divisions.length ? [] : all;
    return all.filter((d) => d.division_id === divisionId || (d.is_business_partner && (d.division_ids || []).includes(divisionId)));
  }, [org, divisions, divisionId]);
  const sections = useMemo(() => (departmentId ? (org?.sections || []).filter((s) => s.active !== false && s.department_id === departmentId) : []), [org, departmentId]);
  const teams = useMemo(() => (sectionId ? (org?.teams || []).filter((t) => t.active !== false && t.section_id === sectionId) : []), [org, sectionId]);

  const permanent = employmentType === "PERMANENT";

  async function save() {
    setError(null);
    const department = (org?.departments || []).find((d) => d.id === departmentId);
    if (!firstName.trim() || !lastName.trim()) return setError("Enter your first name and last name.");
    if (divisions.length && !divisionId) return setError("Choose your company.");
    if (!department) return setError("Choose your division.");
    if (permanent && !employeeNo.trim()) return setError("Enter your employment number.");
    const cleanPhone = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !cleanPhone) return setError("Enter your phone number as 8 digits, e.g. 6222 1234.");

    setSaving(true);
    try {
      const { token } = await api.completeProfile({
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        department: department.name,
        division_id: divisionId ?? department.division_id ?? null,
        section_id: sectionId,
        team_id: teamId,
        employment_type: employmentType,
        employee_no: employeeNo.trim() || undefined
      });
      // The profile is saved either way; the phone is a nice-to-have.
      if (cleanPhone) await api.updatePhone(cleanPhone).catch(() => {});
      await profileSaved(token);
      if (!CAN_REQUEST.includes(employmentType)) {
        Alert.alert("Profile saved", "Your employment type can't request advances, but you can still use the rest of FlowDesk.");
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (!org) {
    return (
      <View style={formStyles.center}>
        {loadError ? (
          <>
            <Text style={formStyles.notice}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoadError(null);
                void load();
              }}
              style={{ marginTop: spacing.lg }}
            >
              <Text style={formStyles.link}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void logout()} style={{ marginTop: spacing.lg }}>
              <Text style={formStyles.muted}>Sign out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.accent} size="large" />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={formStyles.flex} behavior="padding">
      <ScrollView
        style={formStyles.screen}
        contentContainerStyle={[formStyles.content, { paddingTop: insets.top + spacing.xl, paddingHorizontal: gutter() }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.badge}>
            <UserRound size={24} color="#fff" />
          </View>
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.body}>Welcome to FlowDesk. Tell us who you are and where you sit, so your requests reach the right approvers.</Text>
        </View>

        <Section title="About you">
          <View style={formStyles.row}>
            <View style={formStyles.flex}>
              <Field label="First name">
                <Input value={firstName} onChangeText={setFirstName} autoCapitalize="words" textContentType="givenName" />
              </Field>
            </View>
            <View style={formStyles.flex}>
              <Field label="Last name">
                <Input value={lastName} onChangeText={setLastName} autoCapitalize="words" textContentType="familyName" />
              </Field>
            </View>
          </View>
          <Field label="Phone number (optional)" hint="Your Econet number, so colleagues can reach you (e.g. on standby).">
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="6222 1234" textContentType="telephoneNumber" />
          </Field>
        </Section>

        <Section title="Where you work">
          {divisions.length > 0 && (
            <Field label="Company">
              <Select
                value={divisionId}
                title="Company"
                placeholder="Select company"
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(v) => {
                  setDivisionId(v);
                  setDepartmentId(null);
                  setSectionId(null);
                  setTeamId(null);
                }}
              />
            </Field>
          )}
          <Field label="Division">
            <Select
              value={departmentId}
              title="Division"
              placeholder={divisions.length && !divisionId ? "Select a company first" : "Select division"}
              emptyText={divisions.length && !divisionId ? "Select a company first." : "No divisions available."}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => {
                setDepartmentId(v);
                setSectionId(null);
                setTeamId(null);
              }}
            />
          </Field>
          {sections.length > 0 && (
            <Field label="Department (optional)">
              <Select
                value={sectionId}
                title="Department"
                placeholder="None"
                options={[{ value: "", label: "None" }, ...sections.map((s) => ({ value: s.id, label: s.name }))]}
                onChange={(v) => {
                  setSectionId(v || null);
                  setTeamId(null);
                }}
              />
            </Field>
          )}
          {teams.length > 0 && (
            <Field label="Section (optional)">
              <Select
                value={teamId}
                title="Section"
                placeholder="None"
                options={[{ value: "", label: "None" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                onChange={(v) => setTeamId(v || null)}
              />
            </Field>
          )}
        </Section>

        <Section title="Employment">
          <Field label="Employment type" hint={CAN_REQUEST.includes(employmentType) ? undefined : "This employment type cannot request advances."}>
            <Select
              value={employmentType}
              title="Employment type"
              options={empTypes.map((t) => ({ value: t.code, label: t.name }))}
              onChange={setEmploymentType}
            />
          </Field>
          <Field label={permanent ? "Employment number" : "Employment number (optional)"}>
            <Input value={employeeNo} onChangeText={setEmployeeNo} autoCapitalize="characters" autoCorrect={false} />
          </Field>
        </Section>

        {error && <Text style={formStyles.error}>{error}</Text>}
        <PrimaryButton label={saving ? "Saving…" : "Save and continue"} onPress={() => void save()} disabled={saving} />
        <TouchableOpacity onPress={() => void logout()} style={styles.signOut} disabled={saving}>
          <Text style={formStyles.muted}>Not you? Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: { alignItems: "center", marginBottom: spacing.xl },
  badge: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink, textAlign: "center" },
  body: { marginTop: 6, fontSize: 13.5, color: colors.muted, textAlign: "center", lineHeight: 19, maxWidth: 340 },
  signOut: { alignItems: "center", paddingVertical: spacing.lg, borderRadius: radii.md }
}));
