# Feature: waiting state when a session is opened mid-reply

**Date:** 2026-09-06
**Commit:** `d8cfa3e waiting state`
**Files changed:**

| File | Change |
|---|---|
| `src/lib/error-reply.ts` | New. Shared "Sorry..." text. |
| `src/lib/session-api.ts` | Error events map to a "Sorry..." bubble. |
| `src/components/chat/chat-view.tsx` | Waiting state on open, polling, give-up limit, sentinel moved. |
| `src/components/chat/use-follow-reveal.ts` | Follow-along starts only when the reader is at the reply. |

---

## 1. Behavior

### Before

Sending a prompt sets `isSending`, which shows the spinner and "Thinking...",
disables the textarea and buttons, and switches the footer to "Sending...".
The flag is cleared when `/api/chat` returns.

Clicking a session in the sidebar does `router.push("/chat/<id>")`. Next.js keys
the page by the dynamic segment, so the `ChatView` instance is unmounted and a
fresh one is mounted. The pending fetch keeps running, but its state updates
land on the dead instance. The fresh instance loads history from the backend,
sees no reply yet, and shows the session as idle: no spinner, textarea enabled.

### After

When a session is loaded and its **last mapped message is the user's**, the
view enters the same waiting state as after a send. It then re-fetches the
session every few seconds. A poll that still ends with the user's turn changes
nothing on screen. The first poll that ends with an assistant message replaces
the list, sets the reveal index to that message, and clears the flag, so the
reply types out exactly as it does after a send.

Additional rules:

- **Error event ends the turn.** A stored event from a non-user author with no
  text but with `error_code` / `error_message` is mapped to an assistant bubble
  reading `Sorry, I encountered an error. Please try again.` A session ending in
  one opens as finished, with no waiting state. An error event in the middle of
  the history is printed in place, like any other bubble.
- **Give-up limit.** Waiting stops and the input unlocks after
  `REPLY_WAIT_LIMIT_MS`. The same limit skips waiting on open when the last user
  message is older than that.
- **Scroll.** The end-of-messages sentinel now sits under the spinner, so
  opening a session mid-reply scrolls the "Thinking..." line into view. The
  follow-along only carries a reader who is already near the reply when it
  lands. Someone who scrolled up beforehand keeps their place.
- **Navigation.** The poll is cancelled on unmount, when another session is
  loaded, and when New chat is clicked.

| Constant | Value | Where |
|---|---|---|
| `REPLY_POLL_INTERVAL_MS` | 3000 | `chat-view.tsx` top |
| `REPLY_WAIT_LIMIT_MS` | 10 minutes | `chat-view.tsx` top |

### Backend prerequisite

The ADK `Runner` appends the user event to the session **before** the agent
runs, and `DatabaseSessionService` persists it immediately. That is what makes
"last message is the user's" a reliable signal that a run is in progress.

The error bubble relies on the backend appending an event with `error_code`
and/or `error_message` when a run fails, for example:

```python
except Exception as e:
    logger.exception(...)
    session = await self._session_service.get_session(
        app_name=self._app_name, user_id=user_id, session_id=session_id
    )
    if session:
        await self._session_service.append_event(session, Event(
            author=EventAuthors.SYSTEM,
            error_code="LLM_ERROR",
            error_message=str(e),
        ))
    raise
```

Without that, a failed run leaves the user's turn unanswered and the session
shows "Thinking..." until the give-up limit expires.

---

## 2. `src/lib/error-reply.ts` (new file)

```ts
// The one line shown in place of a reply that never arrived. Used both for a
// request that fails in this tab and for an error event read back from a
// session, so the two cases look the same on screen.
export const ERROR_REPLY = "Sorry, I encountered an error. Please try again.";
```

---

## 3. `src/lib/session-api.ts`

### 3a. Import

```ts
import { ChatSession, Message, MessageArtifact } from "./types";
import { ERROR_REPLY } from "./error-reply";
```

### 3b. `ApiEvent` and `isErrorEvent`

Replace:

```ts
interface ApiEvent {
  content: { parts: ApiPart[] | null; role: string } | null;
  author: string;
  timestamp: string | null;
}
```

With:

```ts
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
```

### 3c. Mapper tail in `mapApiSessionDetail`

Replace:

```ts
      const text = (spokenParts[spokenParts.length - 1]?.text ?? "").trim();

      // Keep the message if it has text or (for a user) an attachment.
      if (!text && !image && !artifact) return null;

      return {
        role,
        content: text,
        timestamp: event.timestamp ? new Date(event.timestamp) : undefined,
        image,
        artifact,
      };
```

With:

```ts
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
```

---

## 4. `src/components/chat/chat-view.tsx`

### 4a. Import

After the `app-title` import:

```ts
import { NEW_CHAT_TITLE, documentTitle } from "@/lib/app-title";
import { ERROR_REPLY } from "@/lib/error-reply";
```

### 4b. Constants

Directly above `const IMAGE_EXTENSIONS = [`:

```ts
// A session opened while its last turn is still the user's is one whose reply
// is on its way -- the request was sent from another page of this tab, or
// from another tab. The view waits for it the way it waits after a send, and
// asks the backend again at this interval until the reply is there.
const REPLY_POLL_INTERVAL_MS = 3000;

// How long a turn is waited on before it is given up as one that will never be
// answered -- a run that died without leaving an error event behind. Also the
// age past which a session is opened as finished rather than waited on.
const REPLY_WAIT_LIMIT_MS = 10 * 60 * 1000;
```

### 4c. State

Directly after the `revealIndex` state:

```ts
  const [revealIndex, setRevealIndex] = useState<number | null>(null);

  // The session whose reply is being polled for, once it was opened with the
  // user's turn still unanswered. Null when nothing is being waited on.
  const [awaitingSessionId, setAwaitingSessionId] = useState<string | null>(
    null,
  );
```

### 4d. Stop helper and polling effect

Insert **above** `if (!userId) return null;` (it must sit before the early
return, or React complains about a conditional hook). It goes right after the
`document.title` effect:

```ts
  // Leaves the waiting state entered by loadSessionFromBackend, if any. A send
  // in flight from this instance is not touched -- that keeps its own flag.
  const stopAwaitingReply = () => {
    if (!awaitingSessionId) return;

    setAwaitingSessionId(null);
    setIsSending(false);
  };

  // Polls the backend while a session is waited on. The poll touches no state
  // until the reply is there, so nothing on screen moves between polls; then
  // the reply lands exactly as it does after a send.
  useEffect(() => {
    if (!awaitingSessionId || !userId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const startedAt = Date.now();

    const tick = async () => {
      try {
        const session = await SessionStorage.getSession(
          userId,
          awaitingSessionId,
        );

        if (cancelled) return;

        const last = session.messages[session.messages.length - 1];

        if (last && last.role !== "user") {
          // The reply is here in full; the reveal only decides how it lands.
          setRevealIndex(session.messages.length - 1);
          setMessages(session.messages);
          setAwaitingSessionId(null);
          setIsSending(false);

          return;
        }
      } catch (e) {
        console.error("Error polling session:", e);
      }

      if (cancelled) return;

      if (Date.now() - startedAt >= REPLY_WAIT_LIMIT_MS) {
        setAwaitingSessionId(null);
        setIsSending(false);

        return;
      }

      timer = setTimeout(tick, REPLY_POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, REPLY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingSessionId, userId]);

  if (!userId) return null;
```

### 4e. Enter the waiting state in `loadSessionFromBackend`

After `setSidebarOpen(false);` and before the `restoreDraft(...)` call:

```ts
      setCurrentSessionTitle(session.title);
      setSidebarOpen(false);

      // A user turn with nothing after it is still being answered, unless it is
      // so old that no answer is coming. Waiting looks the same as after a
      // send: spinner, "Thinking...", and the box held until the reply lands.
      const last = session.messages[session.messages.length - 1];

      const unanswered =
        last?.role === "user" &&
        (!last.timestamp ||
          Date.now() - last.timestamp.getTime() < REPLY_WAIT_LIMIT_MS);

      setAwaitingSessionId(unanswered ? session.id : null);
      setIsSending(unanswered);

      // Opening another chat from the sidebar keeps this component mounted,
      // so the box has to be swapped over to that chat's draft by hand.
      restoreDraft(readDraft(session.id));
```

### 4f. Cancel on New chat in `startNewChat`

```ts
  const startNewChat = () => {
    ownSessionRef.current = null;

    stopAwaitingReply();

    setSessionId("");
```

### 4g. Use the shared error text in `handleSend`

Replace:

```ts
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
```

With:

```ts
      const errorMessage: Message = {
        role: "assistant",
        content: ERROR_REPLY,
        timestamp: new Date(),
      };
```

### 4h. Move the sentinel under the spinner

Remove these two lines from **above** the `{isSending && (` block:

```tsx
                {/* Sentinel: scroll target when opening an existing session */}
                <div ref={endOfMessagesRef} aria-hidden />
```

And add them **below** the spinner block, before the spacer `div`:

```tsx
                {isSending && (
                  ...
                )}

                {/* Sentinel: scroll target when opening an existing session.
                    Sits under the spinner so a session opened mid-reply
                    scrolls to the "Thinking..." line, not just above it. */}
                <div ref={endOfMessagesRef} aria-hidden />

                {/* Spacer so the pinned question can reach the top */}
```

---

## 5. `src/components/chat/use-follow-reveal.ts`

Replace:

```ts
    let following = true;
    let lastTop = viewport.scrollTop;

    // How far the bottom of the reply sits past the bottom of the pane. Zero or
    // less means the whole reply is still on screen.
    const overflow = () =>
      message.getBoundingClientRect().bottom -
      (viewport.getBoundingClientRect().bottom - STICK_PADDING);
```

With:

```ts
    let lastTop = viewport.scrollTop;

    // How far the bottom of the reply sits past the bottom of the pane. Zero or
    // less means the whole reply is still on screen.
    const overflow = () =>
      message.getBoundingClientRect().bottom -
      (viewport.getBoundingClientRect().bottom - STICK_PADDING);

    // Only a reader who is already at the reply gets carried along. One who
    // had scrolled up before it landed keeps their place, the same as if they
    // had scrolled up during it.
    let following = overflow() <= RESUME_SLACK;
```

`following` must be declared after `overflow`, since it calls it.

---

## 6. How to verify

1. Send a prompt that takes a while to answer.
2. While it runs, click another session in the sidebar, then click the first
   session again.
3. Expect: spinner and "Thinking...", textarea and buttons disabled, footer
   reads "Sending...". Nothing should flicker while it waits.
4. When the reply arrives, it should type out word by word, the same as after
   a normal send. If you had scrolled up, the view must not jump.
5. Open a session whose last stored event is an error event. Expect the
   "Sorry..." bubble and an enabled textarea, with no spinner.

Checks run on the commit: `npx tsc --noEmit` passes. `npx eslint` on the four
files reports only issues that already existed before the change (unused
`maxLength`, `image`, `artifact`, and two pre-existing `react-hooks` errors
around the mount effect).

---

## 7. Known limits

- The registry-free design means a **full page reload** during a wait also
  works, since the state is derived from the backend rather than kept in the
  tab. A **closed tab** works the same way.
- A run that dies **without** writing an error event, or that returns
  "No response received", shows "Thinking..." until `REPLY_WAIT_LIMIT_MS`
  expires.
- Every stored event with text is mapped to an assistant bubble regardless of
  author. If a sub-agent under `root_agent` emits text before the final answer,
  that text ends the wait early. If that ever happens, the end condition needs
  to check the event author and the absence of function-call parts.
- The sidebar polls the session list every 5 seconds. The reply poll is one
  extra `GET /sessions/<id>` every 3 seconds per tab that is waiting.
