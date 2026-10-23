import { Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { makeStyles, radii, useTheme } from "@/theme";

export default function ConfirmedScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { outcome } = useLocalSearchParams<{ outcome?: string }>();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={styles.iconCircle}>
        <Check size={36} color={colors.good} strokeWidth={2.5} />
      </View>
      <Text style={styles.title}>Response recorded</Text>
      <Text style={styles.body}>
        {outcome === "rejected"
          ? "This item has been sent back. No further action is needed from you right now."
          : "This item has moved to the next step. No further action is needed from you right now."}
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace("/(tabs)/inbox")}>
        <Text style={styles.buttonLabel}>Back to inbox</Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.paper1, alignItems: "center", justifyContent: "center", padding: 32 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.goodSoft, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 20, fontSize: 20, fontWeight: "700", color: colors.ink },
  body: { marginTop: 6, fontSize: 13.5, color: colors.muted, textAlign: "center", maxWidth: 260, lineHeight: 20 },
  button: { marginTop: 28, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonLabel: { fontSize: 13.5, fontWeight: "600", color: colors.ink }
}));
