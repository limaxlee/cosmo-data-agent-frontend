/**
 * The app name every tab title ends with: "New Chat - Data Agent".
 *
 * NEXT_PUBLIC_ so the same value reaches both sides: the root layout renders
 * the static title on the server, and chat-view rewrites document.title on the
 * client once the open session's title is known.
 */
export const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || "Data Agent";

/** What a chat is called before it has a session (and a backend title). */
export const NEW_CHAT_TITLE = "New Chat";

/**
 * Builds a tab title. An unknown name leaves just the app name -- the same
 * thing the server rendered -- so opening a session shows no placeholder
 * flash while its title is still loading.
 */
export function documentTitle(name: string): string {
  const trimmed = name.trim();

  return trimmed ? `${trimmed} - ${APP_TITLE}` : APP_TITLE;
}
