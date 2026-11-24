/**
 * Whether the sidebar is collapsed. One value for the chat sidebar and the
 * admin sidebar, so going from one to the other keeps the width.
 *
 * It has to outlive the components: /chat/new, /chat/[sessionId] and the admin
 * views each render their own sidebar, so navigating between them remounts it
 * and would otherwise reset it to expanded. Null means "not toggled yet this
 * page load", in which case the stored preference is used.
 */
const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

let lastCollapsed: boolean | null = null;

export function readCollapsed(): boolean {
  if (lastCollapsed !== null) return lastCollapsed;
  if (typeof window === "undefined") return false;

  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(next: boolean) {
  lastCollapsed = next;

  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked - the sidebar still works for this page load.
  }
}
