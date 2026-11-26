# Update: name an existing chat that has no title after its next exchange

**Date:** 2026-11-16
**Branch / base:** `develop-261116` at `760a046 new waiting and issues`,
**with `update_session_title.md` already applied** (see below).
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

**Prerequisite.** This change extends `update_session_title.md`. It reuses the
`SessionStorage.createSessionTitle()` method and rewrites the `nameNewSession`
wrapper that document adds, so apply that document first. All line numbers
below refer to the tree **after** `update_session_title.md` and **before**
`update_waiting_mechanism.md`. The "current code" block under every step is
copied verbatim from that tree and is the reliable anchor.

**If `update_waiting_mechanism.md` is also applied** (in either order relative
to the title change, as long as it comes before this one), shift the numbers
below as follows:

| File | Numbers below | Shift |
|---|---|---|
| `src/lib/types.ts` | after 27 | after 32 |
| `src/lib/session-api.ts` | 231-237, after 244 | 241-247, after 254 |
| `src/lib/session-api.ts` | 292-299, after 306 | 303-310, after 317 |
| `src/components/chat/chat-view.tsx` | after 105 | after 116 |
| `src/components/chat/chat-view.tsx` | after 313 | after 330 |
| `src/components/chat/chat-view.tsx` | 415-425, after 468, 523-526, 540-542 | 431-441, after 484, 539-542, 556-558 |

---

## 1. Why

`update_session_title.md` names a chat after its **first** exchange, and only
when the chat was created by that very send. Older chats that never got a
title (created before the backend had the title endpoint, or whose naming
call failed) are left alone: their sidebar row and tab title keep showing the
session id forever.

The same mechanism should cover them. When a chat is opened and the backend
has no title on record for it, the next exchange the user completes in it
names it, in exactly the way a new chat is named: after the run has finished
(with a reply or with an error), awaited, before the reply is shown.

Whether a session has a title is known at load time. `getSession()` already
reads `state.session_title`; today the mapper hides a missing one by falling
back to the session id as `title`, so the view cannot tell the two apart.
This change surfaces the fact as a boolean on `ChatSession`, remembers it in
the view for the open chat, and folds it into the existing naming decision.

---

## 2. Backend contract

Unchanged from `update_session_title.md`:

```
POST /apps/users/{user_id}/sessions/{session_id}/title
```

200 with `{ session_title }` on success, 400 on `ValueError`, 500 otherwise.
The title must land in `state.session_title`. Nothing in the frontend reads
the response.

The backend must accept the call for a session that already has several
turns. If it only ever names a session from its first exchange, that is still
fine; the frontend does not care which messages it looks at.

---

## 3. Behavior after the change

**Opening a chat** (sidebar click, direct URL, reload)

1. `getSession()` returns the session. `ChatSession.hasTitle` is true when
   `state.session_title` is a non-empty string, false otherwise.
2. `loadSessionFromBackend` stores `!session.hasTitle` in a ref:
   "this chat still needs a name".

**Sending in that chat**

3. The run goes out and settles as today.
4. Before the reply (or the error line) is shown, if the chat is new **or**
   the ref says it has no title, `POST .../title` is sent and awaited. Its
   outcome is ignored apart from a console line on failure. The spinner stays
   up throughout, exactly as for a new chat.
5. The ref is cleared when the attempt is made, whatever the outcome. The
   next exchange in the same visit does not try again. If the attempt failed,
   the chat is still untitled on the backend, so the next time it is opened
   step 2 sets the ref again and the next exchange retries. One attempt per
   visit keeps a broken title endpoint from slowing down every message.
6. The reply appears. Within 5 s the sidebar poll reads the new title and the
   existing wiring updates the tab title and the sidebar row.

**Unchanged**

- A chat that has a title: the ref is false, nothing is called.
- A new chat: named after its first exchange as before; `isNewSession` still
  drives that, the ref only adds the second reason.
- Switching chats resets the ref from the newly loaded session, so a flag
  from one chat never leaks into another. "New chat" does not need to reset
  it: a new chat is named because it is new, and the attempt clears the ref.

---

## 4. Summary of edits

| Step | File | Lines (after title change) | Change |
|---|---|---|---|
| 1 | `src/lib/types.ts` | after 27 | `ChatSession.hasTitle: boolean` |
| 2a | `src/lib/session-api.ts` | 231-237 | detail mapper computes `hasTitle` |
| 2b | `src/lib/session-api.ts` | after 244 | detail mapper returns it |
| 2c | `src/lib/session-api.ts` | 292-299 | list mapper computes `hasTitle` |
| 2d | `src/lib/session-api.ts` | after 306 | list mapper returns it |
| 3a | `src/components/chat/chat-view.tsx` | after 105 | `untitledSessionRef` |
| 3b | `src/components/chat/chat-view.tsx` | after 313 | set the ref on load |
| 3c | `src/components/chat/chat-view.tsx` | 415-425 | wrapper becomes `nameSession`, clears the ref |
| 3d | `src/components/chat/chat-view.tsx` | after 468 | `const needsTitle = isNewSession \|\| untitledSessionRef.current` |
| 3e | `src/components/chat/chat-view.tsx` | 523-526 | success branch uses `needsTitle` / `nameSession` |
| 3f | `src/components/chat/chat-view.tsx` | 540-542 | error branch uses `needsTitle` / `nameSession` |

No import changes. Within each file apply the edits **bottom-up** (2d, 2c,
2b, 2a; 3f, 3e, 3d, 3c, 3b, 3a) so the line numbers stay valid, or search for
the "current code" blocks.

---

## 5. Step 1: `src/lib/types.ts`

### 1a. After line 27: add `hasTitle`

**Current code (lines 22-28):**

```ts
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

**Insert directly after line 27 (`updatedAt: Date;`):**

```ts
  // Whether the backend has a title on record (state.session_title). `title`
  // falls back to the id when it has none, so this is the only reliable way
  // to tell an unnamed session apart.
  hasTitle: boolean;
```

If `update_waiting_mechanism.md` is applied, the interface also has a
`runState` field with its own comment; `hasTitle` goes after `updatedAt`
either way, the order of the two extra fields does not matter.

---

## 6. Step 2: `src/lib/session-api.ts`

### 2a. Lines 231-237: detail mapper computes `hasTitle`

In `mapApiSessionDetail`.

**Current code:**

```ts
  const stateTitle = data.state?.session_title;

  // If there is no valid session title, use the session ID.
  const title =
    typeof stateTitle === "string" && stateTitle.trim()
      ? stateTitle.trim()
      : sessionId;
```

**Replace with:**

```ts
  const stateTitle = data.state?.session_title;

  const hasTitle = typeof stateTitle === "string" && stateTitle.trim() !== "";

  // If there is no valid session title, use the session ID.
  const title = hasTitle ? stateTitle.trim() : sessionId;
```

`stateTitle` is a `const`, so TypeScript carries the `typeof` check through
the `hasTitle` alias and `stateTitle.trim()` type-checks without a cast.

### 2b. After line 244: detail mapper returns it

The final `return` of `mapApiSessionDetail`.

**Current code (lines 239-245):**

```ts
  return {
    id: sessionId,
    title,
    messages: collapsed,
    createdAt: updatedAt,
    updatedAt,
  };
```

**Insert directly after line 244 (`    updatedAt,`):**

```ts
    hasTitle,
```

### 2c. Lines 292-299: list mapper computes `hasTitle`

In `mapApiSession`.

**Current code:**

```ts
  const stateTitle = api.state?.session_title;

  // If session_title exists and is non-empty, use it.
  // Otherwise, directly use the session ID.
  const title =
    typeof stateTitle === "string" && stateTitle.trim()
      ? stateTitle.trim()
      : api.session_id;
```

**Replace with:**

```ts
  const stateTitle = api.state?.session_title;

  const hasTitle = typeof stateTitle === "string" && stateTitle.trim() !== "";

  // If session_title exists and is non-empty, use it.
  // Otherwise, directly use the session ID.
  const title = hasTitle ? stateTitle.trim() : api.session_id;
```

### 2d. After line 306: list mapper returns it

The final `return` of `mapApiSession`.

**Current code (lines 301-307):**

```ts
  return {
    id: api.session_id,
    title,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
```

**Insert directly after line 306 (`    updatedAt,`):**

```ts
    hasTitle,
```

Nothing in the sidebar reads `hasTitle` yet; the list mapper sets it only
because the field is required on `ChatSession`. See section 8 for what it
could be used for.

---

## 7. Step 3: `src/components/chat/chat-view.tsx`

### 3a. After line 105: the ref

**Current code (lines 103-105):**

```ts
  const shouldPinRef = useRef(false);
  const justLoadedRef = useRef(false);
  const ownSessionRef = useRef<string | null>(null);
```

**Insert directly after line 105:**

```ts

  // True while the open chat has no title on record, so its next exchange
  // names it. Set from the session when it is loaded, cleared once naming has
  // been attempted.
  const untitledSessionRef = useRef(false);
```

### 3b. After line 313: set the ref when a session is loaded

In `loadSessionFromBackend`, right after the just-loaded flag.

**Current code (lines 311-313):**

```ts
      setSessionId(session.id);

      justLoadedRef.current = true;
```

**Insert directly after line 313:**

```ts

      // An older chat that was never named gets named after its next exchange.
      untitledSessionRef.current = !session.hasTitle;
```

### 3c. Lines 415-425: the wrapper becomes `nameSession` and clears the ref

This is the `nameNewSession` helper added by `update_session_title.md`,
between `handleDrop` and `handleSend`. It is renamed because it no longer
applies only to new chats.

**Current code:**

```ts
  // Names a new chat after its first exchange. The reply is held back until
  // this has settled, so it is written to never throw: a failure is logged and
  // the reply is shown regardless. Nothing is read from the response -- the
  // sidebar's poll picks the title up from the session state.
  const nameNewSession = async (sessionId: string) => {
    try {
      await SessionStorage.createSessionTitle(userId, sessionId);
    } catch (e) {
      console.error("Error creating session title:", e);
    }
  };
```

**Replace with:**

```ts
  // Names the chat after the exchange that just ended, when it has no title
  // yet: the first exchange of a new chat, or the next one of an older chat
  // that was never named. The reply is held back until this has settled, so it
  // is written to never throw: a failure is logged and the reply is shown
  // regardless. Nothing is read from the response -- the sidebar's poll picks
  // the title up from the session state. One attempt per visit: the untitled
  // flag is cleared here whatever the outcome, and is set again the next time
  // the chat is opened still without a title.
  const nameSession = async (sessionId: string) => {
    untitledSessionRef.current = false;

    try {
      await SessionStorage.createSessionTitle(userId, sessionId);
    } catch (e) {
      console.error("Error creating session title:", e);
    }
  };
```

### 3d. After line 468: decide once whether this exchange names the chat

Line 468 is the closing `}` of the `if (!activeSessionId) { ... }` block that
creates a new session; line 470 starts `const userMessage`. The decision is
taken here, before the run, so the two branches below agree and so a failed
run still names an untitled chat.

**Current code (lines 460-468):**

```ts
      } catch (error) {
        console.error("Error creating session:", error);

        setIsBackendError(true);
        setIsSending(false);

        return;
      }
    }
```

**Insert directly after line 468:**

```ts

    // Whether this exchange is the one that names the chat: the first exchange
    // of a new chat, or the next one of a chat that was loaded without a title.
    const needsTitle = isNewSession || untitledSessionRef.current;
```

### 3e. Lines 523-526: success branch

Inside the `try` that posts to `/api/chat`, after the assistant message has
been built.

**Current code:**

```ts
      // A new chat is named after its first exchange, and the reply waits for
      // that to settle. nameNewSession never throws, so a naming failure
      // cannot turn a good reply into the error line below.
      if (isNewSession) await nameNewSession(activeSessionId);
```

**Replace with:**

```ts
      // The chat is named now if it has no title yet, and the reply waits for
      // that to settle. nameSession never throws, so a naming failure cannot
      // turn a good reply into the error line below.
      if (needsTitle) await nameSession(activeSessionId);
```

### 3f. Lines 540-542: error branch

Inside the `catch` of that `try`, above the `setMessages` that shows the
"Sorry..." line.

**Current code:**

```ts
      // A failed first exchange still names the chat, and the error line
      // waits for that the same way the reply does.
      if (isNewSession) await nameNewSession(activeSessionId);
```

**Replace with:**

```ts
      // A failed exchange still names an untitled chat, and the error line
      // waits for that the same way the reply does.
      if (needsTitle) await nameSession(activeSessionId);
```

For context, `handleSend` from the session-creation block to the end, after
all edits:

```ts
    if (!activeSessionId) {
      try {
        activeSessionId = await SessionStorage.createSession(userId);

        isNewSession = true;

        ownSessionRef.current = activeSessionId;

        setSessionId(activeSessionId);

        window.history.replaceState(null, "", `/chat/${activeSessionId}`);
      } catch (error) {
        console.error("Error creating session:", error);

        setIsBackendError(true);
        setIsSending(false);

        return;
      }
    }

    // Whether this exchange is the one that names the chat: the first exchange
    // of a new chat, or the next one of a chat that was loaded without a title.
    const needsTitle = isNewSession || untitledSessionRef.current;

    const userMessage: Message = {
      role: "user",
      content: currentInput,
      timestamp: new Date(),

      image: currentFile ? await fileToDataUrl(currentFile) : undefined,
    };

    const historyWithUserMessage = [...messages, userMessage];

    shouldPinRef.current = true;

    // Whatever was typing itself out before this send is finished with.
    setRevealIndex(null);
    setMessages(historyWithUserMessage);

    try {
      // ... form is built and posted to /api/chat, unchanged ...

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };

      const updatedMessages = [...historyWithUserMessage, assistantMessage];

      // The chat is named now if it has no title yet, and the reply waits for
      // that to settle. nameSession never throws, so a naming failure cannot
      // turn a good reply into the error line below.
      if (needsTitle) await nameSession(activeSessionId);

      // The reply is here in full; the reveal only decides how it lands.
      setRevealIndex(historyWithUserMessage.length);
      setMessages(updatedMessages);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        role: "assistant",
        content: ERROR_REPLY,
        timestamp: new Date(),
      };

      // A failed exchange still names an untitled chat, and the error line
      // waits for that the same way the reply does.
      if (needsTitle) await nameSession(activeSessionId);

      setMessages([...historyWithUserMessage, errorMessage]);
    } finally {
      setIsSending(false);

      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };
```

---

## 8. Not part of this change

- **Retrying within a visit.** A failed naming is retried only on the next
  load of the chat. To retry on every exchange instead, have `nameSession`
  clear the ref only after a successful call (move the assignment into the
  `try` after the `await`). Not done, because a broken title endpoint would
  then add its latency to every message.
- **Sidebar "Untitled" label.** The list mapper now exposes `hasTitle`, so the
  sidebar could show "Untitled chat" instead of the raw id for such rows. A
  small, separate change in `session-sidebar.tsx`.
- **Naming without a new exchange.** A chat opened without a title could be
  named immediately on load rather than after the next send. Not what was
  asked; it would also fire the model call for every untitled chat the user
  merely glances at.
- **The waiting-mechanism poll.** A reply that lands through the poll (chat
  opened from another tab mid-run) does not name the chat; the tab that sent
  the message does. If that tab was closed before its run finished, the chat
  stays untitled until its next exchange, which this change then covers.

---

## 9. How to verify

Type-check first; it must be clean:

```
npx tsc --noEmit -p tsconfig.json
```

Then confirm the old helper name is gone:

```
grep -rn "nameNewSession" src
```

should print nothing.

With the backend running and the network panel open:

1. Pick an existing chat whose `state.session_title` is empty (its sidebar
   row shows the session id). Open it, send a message. Expect `POST /api/chat`
   and then `POST .../sessions/{id}/title`; "Thinking..." stays up until the
   title call returns, then the reply appears. Within 5 s the sidebar row and
   the tab title change to the generated title.
2. Send another message in the same chat. No `POST .../title`.
3. Open a chat that already has a title and send a message. No
   `POST .../title`.
4. Open an untitled chat, then switch to a titled chat without sending, and
   send there. No `POST .../title`: the ref was reset by the second load.
5. Open an untitled chat and make the run fail (stop the backend after the
   session is loaded). The `POST .../title` is still attempted; the "Sorry..."
   line appears after it has returned or failed; the console shows one
   `Error creating session title:` line if it failed.
6. Make the title call fail for an untitled chat (backend returns 500 for
   it). The reply still appears after the failed call. Send again: no second
   attempt. Reload the chat and send: the attempt is made again.
7. New chat: unchanged. `POST .../sessions`, `POST /api/chat`,
   `POST .../title`, then the reply.
