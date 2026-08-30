/**
 * The unsent contents of the message box, kept per chat so a reload -- or a hop
 * to another chat and back -- brings back exactly what was typed there.
 *
 * Keyed by session id, with "new" standing in for a chat that has not been
 * given one yet. localStorage rather than sessionStorage: a draft should
 * outlive the tab, the same way the session list and the theme do.
 */
const PREFIX = "chat_draft:";

function draftKey(sessionId: string): string {
  return `${PREFIX}${sessionId || "new"}`;
}

export function readDraft(sessionId: string): string {
  if (typeof window === "undefined") return "";

  try {
    return localStorage.getItem(draftKey(sessionId)) ?? "";
  } catch {
    // Storage blocked -- the box just starts empty.
    return "";
  }
}

/** An empty draft is deleted rather than stored, so sent chats leave no key. */
export function writeDraft(sessionId: string, text: string): void {
  if (typeof window === "undefined") return;

  try {
    if (text) {
      localStorage.setItem(draftKey(sessionId), text);
    } else {
      localStorage.removeItem(draftKey(sessionId));
    }
  } catch {
    // Storage blocked or full -- the draft simply won't survive a reload.
  }
}
