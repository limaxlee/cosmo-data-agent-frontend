import { Message } from "./api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface ApiSession {
  session_id: string;
  app_name: string;
  user_id: string;
  state: Record<string, unknown>;
  events: unknown[];
  last_update_time: string;
}

// An inline binary blob (e.g. an image the user attached). When serialized to
// JSON, `data` is a base64-encoded string. Field names may arrive in snake_case
// or camelCase depending on the backend serializer, so both are allowed.
interface ApiBlob {
  data?: string | null;
  mime_type?: string | null;
  mimeType?: string | null;
}

interface ApiPart {
  text: string | null;
  thought: boolean | null;
  inline_data?: ApiBlob | null;
  inlineData?: ApiBlob | null;
}

interface ApiEvent {
  content: { parts: ApiPart[] | null; role: string } | null;
  author: string;
  timestamp: string | null;
}

interface ApiSessionDetail {
  id: string;
  state: Record<string, unknown>;
  events: ApiEvent[] | null;
  last_update_time: string;
}

// Pull an image data URL out of a part's inline_data blob, if present.
function inlineImageDataUrl(part: ApiPart | undefined): string | undefined {
  const blob = part?.inline_data ?? part?.inlineData;
  if (!blob?.data) return undefined;

  const mime = blob.mime_type ?? blob.mimeType ?? "";
  if (!mime.startsWith("image/")) return undefined;

  return `data:${mime};base64,${blob.data}`;
}

function mapApiSessionDetail(data: ApiSessionDetail): ChatSession {
  const events = data.events ?? [];

  const messages: Message[] = events
    .map((event): Message | null => {
      const parts = event.content?.parts ?? [];

      // Take the last real (non-thought) text part.
      const textParts = parts.filter(
        (p) => (p?.text ?? "").trim().length > 0 && !p?.thought,
      );

      const text = (textParts[textParts.length - 1]?.text ?? "").trim();

      const role: Message["role"] =
        event.author === "user" ? "user" : "assistant";

      // Only user messages may carry an attached inline image.
      let image: string | undefined;

      if (role === "user") {
        const blobPart = parts.find(
          (p) => (p?.inline_data ?? p?.inlineData) != null,
        );

        image = inlineImageDataUrl(blobPart);
      }

      // Keep the message if it has text or (for a user) an image.
      if (!text && !image) return null;

      return {
        role,
        content: text,
        timestamp: event.timestamp ? new Date(event.timestamp) : undefined,
        image,
      };
    })
    .filter((m): m is Message => m !== null);

  const updatedAt = new Date(data.last_update_time);

  const stateTitle = data.state?.session_title;

  // If there is no valid session title, use the session ID.
  const title =
    typeof stateTitle === "string" && stateTitle.trim()
      ? stateTitle.trim()
      : data.id;

  return {
    id: data.id,
    title,
    messages,
    createdAt: updatedAt,
    updatedAt,
  };
}

function parseListSessionsResponse(data: unknown): ApiSession[] {
  if (Array.isArray(data)) {
    // Handle responses such as:
    // [
    //   ["sessions", [...]]
    // ]
    for (const entry of data) {
      if (
        Array.isArray(entry) &&
        entry[0] === "sessions" &&
        Array.isArray(entry[1])
      ) {
        return entry[1] as ApiSession[];
      }
    }

    // Handle a plain array of session objects.
    if (
      data.every(
        (s) => s && typeof s === "object" && "session_id" in (s as object),
      )
    ) {
      return data as ApiSession[];
    }
  }

  // Handle:
  // {
  //   sessions: [...]
  // }
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { sessions?: unknown }).sessions)
  ) {
    return (data as { sessions: ApiSession[] }).sessions;
  }

  return [];
}

function mapApiSession(api: ApiSession): ChatSession {
  const updatedAt = new Date(api.last_update_time);

  const stateTitle = api.state?.session_title;

  // If session_title exists and is non-empty, use it.
  // Otherwise, directly use the session ID.
  const title =
    typeof stateTitle === "string" && stateTitle.trim()
      ? stateTitle.trim()
      : api.session_id;

  return {
    id: api.session_id,
    title,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

export class SessionStorage {
  private static readonly STORAGE_KEY = "chat_sessions";

  static async createSession(userId: string): Promise<string> {
    const res = await fetch(
      `${API_BASE}/apps/users/${encodeURIComponent(userId)}/sessions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status}`);
    }

    const data: { session_id: string } = await res.json();

    return data.session_id;
  }

  /**
   * Loads the user's session list.
   *
   * IMPORTANT:
   * This does NOT generate a title.
   *
   * If state.session_title exists:
   *   title = state.session_title
   *
   * If state.session_title does not exist / is empty:
   *   title = session_id
   */
  static async listSessions(userId: string): Promise<ChatSession[]> {
    const res = await fetch(
      `${API_BASE}/apps/users/${encodeURIComponent(userId)}/sessions`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to load sessions: ${res.status}`);
    }

    const data = await res.json();

    const rawSessions = parseListSessionsResponse(data);

    // No title-generation POST request here.
    //
    // mapApiSession() simply:
    // - uses state.session_title when available
    // - otherwise uses session_id
    const sessions = rawSessions.map(mapApiSession);

    return sessions.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }

  static getSessions(): ChatSession[] {
    if (typeof window === "undefined") return [];

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);

      if (!stored) return [];

      const sessions = JSON.parse(stored) as ChatSession[];

      return sessions
        .map((session) => ({
          ...session,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
        }))
        .filter((session: ChatSession) => session.messages.length > 0);
    } catch (error) {
      console.error("Error loading sessions:", error);
      return [];
    }
  }

  static saveSession(session: ChatSession): void {
    if (typeof window === "undefined") return;

    try {
      const sessions = this.getSessions();

      const existingIndex = sessions.findIndex((s) => s.id === session.id);

      if (existingIndex >= 0) {
        sessions[existingIndex] = session;
      } else {
        sessions.unshift(session);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error("Error saving session:", error);
    }
  }

  static getLocalSession(id: string): ChatSession | null {
    const sessions = this.getSessions();

    return sessions.find((s) => s.id === id) || null;
  }

  static async getSession(
    userId: string,
    sessionId: string,
  ): Promise<ChatSession> {
    const res = await fetch(
      `${API_BASE}/apps/users/${encodeURIComponent(
        userId,
      )}/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to load session: ${res.status}`);
    }

    const data = await res.json();

    return mapApiSessionDetail(data);
  }

  static async deleteSession(userId: string, sessionId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/apps/users/${encodeURIComponent(
        userId,
      )}/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to delete session: ${res.status}`);
    }
  }
}
