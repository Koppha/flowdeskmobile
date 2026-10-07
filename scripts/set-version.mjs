#!/usr/bin/env node
// Sets app.json's expo.version and android.versionCode from a semver string,
// so every release APK can be installed over the previous one:
//   node scripts/set-version.mjs 1.2.3   ->  version "1.2.3", versionCode 10203
// versionCode = major*10000 + minor*100 + patch, so it only ever goes up as
// long as minor/patch stay below 100. Used by the GitLab release pipeline
// (.gitlab-ci.yml) with the tag name minus its leading "v".
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const version = process.argv[2];
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || "");
if (!match) {
  console.error("Usage: node scripts/set-version.mjs <major.minor.patch>");
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 99 || patch > 99) {
  console.error("minor and patch must be 0-99 to keep versionCode increasing.");
  process.exit(1);
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app.json");
const appJson = JSON.parse(readFileSync(file, "utf8"));
const versionCode = major * 10000 + minor * 100 + patch;
appJson.expo.version = version;
appJson.expo.android = { ...appJson.expo.android, versionCode };
writeFileSync(file, JSON.stringify(appJson, null, 2) + "\n");
console.log(`app.json -> version ${version}, android.versionCode ${versionCode}`);
