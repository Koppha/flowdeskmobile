import { fetch } from "expo/fetch";
import { API, clientHeaders, handleUnauthorized } from "./api";

// The AI Assistant's chat: POST /ai/assistant/chat answers as Server-Sent
// Events (backend-v2 assistant.ts streamChat), the same stream the web
// portal's assistant panel reads. expo/fetch is used because React Native's
// own fetch can't read a response while it is still arriving.

export type AssistantEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "draft"; kind: "advance" | "clearance"; id: string; label: string }
  | { type: "error"; message: string }
  | { type: "done" };

export async function streamAssistantChat(
  message: string,
  conversationId: string | null,
  onEvent: (ev: AssistantEvent) => void,
  signal?: AbortSignal
) {
  const headers = await clientHeaders();
  const res = await fetch(`${API}/ai/assistant/chat`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
    signal
  });
  if (!res.ok || !res.body) {
    if (res.status === 401 && headers.Authorization) await handleUnauthorized();
    const body = await res.json().catch(() => ({}) as any);
    throw new Error(body?.error || `The assistant is unavailable (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      // ": keep-alive" comments carry no data line.
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // A malformed event is skipped, not fatal.
      }
    }
  }
}
