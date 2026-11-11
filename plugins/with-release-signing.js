// Signs release APKs with FlowDesk's own key instead of the template's debug
// key (which is public - anyone could sign an "update" with it). The key and
// its passwords live outside git: keystores/release-signing.properties (see
// keystores/README.md) or the same values as environment variables in CI.
// A prod build (APP_ENV=prod) without them fails instead of shipping
// debug-signed; UAT builds without them keep the debug key.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// FlowDesk release signing";

const GRADLE = `
${MARKER}
def flowdeskSigning = new Properties()
def flowdeskSigningFile = rootProject.file("../keystores/release-signing.properties")
if (flowdeskSigningFile.exists()) flowdeskSigningFile.withInputStream { flowdeskSigning.load(it) }
def flowdeskSigningValue = { String key -> System.getenv(key) ?: flowdeskSigning.getProperty(key) }
def flowdeskStoreFile = flowdeskSigningValue("FLOWDESK_KEYSTORE")
if (flowdeskStoreFile) {
    android.signingConfigs {
        flowdeskRelease {
            storeFile rootProject.file("../" + flowdeskStoreFile).exists() ? rootProject.file("../" + flowdeskStoreFile) : file(flowdeskStoreFile)
            storePassword flowdeskSigningValue("FLOWDESK_KEYSTORE_PASSWORD")
            keyAlias flowdeskSigningValue("FLOWDESK_KEY_ALIAS")
            keyPassword flowdeskSigningValue("FLOWDESK_KEY_PASSWORD")
        }
    }
    android.buildTypes.release.signingConfig android.signingConfigs.flowdeskRelease
} else if (System.getenv("APP_ENV") == "prod") {
    throw new GradleException("APP_ENV=prod needs the release key: keystores/release-signing.properties or FLOWDESK_KEYSTORE* variables (see keystores/README.md).")
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += GRADLE;
    return cfg;
  });
};
