// Gives the Android release build enough memory. The template's default
// (-Xmx2048m -XX:MaxMetaspaceSize=512m) runs out of Metaspace in
// expo-updates' KSP step on a release build ("OutOfMemoryError: Metaspace",
// 2026-11-12). android/ is generated, so the setting lives here.
const { withGradleProperties } = require("expo/config-plugins");

const JVM_ARGS = "-Xmx3g -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8";

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === "property" && p.key === "org.gradle.jvmargs"));
    props.push({ type: "property", key: "org.gradle.jvmargs", value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
