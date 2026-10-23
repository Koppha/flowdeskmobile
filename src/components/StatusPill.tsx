import { Text, View } from "react-native";
import { makeStyles, radii, useTheme, type Colors } from "@/theme";

const tones = (colors: Colors) => ({
  good: { fg: colors.good, bg: colors.goodSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  bad: { fg: colors.bad, bg: colors.badSoft },
  muted: { fg: colors.muted, bg: colors.paper2 }
});

export type StatusPillProps = { label: string; tone?: keyof ReturnType<typeof tones> };

export default function StatusPill({ label, tone = "muted" }: StatusPillProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const t = tones(colors)[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  pill: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill },
  label: { fontSize: 11, fontWeight: "700" }
}));
