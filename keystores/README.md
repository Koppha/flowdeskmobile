# Release signing

Release APKs are signed with FlowDesk's own key, not the template's public
debug key (`plugins/with-release-signing.js`). Neither the key nor its
passwords are ever committed - `.gitignore` keeps this folder's secrets out.

What goes here (local machine):

- `flowdesk-release.keystore` - the key.
- `release-signing.properties`:

  ```properties
  FLOWDESK_KEYSTORE=keystores/flowdesk-release.keystore
  FLOWDESK_KEYSTORE_PASSWORD=...
  FLOWDESK_KEY_ALIAS=flowdesk
  FLOWDESK_KEY_PASSWORD=...
  ```

In CI, set the same four names as masked, protected variables instead
(`FLOWDESK_KEYSTORE` pointing at the keystore file on the runner).

**Back the keystore and both passwords up somewhere safe (a password manager
or the team's vault).** Android only installs an update signed with the same
key: lose it and every phone has to uninstall and reinstall FlowDesk.

Builds: `APP_ENV=prod` builds production (package `ls.co.etl.flowdesk`, the
prod links) and refuses to build without this key. Anything else builds UAT
(`ls.co.etl.flowdesk.uat`, the UAT links), signed with this key when present
and the debug key otherwise.
