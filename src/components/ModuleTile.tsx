import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, radii, spacing } from "@/theme";

export default function ModuleTile({
  icon: Icon,
  label,
  iconColor,
  iconBg,
  onPress
}: {
  icon: LucideIcon;
  label: string;
  iconColor: string;
  iconBg: string;
  onPress?: () => void;
}) {
  const disabled = !onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.tile, pressed && !disabled && styles.tilePressed, disabled && styles.tileDisabled]}
    >
      <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} strokeWidth={1.8} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: "48%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm
  },
  tilePressed: { opacity: 0.7 },
  tileDisabled: { opacity: 0.55 },
  iconBadge: { width: 36, height: 36, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13.5, fontWeight: "600", color: colors.ink }
});
