#!/usr/bin/env node
// Publishes an over-the-air (JS-only) update: installed APKs pick it up from
// the FlowDesk backend on their next launch, no new APK needed. Used by the
// GitLab "publish_update" job; can also be run by hand:
//   node scripts/publish-update.mjs --message "Fix inbox spacing"
//   node scripts/publish-update.mjs --dry-run   (print the manifest, upload nothing)
//
// It builds the complete Expo Updates manifest here (asset hashes, download
// URLs, the app config) and uploads it with the files to POST
// /mobile-app/updates (backend-v2, mobile-app module). The backend only
// stores them, serves the newest manifest per runtime version, and signs it
// with the code-signing key whose certificate is in certs/.
//
// The runtime version is the native fingerprint, so run this with app.json
// set to the version of the APK you're targeting (CI runs set-version.mjs
// with the latest v* tag first). If native code has changed since that APK,
// the fingerprint won't match any installed APK and the update reaches no one
// - ship a new APK instead.
//
// Env: FLOWDESK_API_URL (default app.json extra.apiUrl), FLOWDESK_ADMIN_EMAIL,
// FLOWDESK_ADMIN_PASSWORD - same as upload-build.mjs.

import { execFileSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import { existsSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = "android";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function npx(args) {
  return execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"]
  });
}

const CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  json: "application/json",
  mp3: "audio/mpeg",
  mp4: "video/mp4"
};

const sha256Base64Url = (buf) => createHash("sha256").update(buf).digest("base64url");
const md5Hex = (buf) => createHash("md5").update(buf).digest("hex");

const appJson = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
const manifestUrl = appJson.expo?.updates?.url;
if (!manifestUrl?.endsWith("/manifest")) {
  console.error('app.json expo.updates.url must end in "/manifest".');
  process.exit(1);
}
// Assets are served next to the manifest endpoint, on the same public URL the app uses.
const assetBaseUrl = manifestUrl.replace(/\/manifest$/, "/assets");
const apiUrl = process.env.FLOWDESK_API_URL || appJson.expo?.extra?.apiUrl;
const email = process.env.FLOWDESK_ADMIN_EMAIL;
const password = process.env.FLOWDESK_ADMIN_PASSWORD;
// Or an ADMIN session token instead of a password.
const presetToken = process.env.FLOWDESK_TOKEN;
if (!presetToken && (!email || !password) && !process.argv.includes("--dry-run")) {
  console.error("Set FLOWDESK_ADMIN_EMAIL and FLOWDESK_ADMIN_PASSWORD (an ADMIN account), or FLOWDESK_TOKEN, in the environment.");
  process.exit(1);
}
const message = arg("message") || "";

async function main() {
  const runtimeVersion = JSON.parse(npx(["expo-updates", "runtimeversion:resolve", "--platform", PLATFORM]).trim().split("\n").pop()).runtimeVersion;
  console.log(`Runtime version (native fingerprint for app version ${appJson.expo.version}): ${runtimeVersion}`);

  const outDir = path.join(os.tmpdir(), `flowdesk-update-${Date.now()}`);
  console.log("Bundling…");
  npx(["expo", "export", "--platform", PLATFORM, "--output-dir", outDir]);
  // Public app config: becomes Constants.expoConfig inside the update (api.ts reads extra.apiUrl from it).
  const expoClient = JSON.parse(npx(["expo", "config", "--type", "public", "--json"]));

  try {
    const metadata = JSON.parse(readFileSync(path.join(outDir, "metadata.json"), "utf8"));
    const files = metadata.fileMetadata?.[PLATFORM];
    if (!files?.bundle) throw new Error(`metadata.json has no ${PLATFORM} bundle`);

    const uploads = new Map(); // hash -> { buf, contentType }
    function describe(relPath, ext, isLaunchAsset) {
      const buf = readFileSync(path.join(outDir, relPath));
      const hash = sha256Base64Url(buf);
      const contentType = isLaunchAsset ? "application/javascript" : CONTENT_TYPES[ext] || "application/octet-stream";
      uploads.set(hash, { buf, contentType });
      return {
        hash,
        key: md5Hex(buf),
        fileExtension: `.${isLaunchAsset ? "bundle" : ext}`,
        contentType,
        url: `${assetBaseUrl}/${hash}`
      };
    }

    const manifest = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      runtimeVersion,
      launchAsset: describe(files.bundle, null, true),
      assets: (files.assets || []).map((a) => describe(a.path, a.ext, false)),
      metadata: {},
      extra: { expoClient }
    };

    if (process.argv.includes("--dry-run")) {
      const { extra, ...rest } = manifest;
      console.log(JSON.stringify({ ...rest, assets: `${rest.assets.length} assets`, extra: { expoClient: `${expoClient.name} ${expoClient.version}` } }, null, 2));
      console.log(`Dry run - nothing uploaded (${uploads.size} files).`);
      return;
    }

    let token = presetToken;
    if (!token) {
      console.log(`Signing in to ${apiUrl} as ${email}…`);
      const loginRes = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
      ({ token } = await loginRes.json());
    }

    const form = new FormData();
    form.append("platform", PLATFORM);
    form.append("runtimeVersion", runtimeVersion);
    form.append("appVersion", appJson.expo.version);
    form.append("message", message);
    form.append("manifest", JSON.stringify(manifest));
    // Each file is named by its hash; the backend checks the hash before storing it.
    for (const [hash, { buf, contentType }] of uploads) {
      form.append("files", new Blob([buf], { type: contentType }), hash);
    }

    const total = [...uploads.values()].reduce((n, u) => n + u.buf.length, 0);
    console.log(`Uploading update ${manifest.id} (${uploads.size} files, ${(total / 1024 / 1024).toFixed(1)} MB)…`);
    const res = await fetch(`${apiUrl}/mobile-app/updates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${JSON.stringify(body)}`);
    console.log(`Done. Apps on app version ${appJson.expo.version} (runtime ${runtimeVersion.slice(0, 12)}…) get update ${manifest.id} on next launch.`);
  } finally {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("Publish failed:", e.message || e);
  process.exit(1);
});
