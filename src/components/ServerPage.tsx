import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Linking, Text, TouchableOpacity, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { useAuth } from "@/context/auth-context";
import { API } from "@/lib/api";
import { getToken } from "@/lib/secure-storage";
import { makeStyles, spacing, useTheme } from "@/theme";

// Sign a Document and Maintenance are a page served by backend-v2
// (mobile-web/ in the backend repo, at <API>/mobile-app/web/), not native
// screens - so their UI changes with a server deploy, never an app release.
// This only hosts the page: hands over the session, keeps the WebView on
// that page, and maps the phone's back button onto the page's own history.
const PAGE_URL = `${API}/mobile-app/web/`;

/** Only the page itself may load here - the session token is injected into it. */
function isServerPage(url: string) {
  return url === "about:blank" || url.split(/[?#]/)[0].startsWith(PAGE_URL);
}

// A WebView can't save a file itself, so the page asks the app to: the PDF
// is downloaded with the session token, then handed to the share sheet
// (Save to Files, email, WhatsApp...). Only signature PDFs are accepted -
// the page can't use this to fetch arbitrary API paths.
const SHAREABLE = /^\/signatures\/(documents\/)?[0-9a-f-]{36}\/file$/i;

async function sharePdf(path: string, title: string, token: string) {
  if (!SHAREABLE.test(path)) return;
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert("Can't share", "Sharing isn't available on this device.");
    return;
  }
  // A fresh folder per download, so a re-download never collides with a file
  // already in the cache.
  const dir = new Directory(Paths.cache, "signed", String(Date.now()));
  dir.create({ intermediates: true, idempotent: true });
  const file = await File.createDownloadTask(`${API}${path}?download=1`, dir, { headers: { Authorization: `Bearer ${token}` } }).downloadAsync();
  if (!file) return;
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
}

// The WebView's own <input type="file"> doesn't reliably hand pictures back
// on Android, so the page asks the app instead: the native camera / gallery
// (same picker as Clearance receipts), returned to the page as data URLs.
type NativePhoto = { dataUrl: string; name: string };

async function pickPhotos(source: "camera" | "library", max: number): Promise<NativePhoto[]> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6, base64: true };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera", "Allow FlowDesk to use the camera in your phone's settings to take photos.");
      return [];
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: max > 1, selectionLimit: Math.max(1, max) });
  }
  if (result.canceled) return [];
  return result.assets
    .filter((a) => a.base64)
    .slice(0, Math.max(1, max))
    .map((a, i) => ({ dataUrl: `data:${a.mimeType || "image/jpeg"};base64,${a.base64}`, name: a.fileName || `photo-${Date.now()}-${i}.jpg` }));
}

export type ServerSection = "sign" | "maintenance";

export default function ServerPage({ section, docId, requestId }: { section: ServerSection; docId?: string; requestId?: string }) {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const { logout } = useAuth();
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A header button the page asks for (e.g. Maintenance's "+ New"), drawn
  // exactly like My Advances' - the page decides when and what it opens.
  const [headerAction, setHeaderAction] = useState<{ label: string; hash: string } | null>(null);

  useEffect(() => {
    void getToken().then(setToken);
  }, []);

  // Android back: step back through the page's screens first.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!canGoBack.current) return false;
        webRef.current?.goBack();
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; path?: string; title?: string; label?: string | null; hash?: string; id?: string; source?: string; max?: number } = {};
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "sessionExpired") void logout();
    else if (msg.type === "close") router.back();
    else if (msg.type === "pickPhotos" && typeof msg.id === "string") {
      const id = msg.id;
      const source = msg.source === "camera" ? "camera" : "library";
      const max = Math.min(Math.max(Number(msg.max) || 1, 1), 5);
      // Always answer (an empty list when cancelled), so the page never waits forever.
      pickPhotos(source, max)
        .catch(() => [] as NativePhoto[])
        .then((photos) => webRef.current?.injectJavaScript(`window.__flowdeskPhotos && window.__flowdeskPhotos(${JSON.stringify({ id, photos })}); true;`));
    } else if (msg.type === "headerAction") {
      // Only an in-page route (#/...) and a short label - the page can't make
      // the header navigate anywhere else.
      const ok = typeof msg.label === "string" && msg.label.length <= 20 && typeof msg.hash === "string" && msg.hash.startsWith("#/");
      setHeaderAction(ok ? { label: msg.label as string, hash: msg.hash as string } : null);
    }
    else if (msg.type === "sharePdf" && msg.path && token) {
      sharePdf(msg.path, msg.title || "Signed document", token).catch(() =>
        Alert.alert("Couldn't download", "The document couldn't be downloaded. Check your connection and try again.")
      );
    }
  }

  function onShouldStartLoad(req: { url: string }) {
    if (isServerPage(req.url)) return true;
    // Anything else - a verification link, a phone number to call - opens in
    // the phone's own app, never inside the WebView that holds the session.
    if (/^(https?|tel|mailto):/i.test(req.url)) void Linking.openURL(req.url).catch(() => {});
    return false;
  }

  if (!token) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Couldn&apos;t open this screen. Check your connection and try again.</Text>
        <TouchableOpacity style={styles.retry} onPress={() => { setFailed(false); setAttempt((n) => n + 1); }}>
          <Text style={styles.retryLabel}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const injected = JSON.stringify({
    token,
    theme: isDark ? "dark" : "light",
    section,
    docId: docId || undefined,
    requestId: requestId || undefined,
    // What this build can do for the page; older builds send none.
    capabilities: ["headerAction", "nativePhotos"]
  });

  return (
    <>
    <Stack.Screen
      options={{
        headerRight: headerAction
          ? () => (
              <TouchableOpacity
                onPress={() => webRef.current?.injectJavaScript(`location.hash = ${JSON.stringify(headerAction.hash)}; true;`)}
                hitSlop={10}
                style={styles.headerButton}
                accessibilityLabel={headerAction.label}
              >
                <Plus size={18} color={colors.accent} />
                <Text style={styles.headerLabel}>{headerAction.label}</Text>
              </TouchableOpacity>
            )
          : undefined
      }}
    />
    <WebView
      key={attempt}
      ref={webRef}
      source={{ uri: PAGE_URL }}
      style={{ backgroundColor: colors.paper1 }}
      injectedJavaScriptBeforeContentLoaded={`window.__FLOWDESK__ = ${injected}; true;`}
      injectedJavaScriptForMainFrameOnly
      onShouldStartLoadWithRequest={onShouldStartLoad}
      originWhitelist={["https://*", "http://*", "tel:*", "mailto:*"]}
      onMessage={onMessage}
      onNavigationStateChange={(s: WebViewNavigation) => {
        canGoBack.current = s.canGoBack;
      }}
      onError={() => setFailed(true)}
      onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
      startInLoadingState
      renderLoading={() => (
        <View style={[styles.center, styles.overlay]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
      setSupportMultipleWindows={false}
      allowsBackForwardNavigationGestures
    />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.paper1 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  message: { color: colors.muted, textAlign: "center", marginBottom: spacing.lg },
  retry: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryLabel: { color: "#fff", fontWeight: "700" },
  // Same as my-advances.tsx newButton / newLabel.
  headerButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerLabel: { color: colors.accent, fontWeight: "700", fontSize: 15 }
}));
