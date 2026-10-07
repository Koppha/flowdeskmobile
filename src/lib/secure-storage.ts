import * as SecureStore from "expo-secure-store";

// Keychain (iOS) / Keystore (Android) via Expo SecureStore - see the
// FlowDesk Mobile write-up's Auth model: the same bearer token the web app
// keeps in localStorage, just held somewhere a lost or stolen phone can't
// read out of a browser profile.
const TOKEN_KEY = "flowdesk.token";

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
