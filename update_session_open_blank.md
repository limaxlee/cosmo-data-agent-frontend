# Update: no new-chat greeting while a session is loading

**Date:** 2026-11-17
**Branch / base:** `develop-261116` at `47c9c78 update waiting md files`, plus
the uncommitted edits from `update_waiting_mechanism.md` and
`update_session_title.md`. That is the working tree as it stands today.
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

The only file touched is `src/components/chat/chat-view.tsx`. Line numbers
refer to that file as it is in the working tree described above, 834 lines
long. Apply this document after `update_waiting_mechanism.md`: the "current
code" block in step 1b is `loadSessionFromBackend` as that document leaves it.
On a tree without it the function body differs but the edit is the same (a
`finally` block is added), and the line numbers in the state section are 10
lower, those in the JSX section 28 lower.

Within the file, edits are listed top to bottom, so each edit shifts the
numbers of the ones below it; the shifted numbers are given at each step. The
"current code" block under every step is copied verbatim from the file and is
the reliable anchor; search for it rather than trusting the number once you
have started editing.

This change is independent of `update_sidebar_flicker.md`, which touches a
different file. Apply either, both, in any order.

---

## 1. Why

Clicking a chat in the sidebar shows the new-chat empty state for a moment --
the "무엇을 도와드릴까요?" heading and the suggested-question cards -- before
the chat's messages replace it. It is brief, one network round-trip, and it is
there on every click and on every reload of a `/chat/{id}` URL.

The click navigates to `/chat/{id}`, which mounts a fresh `ChatView` with
`messages` set to `[]`. The pane decides what to draw with
`messages.length === 0`:

```ts
            {messages.length === 0 ? (
```

and uses the same test for two layout classes on the lines above it. The
component has no notion of "a session is being fetched", so an empty array
means "new chat" and the greeting renders. It stays until
`loadSessionFromBackend` returns and fills `messages`.

The component already tells the two cases apart on mount for something else.
`currentSessionTitle` starts as `""` when `initialSessionId` is given and as
`NEW_CHAT_TITLE` when it is not (lines 101-103). This change adds one flag
with the same seed: `true` while the session named in the URL is on its way,
`false` from the moment the load has settled. While the flag is up the pane
draws nothing.

Why a flag and not `initialSessionId && messages.length === 0`? A session can
legitimately have no messages (created, never sent to), and a load can fail.
Both must end at the greeting, as they do today. Only "not loaded yet" should
be blank, and that needs state that the load clears.

---

## 2. Behavior after the change

**Opening a chat** (sidebar click, direct URL, reload)

1. First frame: header, composer and sidebar as before; the message pane is
   empty. No heading, no cards.
2. The load settles. On success the messages, the "Thinking..." line if the
   run is still going, and the pane's scroll-to-end all land in the same
   render as the flag going down, so the pane goes from blank straight to the
   finished list. There is no frame with the flag down and the list still
   empty (see section 5).
3. On failure the red "Could not connect" banner and the greeting appear
   together, as today, since the flag goes down in the same render as the
   error state goes up.
4. A chat with no messages shows the greeting once its load has finished,
   exactly as a new chat does.

**`/chat/new`.** `initialSessionId` is undefined, the flag starts `false`, and
the greeting renders on the first frame as it always has.

**Sending the first message of a new chat.** Unchanged. The URL is replaced
with `history.replaceState`, which does not remount, so the flag is never
raised.

**Clicking New while a chat is still loading.** `startNewChat` empties the
messages and the sidebar navigates to `/chat/new`, which mounts a fresh
instance with the flag `false`. The instance being left shows blank rather
than the greeting for the one round-trip until it is unmounted, which is the
intended effect.

**What stays blank-only.** There is deliberately no spinner. On a fast
backend a spinner would itself flash for a few milliseconds, which is the kind
of blink this change removes. A delayed indicator for slow loads is listed in
section 6.

---

## 3. Summary of edits

| Step | File | Current lines | Change |
|---|---|---|---|
| 1a | `src/components/chat/chat-view.tsx` | after 103 | add `isSessionLoading` state |
| 1b | `src/components/chat/chat-view.tsx` | 326-353 | `loadSessionFromBackend` clears it in `finally` |
| 1c | `src/components/chat/chat-view.tsx` | after 567 | derive `showEmptyState` |
| 1d | `src/components/chat/chat-view.tsx` | 615, 621, 624 | pane uses the flag and `showEmptyState` |

No import changes. `useState` is already imported. After 1a (+10 lines) step
1b is at 336-363; after 1b (+3 lines) step 1c is after line 580; after 1c (+4
lines) step 1d is at 632, 638 and 641.

---

## 4. Step 1: `src/components/chat/chat-view.tsx`

### 1a. After line 103: the flag

Lines 101-103 are the `currentSessionTitle` state, whose initial value already
depends on `initialSessionId` in the same way. Line 105 opens the
`suggestedQuestions` state.

**Current code (lines 101-103, unchanged):**

```ts
  const [currentSessionTitle, setCurrentSessionTitle] = useState(
    initialSessionId ? "" : NEW_CHAT_TITLE,
  );
```

**Insert directly after it:**

```ts

  // True while the chat named in the URL is being fetched on mount. The pane
  // draws nothing in that time: its empty state is the new-chat greeting, and
  // with the history not yet in `messages` it would otherwise show for one
  // round-trip before the bubbles land. Cleared when the load settles either
  // way, so a chat with no messages and a failed load both end at the
  // greeting as before. /chat/new has nothing to load and starts at false.
  const [isSessionLoading, setIsSessionLoading] = useState(
    Boolean(initialSessionId),
  );
```

### 1b. Lines 326-353 (336-363 after 1a): clear the flag when the load settles

The whole of `loadSessionFromBackend`. Only the tail changes: a `finally`
block is added after the `catch`. Everything inside `try` and `catch` stays
as it is.

**Current code:**

```ts
  const loadSessionFromBackend = async (id: string) => {
    try {
      const session = await SessionStorage.getSession(userId, id);

      setSessionId(session.id);

      justLoadedRef.current = true;

      const running = session.runState === "running";

      setRevealIndex(null);
      setMessages(
        running ? session.messages : withMissingReply(session.messages),
      );
      setCurrentSessionTitle(session.title);
      setSidebarOpen(false);

      setAwaitingSessionId(running ? session.id : null);
      setIsSending(running);

      // Opening another chat from the sidebar keeps this component mounted,
      // so the box has to be swapped over to that chat's draft by hand.
      restoreDraft(readDraft(session.id));
    } catch (e) {
      console.error("Error loading session:", e);
      setIsBackendError(true);
    }
  };
```

**Replace with:**

```ts
  const loadSessionFromBackend = async (id: string) => {
    try {
      const session = await SessionStorage.getSession(userId, id);

      setSessionId(session.id);

      justLoadedRef.current = true;

      const running = session.runState === "running";

      setRevealIndex(null);
      setMessages(
        running ? session.messages : withMissingReply(session.messages),
      );
      setCurrentSessionTitle(session.title);
      setSidebarOpen(false);

      setAwaitingSessionId(running ? session.id : null);
      setIsSending(running);

      // Opening another chat from the sidebar keeps this component mounted,
      // so the box has to be swapped over to that chat's draft by hand.
      restoreDraft(readDraft(session.id));
    } catch (e) {
      console.error("Error loading session:", e);
      setIsBackendError(true);
    } finally {
      // Same render as the messages (or the error) above: everything after
      // the one await runs in a single pass, and React batches it.
      setIsSessionLoading(false);
    }
  };
```

### 1c. After line 567 (580 after 1a and 1b): derive `showEmptyState`

Line 567 is the `lastUserIndex` computation, directly above `return (`.

**Current code (line 567, unchanged):**

```ts
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
```

**Insert directly after it:**

```ts

  // The new-chat greeting: nothing on screen and nothing on its way. While a
  // chat is still loading the pane stays blank instead (see the pane below).
  const showEmptyState = messages.length === 0 && !isSessionLoading;
```

### 1d. Lines 615, 621, 624 (632, 638, 641 after 1a-1c): the pane

Three one-line edits inside the messages area. The two class expressions use
`showEmptyState`; the branch itself becomes three-way, with `null` while
loading. The comment block above `<ScrollArea>` (lines 608-612) and
everything inside the two branches stay as they are.

**Current code (lines 613-627):**

```tsx
        <ScrollArea
          className={`flex-1 min-h-0 p-4 ${
            messages.length === 0 ? "[&>div>div]:!h-full" : ""
          }`}
          ref={scrollAreaRef}
        >
          <div
            className={`max-w-4xl mx-auto ${
              messages.length === 0 ? "h-full" : "space-y-2"
            }`}
          >
            {messages.length === 0 ? (
              /* min-h-full, not h-full: on a short window the box may grow
                 past the pane and scroll instead of clipping the heading. */
              <div className="flex flex-col items-center justify-center min-h-full text-center space-y-6">
```

**Replace with:**

```tsx
        <ScrollArea
          className={`flex-1 min-h-0 p-4 ${
            showEmptyState ? "[&>div>div]:!h-full" : ""
          }`}
          ref={scrollAreaRef}
        >
          <div
            className={`max-w-4xl mx-auto ${
              showEmptyState ? "h-full" : "space-y-2"
            }`}
          >
            {isSessionLoading ? null : showEmptyState ? (
              /* min-h-full, not h-full: on a short window the box may grow
                 past the pane and scroll instead of clipping the heading. */
              <div className="flex flex-col items-center justify-center min-h-full text-center space-y-6">
```

The rest of the expression is untouched. For orientation, it still closes as:

```tsx
            ) : (
              <>
                ...
              </>
            )}
          </div>
        </ScrollArea>
```

`null` rather than the messages branch with an empty list: that branch
contains the 60vh spacer that lets the pinned question reach the top, and
rendering it into an otherwise empty pane would make the pane scrollable for
the duration of the load.

---

## 5. Design notes

- **Why there is no intermediate frame.** `loadSessionFromBackend` has one
  `await`. Everything after it -- the `setMessages` and friends in `try`, or
  `setIsBackendError` in `catch`, and `setIsSessionLoading(false)` in
  `finally` -- runs in one synchronous continuation. React 18 and later batch
  every state update made in one such pass into a single render, so the flag
  cannot go down in a frame before the messages are in. The comment in the
  `finally` block records this; if anyone later adds an `await` between the
  `setMessages` and the `finally`, the blank-to-list transition would gain a
  frame of greeting again.
- **Why state, not a ref.** The flag drives rendering, so it has to be state.
  A ref would not re-render when it changes.
- **Why `Boolean(initialSessionId)`.** The prop is `string | undefined`. The
  explicit conversion reads the same as the `initialSessionId ? ... : ...`
  seed two lines above it; the file uses neither `Boolean()` nor `!!`
  elsewhere, so there is no convention to follow.
- **Why `startNewChat` is left alone.** It runs just before the sidebar
  navigates to `/chat/new`, and that navigation mounts a fresh instance whose
  flag is `false`. Clearing the flag there would only change what the
  outgoing instance shows for one round-trip, from blank to greeting, which
  is the opposite of what is wanted.
- **Why the route effect is left alone.** It calls `loadSessionFromBackend`
  whenever `initialSessionId` is present on mount, which is exactly when the
  flag starts `true`; the `finally` therefore always runs. The
  `ownSessionRef` early return cannot fire on a fresh mount, since the ref is
  `null` then.

---

## 6. Not part of this change

- **A delayed loading indicator.** Showing a spinner only once a load has run
  past roughly 300 ms would help on a slow backend without flashing on a fast
  one. It needs a timer alongside the flag; separate small change if wanted.
- **Switching chats in place** (no remount), a fade-in of the loaded list,
  and scrolling before the first paint. Discussed and deferred; they are what
  would make the switch feel like a single smooth motion rather than a
  reload. Separate document.
- **The sidebar's Recents list** blinking on the same click is handled by
  `update_sidebar_flicker.md`.
- **The greeting after `startNewChat`** still appears instantly when New is
  clicked on a page that stays mounted. Intended.

---

## 7. How to verify

Type-check first; it must be clean:

```
npx tsc --noEmit -p tsconfig.json
```

Then confirm the pane's three tests were replaced:

```
grep -n "messages.length === 0" src/components/chat/chat-view.tsx
```

should print exactly one line, the `showEmptyState` definition. And

```
grep -n "isSessionLoading" src/components/chat/chat-view.tsx
```

should print four lines: the state declaration, the `finally`, the
`showEmptyState` definition, and the pane's branch.

With the backend running, in a desktop-width window:

1. Open a chat with a few messages, then click a different chat in the
   sidebar. The pane must go blank and then show the messages. Neither the
   "무엇을 도와드릴까요?" heading nor the suggested-question cards may appear
   at any point. Repeat several times, including fast clicks.
2. Reload the page on a `/chat/{id}` URL. Same: blank, then messages.
3. Open `/chat/new`. The greeting and the cards are there on the first frame,
   as before.
4. Open a chat whose run is still going (send a slow question in another
   tab, then click it here). Blank, then the history with "Thinking..." under
   it, with the pane scrolled to that line.
5. Stop the backend and open a chat URL. The red banner and the greeting
   appear together once the request has failed. Nothing before that.
6. Throttle the network in the browser's dev tools so the session fetch
   takes a couple of seconds. The pane stays blank for the whole wait; the
   header, composer and sidebar are there throughout; no spinner.
7. If you can produce a chat with no messages (a session created on the
   backend that was never run), open it. It shows the greeting, but only
   after its load has finished.
8. From `/chat/new`, send a message. The flow is unchanged: the user bubble,
   "Thinking...", the reply. The URL changes without a remount, and the pane
   never goes blank.
