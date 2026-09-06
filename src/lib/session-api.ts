import { ChatSession, Message, MessageArtifact } from "./types";
import { ERROR_REPLY } from "./error-reply";

// Relative on purpose. Requests go to this app's own origin and are
// forwarded to the ADK backend by src/app/backend/[...path]/route.ts, which
// keeps every call same-origin -- no CORS, and no backend host baked into
// the client bundle at build time.
const API_BASE = "/backend";

// The one field on the backend's RenameSessionRequest. The route declares the
// model with `Depends()`, so FastAPI reads it from the query string rather than
// a JSON body -- the same shape as the `/run?query=` call. It matches the
// state key the title is read back out of in mapApiSession() below.
const RENAME_TITLE_PARAM = "session_title";

// The one field on the backend's LoadSessionArtifactRequest. Declared with
// `Depends()` as well, so it travels in the query string.
const ARTIFACT_DATA_URI_PARAM = "data_uri";
const ARTIFACT_FILENAME_PARAM = "filename";
const ARTIFACT_MEDIA_TYPE_PARAM = "media_type";

// A user turn that carried a file arrives as two text parts: this header block,
// then whatever the user typed. The header is metadata, not speech, so it gets
// lifted out and becomes the bubble's attachment rather than being printed.
const ARTIFACT_MARKER = "uploaded artifact:";

const ARTIFACT_FILENAME = /^[ \t]*filename:[ \t]*(.+)$/im;
const ARTIFACT_DATA_URI = /^[ \t]*data_uri:[ \t]*(.+)$/im;
const ARTIFACT_CONTENT_TYPE = /^[ \t]*content_type:[ \t]*(.+)$/im;

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

// An event that ended in an error carries the code and message instead of
// content. Field names may arrive in snake_case or camelCase depending on the
// backend serializer, so both are allowed.
interface ApiEvent {
  content: { parts: ApiPart[] | null; role: string } | null;
  author: string;
  timestamp: string | null;
  error_code?: string | null;
  errorCode?: string | null;
  error_message?: string | null;
  errorMessage?: string | null;
}

// Whether the backend recorded this event as a failure.
function isErrorEvent(event: ApiEvent): boolean {
  return (
    (event.error_code ?? event.errorCode ?? null) !== null ||
    (event.error_message ?? event.errorMessage ?? null) !== null
  );
}

// The id is deliberately absent: the endpoints disagree on what to call it
// (the list gives `session_id`, the detail may not echo one at all), so the
// mapper is handed the id the caller requested instead of reading it back.
interface ApiSessionDetail {
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

function artifactUrl(
  userId: string,
  sessionId: string,
  dataUri: string,
  filename: string,
  mediaType: string,
): string {
  const params = new URLSearchParams({
    [ARTIFACT_DATA_URI_PARAM]: dataUri,
    [ARTIFACT_FILENAME_PARAM]: filename,
    [ARTIFACT_MEDIA_TYPE_PARAM]: mediaType,
  });

  return `${API_BASE}/apps/users/${encodeURIComponent(
    userId,
  )}/sessions/${encodeURIComponent(sessionId)}/artifact?${params.toString()}`;
}

// Read an "Uploaded Artifact:" header block. Anything else -- ordinary message
// text, a header with no data URI, a non-image upload -- comes back null and is
// left to render as text.
function parseUploadedArtifact(
  text: string | null | undefined,
  userId: string,
  sessionId: string,
): MessageArtifact | null {
  const body = (text ?? "").trimStart();

  if (!body.toLowerCase().startsWith(ARTIFACT_MARKER)) return null;

  const dataUri = body.match(ARTIFACT_DATA_URI)?.[1]?.trim();
  const filename = body.match(ARTIFACT_FILENAME)?.[1]?.trim();
  if (!dataUri) return null;

  if (!filename) return null;

  // Only an image has anywhere to go in the bubble.
  const mimeType = body.match(ARTIFACT_CONTENT_TYPE)?.[1]?.trim() ?? "";
  if (!mimeType.toLowerCase().startsWith("image/")) return null;

  return {
    url: artifactUrl(userId, sessionId, dataUri, filename, mimeType),
    filename: body.match(ARTIFACT_FILENAME)?.[1]?.trim(),
    mimeType,
  };
}

function mapApiSessionDetail(
  data: ApiSessionDetail,
  userId: string,
  // The id the session was fetched by. It is what the artifact URLs are built
  // with, so it must be the real thing -- not whatever the response echoes.
  sessionId: string,
): ChatSession {
  const events = data.events ?? [];

  const messages: Message[] = events
    .map((event): Message | null => {
      const parts = event.content?.parts ?? [];

      // Take the last real (non-thought) text part.
      const textParts = parts.filter(
        (p) => (p?.text ?? "").trim().length > 0 && !p?.thought,
      );

      const role: Message["role"] =
        event.author === "user" ? "user" : "assistant";

      // Only user messages may carry an attachment.
      let image: string | undefined;
      let artifact: MessageArtifact | undefined;

      // The text parts still in the running to become the bubble's content. An
      // upload header is taken out of it, so the message the user actually
      // typed is the one left at the end.
      let spokenParts = textParts;

      if (role === "user") {
        const blobPart = parts.find(
          (p) => (p?.inline_data ?? p?.inlineData) != null,
        );

        image = inlineImageDataUrl(blobPart);

        const headerIndex = textParts.findLastIndex(
          (p) => parseUploadedArtifact(p?.text, userId, sessionId) !== null,
        );

        if (headerIndex !== -1) {
          artifact =
            parseUploadedArtifact(
              textParts[headerIndex]?.text,
              userId,
              sessionId,
            ) ?? undefined;

          spokenParts = textParts.filter((_, i) => i !== headerIndex);
        }
      }

      const text = (spokenParts[spokenParts.length - 1]?.text ?? "").trim();

      const timestamp = event.timestamp ? new Date(event.timestamp) : undefined;

      // A failed turn has no text of its own. It is printed as the same line
      // the user saw when the request failed, so the turn reads as answered
      // and reopening the session does not wait for a reply that never comes.
      if (!text && !image && !artifact) {
        if (role === "assistant" && isErrorEvent(event)) {
          return { role, content: ERROR_REPLY, timestamp };
        }

        return null;
      }

      return {
        role,
        content: text,
        timestamp,
        image,
        artifact,
      };
    })
    .filter((m): m is Message => m !== null);

  const updatedAt = new Date(data.last_update_time);

  const stateTitle = data.state?.session_title;

  // If there is no valid session title, use the session ID.
  const title =
    typeof stateTitle === "string" && stateTitle.trim()
      ? stateTitle.trim()
      : sessionId;

  return {
    id: sessionId,
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

    return mapApiSessionDetail(data, userId, sessionId);
  }

  /**
   * Fetches one stored artifact -- the file a user attached to an earlier turn.
   * The response body is the raw file, so it comes back as a Blob for the
   * caller to turn into an object URL.
   */
  static async loadArtifact(url: string): Promise<Blob> {
    const res = await fetch(url, {
      headers: {
        Accept: "image/*",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to load artifact: ${res.status}`);
    }

    return res.blob();
  }

  static async renameSession(
    userId: string,
    sessionId: string,
    title: string,
  ): Promise<void> {
    const params = new URLSearchParams({ [RENAME_TITLE_PARAM]: title });

    const res = await fetch(
      `${API_BASE}/apps/users/${encodeURIComponent(
        userId,
      )}/sessions/${encodeURIComponent(sessionId)}/title?${params.toString()}`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to rename session: ${res.status}`);
    }
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
