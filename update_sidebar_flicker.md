# Update: keep the session list across sidebar remounts

**Date:** 2026-11-17
**Branch / base:** `develop-261116` at `47c9c78 update waiting md files`
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

The only file touched is `src/components/chat/session-sidebar.tsx`. It is
identical in the working tree and at the commit above, and has not changed
since `93a5f34 update icon`, so the line numbers below hold whether or not the
uncommitted edits from `update_waiting_mechanism.md` and
`update_session_title.md` are in place. Within the file, edits are listed top
to bottom, so each edit shifts the numbers of the ones below it. The "current
code" block under every step is copied verbatim from the file and is the
reliable anchor; search for it rather than trusting the number once you have
started editing.

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
module-level `lastCollapsed` variable (lines 45-51) keeps the collapsed/expanded
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
the first fetch.

**Logout, then login as someone else.** The cache is tied to the user id it
was fetched for and is ignored when the id differs, so the second user starts
from an empty list, as today. The same user logging back in sees their list
at once and the poll refreshes it.

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
| 1a | `src/components/chat/session-sidebar.tsx` | after 62 | add `lastSessions` cache and `readSessions()` |
| 1b | `src/components/chat/session-sidebar.tsx` | 82 | seed `sessions` state from the cache |
| 1c | `src/components/chat/session-sidebar.tsx` | 111-124 | `loadSessions` writes the cache |

No import changes. `ChatSession` is already imported on line 12, and `userId`
is already in scope at both edit sites (from `useUser()` on line 81; its type
is `string | null`).

After 1a, which adds 20 lines, step 1b is at line 102 and step 1c at lines
131-144.

---

## 4. Step 1: `src/components/chat/session-sidebar.tsx`

### 1a. After line 62: add the cache and its reader

Line 62 is the closing `}` of `readCollapsed`; line 64 opens
`interface SessionSidebarProps`. The new code goes between them, next to the
collapsed-state cache it mirrors.

**Current code (lines 43-62, unchanged):**

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
 * so after a logout and a login as someone else it is ignored, not shown.
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

### 1b. Line 82: seed the state from the cache

The `useState` initializer is a function, so it runs once per mount and reads
whatever the previous instance left behind. On a cold load that is `[]`, the
same as today.

**Current code (lines 81-84, for context):**

```ts
  const { userId, clearUserId } = useUser();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
```

**Replace line 82 only:**

```ts
  const [sessions, setSessions] = useState<ChatSession[]>([]);
```

**with:**

```ts
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    readSessions(userId),
  );
```

### 1c. Lines 111-124: write the cache on every successful fetch

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
still shows the last good list rather than wiping it.

---

## 5. Design notes

- **Why a module variable and not `localStorage`.** The list is per user and
  changes every few seconds; persisting it across page loads would show stale
  chats for a moment on every reload and would have to be invalidated on
  logout. The flicker only exists within one page load, between two
  instances of the same component, and a module variable covers exactly that
  window. It is also the pattern `lastCollapsed` already set in this file.
- **Why the user id is stored with the list.** `useUser()` can hand the
  sidebar a different user after a logout and login in the same tab. Keying
  the cache on the id costs one field and rules out showing the previous
  user's chat titles, even for a frame.
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
- **Clearing the cache on logout.** Not needed for correctness because of the
  user-id check. If holding another user's titles in memory until the next
  reload is undesirable anyway, add `lastSessions = null;` as the first line
  of `handleLogout` (line 271 before this change, 291 after).

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

should print four lines: the declaration, two reads in `readSessions`, and
the write in `loadSessions`.

With the backend running, in a desktop-width window:

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
7. Log out, log in as a different user id. Recents starts empty, then fills
   with that user's chats. The previous user's titles never appear.
8. Narrow the window to the mobile layout. Open the sheet, click a chat. The
   sheet closes and the chat loads, as before.
