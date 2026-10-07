#!/usr/bin/env node
// Turns "distribute the app" into one command instead of building, then
// opening a browser, then filling in the Mobile App Configuration admin
// panel's upload form by hand: `npm run distribute -- --file <path.apk>`.
// Uploads straight to POST /mobile-app (see backend-v2/src/modules/
// mobile-app/mobile-app.routes.ts), the same endpoint that upload form
// calls - after this, "Get the App" immediately serves the new build.
//
// Requires an ADMIN account's credentials (the upload endpoint is
// ADMIN-only) via env vars - never hardcode credentials in this file or
// pass them on the command line where they'd land in shell history:
//   FLOWDESK_API_URL       defaults to app.json's extra.apiUrl (UAT)
//   FLOWDESK_ADMIN_EMAIL    required
//   FLOWDESK_ADMIN_PASSWORD required
//
// Usage:
//   npm run distribute -- --file ./build/flowdesk.apk
//   npm run distribute -- --file ./build/flowdesk.apk --version 1.5.0
// --version defaults to app.json's expo.version if not given.

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const filePath = arg("file");
if (!filePath) {
  console.error("Usage: npm run distribute -- --file <path-to-apk> [--version 1.5.0]");
  process.exit(1);
}
const resolvedFile = path.resolve(filePath);
if (!existsSync(resolvedFile)) {
  console.error(`No such file: ${resolvedFile}`);
  process.exit(1);
}

const appJson = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
const apiUrl = process.env.FLOWDESK_API_URL || appJson.expo?.extra?.apiUrl || "https://dt-externalproxy-1.etl.co.ls/etl/flowdesk/uat";
const version = arg("version") || appJson.expo?.version;
if (!version) {
  console.error("No --version given and app.json has no expo.version to fall back to.");
  process.exit(1);
}

const email = process.env.FLOWDESK_ADMIN_EMAIL;
const password = process.env.FLOWDESK_ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Set FLOWDESK_ADMIN_EMAIL and FLOWDESK_ADMIN_PASSWORD (an ADMIN account) in the environment.");
  process.exit(1);
}

async function main() {
  console.log(`Signing in to ${apiUrl} as ${email}...`);
  const loginRes = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!loginRes.ok) {
    console.error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
    process.exit(1);
  }
  const { token } = await loginRes.json();

  console.log(`Uploading ${path.basename(resolvedFile)} as version ${version}...`);
  const fileBuffer = readFileSync(resolvedFile);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), path.basename(resolvedFile));
  form.append("version", version);
  form.append("platform", "ANDROID");

  const uploadRes = await fetch(`${apiUrl}/mobile-app`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const body = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    console.error(`Upload failed: ${uploadRes.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }

  console.log(`Done. "Get the App" now serves version ${body.build?.version} (${body.build?.sizeBytes} bytes).`);
}

main().catch((e) => {
  console.error("Distribute failed:", e);
  process.exit(1);
});
