# Update: keep the session list across sidebar remounts

**Date:** 2026-11-17
**Re-based:** 2026-11-22, onto the code with the DICE single sign-on change.
**Branch / base:** `develop-261121`: commit `fe881c9 [feat] apply fixes 261117`
plus the DICE single sign-on change. That is the working tree as it stands on
2026-11-22.
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

The only file touched is `src/components/chat/session-sidebar.tsx`, 632 lines
long in the working tree described above. No other pending document touches
that file, so the line numbers below hold whether or not
`update_session_open_blank.md` and `update_stale_reply.md` have been applied.
Within the file, edits are listed top to bottom, so each edit shifts the
numbers of the ones below it. The "current code" block under every step is
copied verbatim from the file and is the reliable anchor; search for it rather
than trusting the number once you have started editing.

**What the re-base changed in this document.** The single sign-on change
added one import line to the file, so every line number is one higher, and
the context block in step 1b reads `logout` where it read `clearUserId`. The
three edits themselves are the same as in the version of 2026-11-17, except
for the last sentence of the first paragraph of the comment in step 1a, which
spoke of "a logout and a login as someone else". The parts of sections 2, 5, 6
and 7 that describe logging out and logging in as someone else were rewritten,
because both now work differently.

---

## 1. Why

Clicking a chat in the sidebar's Recents list makes the list itself blink: it
vanishes, or shows "No conversations yet", for a fraction of a second, then
comes back. It reads as if the sidebar reloaded along with the chat.

The click navigates:

```ts
  const handleSessionClick = (session: ChatSession) => {
    router.push(`/chat/${session.id}`);
    setIsMobileOpen(false);
  };
```

In the App Router every `/chat/[sessionId]` URL is its own page instance. Going
from one session to another unmounts the whole page -- `ChatView` and the
`SessionSidebar` inside it -- and mounts a fresh copy. The fresh sidebar starts
with `sessions` set to `[]`, so until `listSessions()` has answered, the
Recents area renders the empty-state placeholder. That one network round-trip
is the blink. The same happens going from `/chat/new` to a session and back.

The component already works around this remount for one piece of state. The
module-level `lastCollapsed` variable (lines 46-52) keeps the collapsed/expanded
choice alive between instances, with a comment explaining the remount. This
change does the same for the session list: the last list fetched is kept at
module level and a new instance renders it on its first frame. The 5-second
poll then takes over exactly as before.

Why not stop the remount instead? The sidebar could switch chats in place by
calling the `onSessionSelect` prop (already wired to `loadSessionFromBackend`
in `chat-view.tsx`, never called today) and updating the URL with
`history.pushState`. That removes the blink from the chat pane as well, but it
also means a reply still in flight for chat A could land in chat B unless
`handleSend` gains a guard, which today the remount provides for free. That is
a larger change and is left for a separate document; see section 6.

---

## 2. Behavior after the change

**Clicking a chat in the sidebar** (desktop)

1. The page remounts as before. The new sidebar's first render already has the
   list its predecessor last fetched, so the Recents area is drawn with the
   same rows in the same order. Nothing visible changes in the list.
2. The highlight moves to the clicked row at once: `currentSessionId` comes in
   through props and is the new id from the first frame.
3. The mount effect calls `loadSessions()` immediately and every 5 s after,
   as it always has. The first response replaces the cached list; any change
   since the last poll (a new title, a deleted chat) lands then.
4. The tab title is reported on mount instead of after the first poll: the
   title effect runs over the cached list and finds the current chat in it, so
   `onCurrentSessionTitleChange` fires right away. `loadSessionFromBackend`
   in the chat view sets the same title anyway, so this is only earlier, not
   different.

**First page load, reload, direct URL.** The cache is empty, since the module
has just been evaluated, so the sidebar behaves exactly as today: empty until
the first fetch. The return from the login page is such a page load too, so
after the hourly trip through the login the list is fetched afresh.

**Logout.** Logging out navigates the browser to `/auth/logout`, away from the
app. The cache does not survive that: whoever opens the app next gets a new
page load and an empty cache.

**A different person in the same browser.** A different person normally
arrives through a full page load: the login redirect, or the one reload the
app does when the backend answers `user_mismatch`. Either empties the cache.
One path keeps the page: the login check running again without a navigation
("Check again", or the check that follows an ended login) and `/auth/me`
answering with someone else. For that case the cache is tied to the user id
it was fetched for and is ignored when the id differs, so the second person
starts from an empty list.

**The app leaving the screen and coming back.** "Waiting for approval", then
"Check again" once approved, remounts the chat without a page load. The same
person's list is then on screen at once and the poll refreshes it.

**Rename and delete.** Both already call `loadSessions()` when they finish, so
the cache is refreshed with the server's truth before the next remount can
read it. The optimistic rename in `handleRenameBlur` writes only to component
state, not the cache; a remount in the sub-second window before the refresh
would show the old title until the first poll, which is the same staleness the
poll has always had.

**Mobile.** The sidebar is a sheet that closes on click, so there is nothing
to see there. The cache applies all the same.

**Server rendering.** The cache is only ever written in `loadSessions`, which
runs from an effect, i.e. in the browser. The server's copy of the module
variable stays `null`, so server-rendered output and hydration are unchanged.

---

## 3. Summary of edits

| Step | File | Current lines | Change |
|---|---|---|---|
| 1a | `src/components/chat/session-sidebar.tsx` | after 63 | add `lastSessions` cache and `readSessions()` |
| 1b | `src/components/chat/session-sidebar.tsx` | 83 | seed `sessions` state from the cache |
| 1c | `src/components/chat/session-sidebar.tsx` | 112-125 | `loadSessions` writes the cache |

No import changes. `ChatSession` is already imported on line 13, and `userId`
is already in scope at both edit sites (from `useUser()` on line 82; its type
is `string | null`).

After 1a, which adds 20 lines, step 1b is at line 103. After 1b, which adds 2
lines, step 1c is at lines 134-147. Step 1c adds 1 line.

---

## 4. Step 1: `src/components/chat/session-sidebar.tsx`

### 1a. After line 63: add the cache and its reader

Line 63 is the closing `}` of `readCollapsed`; line 65 opens
`interface SessionSidebarProps`. The new code goes between them, next to the
collapsed-state cache it mirrors.

**Current code (lines 44-63, unchanged):**

```ts
const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

/**
 * Collapsed state has to outlive the component. /chat/new and /chat/[sessionId]
 * each render their own ChatView, so navigating between them remounts the
 * sidebar and would otherwise reset it to expanded. Null means "not toggled yet
 * this page load", in which case the stored preference is used.
 */
let lastCollapsed: boolean | null = null;

function readCollapsed(): boolean {
  if (lastCollapsed !== null) return lastCollapsed;
  if (typeof window === "undefined") return false;

  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
```

**Insert directly after it:**

```ts

/**
 * The session list has to outlive the component for the same reason. A fresh
 * sidebar used to start from an empty list and show the "No conversations yet"
 * placeholder until listSessions() came back, so every click on a chat made the
 * Recents list vanish for one round-trip and reappear. The last list fetched is
 * kept here and is what a new instance renders on its first frame; the poll
 * then replaces it as it always has. It is tied to the user it was fetched for,
 * so a different person on the same page load never sees it.
 *
 * Only ever written in the browser (loadSessions runs from an effect), so the
 * server's copy stays null and server-rendered output is unchanged.
 */
let lastSessions: { userId: string; sessions: ChatSession[] } | null = null;

function readSessions(userId: string | null): ChatSession[] {
  if (!userId || !lastSessions || lastSessions.userId !== userId) return [];

  return lastSessions.sessions;
}
```

### 1b. Line 83 (103 after 1a): seed the state from the cache

The `useState` initializer is a function, so it runs once per mount and reads
whatever the previous instance left behind. On a cold load that is `[]`, the
same as today.

**Current code (lines 82-85, for context):**

```ts
  const { userId, logout } = useUser();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
```

**Replace line 83 only:**

```ts
  const [sessions, setSessions] = useState<ChatSession[]>([]);
```

**with:**

```ts
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    readSessions(userId),
  );
```

### 1c. Lines 112-125 (134-147 after 1a and 1b): write the cache on every successful fetch

One line is added, directly before `setSessions(remote)`. Inside the `try`,
`userId` is already narrowed to `string` by the early return above it, so the
object literal type-checks against the cache's shape.

**Current code:**

```ts
  const loadSessions = useCallback(async () => {
    if (!userId) return;

    try {
      setError(null);
      const remote = await SessionStorage.listSessions(userId);
      setSessions(remote);
    } catch (e) {
      console.error("Error loading sessions:", e);
      setError("Couldn't load chats");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);
```

**Replace with:**

```ts
  const loadSessions = useCallback(async () => {
    if (!userId) return;

    try {
      setError(null);
      const remote = await SessionStorage.listSessions(userId);
      lastSessions = { userId, sessions: remote };
      setSessions(remote);
    } catch (e) {
      console.error("Error loading sessions:", e);
      setError("Couldn't load chats");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);
```

A failed fetch leaves the cache as it was, so a backend hiccup during a click
still shows the last good list rather than wiping it. That includes a fetch
the backend refuses (the login ended, or the approval was taken away): the
app leaves the screen then, and the cached list is only shown again to the
same person.

---

## 5. Design notes

- **Why a module variable and not `localStorage`.** The list is per user and
  changes every few seconds; persisting it across page loads would show stale
  chats for a moment on every reload, and it would leave one person's chat
  titles in the browser for the next person. The flicker only exists within
  one page load, between two instances of the same component, and a module
  variable covers exactly that window. It is also the pattern `lastCollapsed`
  already set in this file.
- **Why the user id is stored with the list.** With the DICE login a
  different person almost always means a new page load, which empties the
  cache by itself. The one exception is the login check running again on the
  same page and coming back with someone else. Keying the cache on the id
  costs one field and rules out showing the previous person's chat titles in
  that case, even for a frame.
- **Why `readSessions` takes `string | null`.** That is the type `useUser()`
  returns for `userId`, and the initializer runs before any narrowing. A null
  id yields `[]`, the same as a cache miss.

---

## 6. Not part of this change

- **The chat pane still remounts.** Messages are redrawn from scratch and the
  message scroll position resets on every click, as today. Removing that
  means switching chats in place through `onSessionSelect` plus
  `history.pushState` instead of `router.push`, with a guard in `handleSend`
  so a late reply cannot land in the wrong chat. Separate document if wanted.
- **Sidebar scroll position** also resets to the top on remount. Same root
  cause, same remedy as the point above; not addressed by caching the list.
- **`isLoading` and `error`** are set in `loadSessions` but never rendered.
  Left alone. If a loading placeholder is ever added, it should check
  `sessions.length === 0 && isLoading`, so a cached list is not hidden behind
  it.
- **The `userId` prop** in `SessionSidebarProps` is declared and passed by
  `chat-view.tsx` but not destructured; the component reads `useUser()`
  instead. Harmless, left alone.
- **Clearing the cache on logout.** Not needed. Logout leaves the page
  (`/auth/logout`), and the list is never shown to a different user id. An
  earlier version of this document suggested `lastSessions = null;` in
  `handleLogout`; with the DICE login that line would have nothing to do.

---

## 7. How to verify

Type-check first; it must be clean:

```
npx tsc --noEmit -p tsconfig.json
```

Then confirm the cache is wired at both ends:

```
grep -n "lastSessions" src/components/chat/session-sidebar.tsx
```

should print four lines: the declaration, the line in `readSessions` that
reads it twice, the `return` under it, and the write in `loadSessions`.

With the backend running and a login in place (locally: the stand-in from
`dev/mock-login-service.mjs`, see the Login section of `STRUCTURE.md`), in a
desktop-width window:

1. Open a chat with several entries in Recents. Click another chat. The
   Recents list must not blink or show "No conversations yet"; only the
   highlight moves and the messages change. Repeat a few times, including
   fast clicks.
2. Click New, then click a chat. Same: no blink in the list either way.
3. Reload the page on a chat. The list is empty until the first fetch, as
   before this change; the cache does not survive a reload.
4. Rename a chat, then immediately click a different chat. The new title is
   still shown after the remount (it was fetched by the `loadSessions()` that
   follows the rename). If the click lands before that fetch returns, the old
   title may show for up to one poll; that is expected.
5. Delete the open chat. You land on `/chat/new` and the list no longer
   contains it.
6. Scroll the Recents list, click a chat with the sidebar open. The list
   content stays, but its scroll position returns to the top. Expected; see
   section 6.
7. A different person. Locally: start the stand-in with
   `MOCK_PASS_LIFETIME_SECONDS=50` and open the app, so the page asks for a
   pass before every request. Then restart the stand-in with the same setting
   and another `MOCK_LOGIN_ID`. Within a few seconds the page reloads once
   and Recents starts empty, then fills with that person's chats. The
   previous person's titles never appear. (The second login ID has to be
   approved in the local backend as well, or the page ends on "Waiting for
   approval".)
8. Log out from the account menu. The browser leaves the app for
   `/auth/logout`. Come back and log in: Recents starts empty, then fills.
9. Narrow the window to the mobile layout. Open the sheet, click a chat. The
   sheet closes and the chat loads, as before.
