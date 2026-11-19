const localUnsignedDev = process.env.FLOWDESK_LOCAL_UNSIGNED_DEV === '1';

module.exports = ({ config }) => {
  if (!localUnsignedDev) {
    return config;
  }

  const updates = { ...config.updates, enabled: false };
  delete updates.codeSigningCertificate;
  delete updates.codeSigningMetadata;

  return { ...config, updates };
};