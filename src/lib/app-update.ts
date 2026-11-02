import { Platform } from "react-native";
import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { API, api } from "./api";

// In-app updates for new APK releases (native changes). The portal's latest
// build (GET /mobile-app/latest) is compared with this app's version; if it's
// newer the app downloads it with a short-lived download token and opens
// Android's installer - no visit to Get the App. JS-only changes arrive on
// their own as over-the-air updates (expo-updates, backend
// mobile-updates.routes.ts) and never need this.

export const installedVersion = Constants.expoConfig?.version ?? "0.0.0";

function newer(a: string, b: string) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/** The newer release on the portal, or null when this app is up to date. */
export async function availableUpdate(): Promise<{ version: string; sizeBytes: number | null } | null> {
  if (Platform.OS !== "android") return null;
  const { build } = await api.latestBuild();
  if (!build?.version || !newer(build.version, installedVersion)) return null;
  return { version: build.version, sizeBytes: build.sizeBytes ?? null };
}

/** Downloads the release and opens Android's installer (the person taps Install). */
export async function downloadAndInstall(version: string) {
  const { token } = await api.downloadToken();
  const dir = new Directory(Paths.cache, "app-update", String(Date.now()));
  dir.create({ intermediates: true, idempotent: true });
  const file = await File.createDownloadTask(`${API}/mobile-app/download?platform=ANDROID&token=${encodeURIComponent(token)}`, dir).downloadAsync();
  if (!file) throw new Error("The download didn't finish.");
  // The installer can only read the APK through a content:// URI.
  const contentUri = await getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1 // FLAG_GRANT_READ_URI_PERMISSION
  });
  return version;
}
