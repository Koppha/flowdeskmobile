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
