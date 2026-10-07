import { useMemo, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronDown, Search, X } from "lucide-react-native";
import { colors, radii, spacing } from "@/theme";
import { formatDisplayDate, fromIsoDate, toIsoDate } from "@/lib/request-forms";

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && styles.textarea, props.style]} />;
}

export type SelectOption = { value: string; label: string; sub?: string };

/** A dropdown that opens a full-height list (with search for long lists). */
export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  title,
  searchable = options.length > 8,
  onSearch,
  emptyText = "Nothing to choose from."
}: {
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  searchable?: boolean;
  /** Server-side search (e.g. airports) - otherwise options are filtered locally. */
  onSearch?: (q: string) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const visible = useMemo(() => {
    if (onSearch || !q.trim()) return options;
    const term = q.trim().toLowerCase();
    return options.filter((o) => `${o.label} ${o.sub || ""}`.toLowerCase().includes(term));
  }, [options, q, onSearch]);

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={() => setOpen(true)} accessibilityRole="button">
        <View style={styles.selectRow}>
          <Text style={[styles.selectText, !selected && styles.placeholder]} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          <ChevronDown size={16} color={colors.muted} />
        </View>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title || placeholder}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
              <X size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          {(searchable || onSearch) && (
            <View style={styles.searchBox}>
              <Search size={16} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={(t) => {
                  setQ(t);
                  onSearch?.(t);
                }}
                placeholder="Search"
                placeholderTextColor={colors.muted}
                autoFocus
                style={styles.searchInput}
              />
            </View>
          )}
          <FlatList
            data={visible}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.emptyList}>{emptyText}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.option, item.value === value && styles.optionSelected]}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQ("");
                }}
              >
                <Text style={styles.optionLabel}>{item.label}</Text>
                {item.sub ? <Text style={styles.optionSub}>{item.sub}</Text> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

/** A YYYY-MM-DD date field backed by the native date picker. */
export function DateInput({
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = "Select date"
}: {
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  placeholder?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const current = value ? fromIsoDate(value) : minimumDate ? fromIsoDate(minimumDate) : new Date();
  const min = minimumDate ? fromIsoDate(minimumDate) : undefined;
  const max = maximumDate ? fromIsoDate(maximumDate) : undefined;

  function open() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        minimumDate: min,
        maximumDate: max,
        onChange: (event, date) => {
          if (event.type === "set" && date) onChange(toIsoDate(date));
        }
      });
    } else {
      setIosOpen(true);
    }
  }

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={open} accessibilityRole="button">
        <View style={styles.selectRow}>
          <Text style={[styles.selectText, !value && styles.placeholder]}>{value ? formatDisplayDate(value) : placeholder}</Text>
          <CalendarDays size={16} color={colors.muted} />
        </View>
      </TouchableOpacity>
      {Platform.OS === "ios" && (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)}>
            <View style={styles.iosSheet}>
              <DateTimePicker
                value={current}
                mode="date"
                display="inline"
                minimumDate={min}
                maximumDate={max}
                onChange={(_e, date) => date && onChange(toIsoDate(date))}
              />
              <PrimaryButton label="Done" onPress={() => setIosOpen(false)} />
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[styles.segment, o.value === value && styles.segmentActive]}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
        >
          <Text style={[styles.segmentLabel, o.value === value && styles.segmentLabelActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = "primary"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <TouchableOpacity
      style={[styles.button, variant === "secondary" && styles.buttonSecondary, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={[styles.buttonLabel, variant === "secondary" && styles.buttonLabelSecondary]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrong]}>{value}</Text>
    </View>
  );
}

export const formStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper1, padding: spacing.xl },
  notice: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
  error: { color: colors.bad, fontSize: 13, marginBottom: spacing.md, lineHeight: 18 },
  row: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  link: { color: colors.accent, fontWeight: "600", fontSize: 13.5 },
  muted: { color: colors.muted, fontSize: 12.5, lineHeight: 17 }
});

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sectionTitle: { fontSize: 12.5, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  field: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: "600", color: colors.ink, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  fieldError: { fontSize: 12, color: colors.bad, marginTop: 4 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.paper1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14.5,
    color: colors.ink,
    justifyContent: "center"
  },
  textarea: { minHeight: 84, textAlignVertical: "top" },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  selectText: { flex: 1, fontSize: 14.5, color: colors.ink },
  placeholder: { color: colors.muted },
  modal: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xl },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  modalTitle: { fontSize: 17, fontWeight: "700", color: colors.ink, flex: 1 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.paper1,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14.5, color: colors.ink },
  option: { paddingVertical: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionSelected: { backgroundColor: colors.accentSoft },
  optionLabel: { fontSize: 15, color: colors.ink },
  optionSub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  emptyList: { textAlign: "center", color: colors.muted, padding: spacing.xl },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  iosSheet: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
  segmented: { flexDirection: "row", backgroundColor: colors.paper2, borderRadius: radii.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.surface },
  segmentLabel: { fontSize: 13.5, fontWeight: "600", color: colors.muted },
  segmentLabelActive: { color: colors.accent },
  button: { backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  buttonLabelSecondary: { color: colors.accent },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { fontSize: 13.5, color: colors.muted },
  summaryValue: { fontSize: 13.5, color: colors.ink, fontWeight: "600" },
  summaryStrong: { fontSize: 15, color: colors.ink, fontWeight: "700" }
});
