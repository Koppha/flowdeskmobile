import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "@/theme";

const TONES = {
  good: { fg: colors.good, bg: colors.goodSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  bad: { fg: colors.bad, bg: colors.badSoft },
  muted: { fg: colors.muted, bg: "#f1f2f5" }
};

export type StatusPillProps = { label: string; tone?: keyof typeof TONES };

export default function StatusPill({ label, tone = "muted" }: StatusPillProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill },
  label: { fontSize: 11, fontWeight: "700" }
});
