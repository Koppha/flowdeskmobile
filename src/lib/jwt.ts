// Same client-side JWT decode as frontend/src/api.ts's getUserFromToken() -
// the token is never verified here (the backend already did that to issue
// it); this just reads the claims already embedded in it for display.
export type FlowDeskUser = {
  userId: string;
  role: string;
  username: string;
  fullName: string;
  employeeNo: string;
  department: string;
};

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  // atob is globally available in Hermes/Expo's runtime, same as a browser.
  const binary = atob(padded);
  return decodeURIComponent(
    binary
      .split("")
      .map((c: string) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Whether a session token has run out (or will within `marginMs`). Sessions
 * last 12 hours (backend lib/auth.ts signToken); an unreadable token counts
 * as expired. The server is still the judge - this only avoids showing the
 * app with a session it will refuse.
 */
export function isTokenExpired(token: string, marginMs = 60_000): boolean {
  try {
    const exp = Number(JSON.parse(base64UrlDecode(token.split(".")[1])).exp);
    return !Number.isFinite(exp) || exp * 1000 - marginMs <= Date.now();
  } catch {
    return true;
  }
}

export function decodeUserFromToken(token: string): FlowDeskUser | null {
  try {
    const payload = token.split(".")[1];
    const json = base64UrlDecode(payload);
    const p = JSON.parse(json);
    return {
      userId: p.userId as string,
      role: p.role as string,
      username: (p.username as string) || "",
      fullName: (p.fullName as string) || "",
      employeeNo: (p.employeeNo as string) || "",
      department: (p.department as string) || ""
    };
  } catch {
    return null;
  }
}
