/**
 * Copy text to the clipboard.
 *
 * navigator.clipboard only exists in a secure context (HTTPS or localhost).
 * The app is served over plain HTTP on the LAN, so it is undefined there and
 * we fall back to the legacy textarea + execCommand approach.
 */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denied or blocked - try the legacy path below.
    }
  }

  legacyCopy(text);
}

function legacyCopy(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);

  const previouslyFocused = document.activeElement as HTMLElement | null;

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy was rejected by the browser");
    }
  } finally {
    document.body.removeChild(textarea);
    previouslyFocused?.focus?.();
  }
}
