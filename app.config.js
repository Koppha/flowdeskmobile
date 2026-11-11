const { existsSync, readFileSync } = require("fs");
const path = require("path");

// Which FlowDesk the build talks to: APP_ENV=prod for production builds,
// anything else (or unset - `expo start`, CI checks) is UAT. app.json holds
// everything both share; this adds the per-environment name, package and
// links. The API and the over-the-air update server always go together.
const PROXY = "https://dt-externalproxy-1.etl.co.ls/etl/flowdesk";

const ENVIRONMENTS = {
  prod: { name: "FlowDesk", id: "ls.co.etl.flowdesk", apiUrl: `${PROXY}/prod` },
  uat: { name: "FlowDesk UAT", id: "ls.co.etl.flowdesk.uat", apiUrl: `${PROXY}/uat` }
};

// UAT gets its own package so testers can have both apps on one phone. Push
// needs that package registered in Firebase (google-services.json); until it
// is, UAT keeps the shared package so its builds still work.
function firebaseHasPackage(pkg) {
  const file = path.join(__dirname, "google-services.json");
  if (!existsSync(file)) return false;
  const json = JSON.parse(readFileSync(file, "utf8"));
  return (json.client || []).some((c) => c.client_info?.android_client_info?.package_name === pkg);
}

/** @param {import("expo/config").ConfigContext} ctx @returns {import("expo/config").ExpoConfig} */
module.exports = ({ config }) => {
  const appEnv = process.env.APP_ENV === "prod" ? "prod" : "uat";
  const env = ENVIRONMENTS[appEnv];
  const id = appEnv === "uat" && !firebaseHasPackage(env.id) ? ENVIRONMENTS.prod.id : env.id;
  return {
    ...config,
    name: env.name,
    slug: config.slug ?? "flowdesk-mobile",
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...config.android, package: id },
    updates: { ...config.updates, url: `${env.apiUrl}/mobile-app/updates/manifest` },
    extra: { ...config.extra, apiUrl: env.apiUrl, appEnv }
  };
};
