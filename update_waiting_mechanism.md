# Update: waiting state driven by the backend's `run_state`

**Date:** 2026-11-16
**Branch / base:** `develop-261116` at `760a046 new waiting and issues`
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

All line numbers refer to the files as they are at the commit above, before
any edit from this document is applied. Within one file, edits are listed top
to bottom, so each edit shifts the numbers of the ones below it. The "current
code" block under every step is copied verbatim from the file and is the
reliable anchor; search for it rather than trusting the number once you have
started editing.

---

## 1. Why

Today the view decides whether a session is still being answered by looking at
the last mapped message. `loadSessionFromBackend` waits when the last message
is the user's and younger than 10 minutes; the poll refetches the whole
session every 3 seconds until the last message is no longer the user's; after
10 minutes it gives up silently.

That is a guess with three known failure modes:

- A sub-agent that emits intermediate text ends the wait early, because every
  non-user author is mapped to `assistant`.
- A run that dies without writing an error event shows "Thinking..." for the
  full 10 minutes and then unlocks with nothing added.
- A user turn older than 10 minutes opens as finished even if the backend is
  still running.

The backend now reports the answer directly. `SessionInfo` carries
`run_state`, and a dedicated endpoint returns only that field. The view should
read the flag instead of inferring it.

This was implemented once before (commit `fde3850 update waiting state`,
reading `run_state` off the full session on every poll) and removed again in
`93a5f34 update icon`. The version below re-applies the idea using the cheap
`run-state` endpoint for polling, as `update_waiting.md` specified.

---

## 2. Backend contract

From the FastAPI router and `data_agent/schemas`:

| Endpoint | Response model | Fields used here |
|---|---|---|
| `GET /apps/users/{user_id}/sessions/{session_id}` | `GetSessionResponse` (= `SessionInfo`) | `state`, `events`, `last_update_time`, **`run_state`** |
| `GET /apps/users/{user_id}/sessions/{session_id}/run-state` | `GetRunStateResponse` | `session_id`, **`run_state`** |
| `GET /apps/users/{user_id}/sessions` | `ListSessionsResponse` | `sessions: SessionInfo[]`, each with **`run_state`** (defaults to idle) |

`run_state` is the `RunState` enum: `idle` (nothing to wait for) or `running`
(the agent is still working on the last turn). The frontend parses it
case-insensitively and treats anything that is not `running` as `idle`, so an
older backend without the field is never waited on by mistake.

The proxy at `src/app/backend/[...path]/route.ts` forwards every path under
`/backend` unchanged, so the new `run-state` URL needs no proxy change.

---

## 3. Behavior after the change

**Opening a session** (sidebar click, direct URL, page reload)

1. Fetch the session once. The mapped `ChatSession` now carries `runState`.
2. `running`: show the history as-is, put up the spinner and "Thinking...",
   lock the box, start polling.
3. `idle`: no waiting. If the last message is still the user's, the reply
   never came; the existing "Sorry, I encountered an error. Please try again."
   line is appended on screen only, so the turn does not look pending. An
   empty session gets nothing appended.

**Polling** (only while `running`)

1. Every 3 seconds, `GET .../run-state`. Nothing on screen changes while it
   says `running`.
2. The first `idle` triggers one full `GET .../sessions/{id}`. A real reply
   lands with the typing reveal; a missing reply gets the "Sorry..." line.
   Spinner goes away, box unlocks.
3. A failed request on any tick is logged and the next tick is scheduled.
4. There is no time limit. The backend owns the state, so a run it reports as
   `running` is waited on until the user opens another session or starts a
   new chat. `REPLY_WAIT_LIMIT_MS` is removed.

**Unchanged**

- Sending from this tab. `handleSend` waits on its own request and never
  polls. The `ownSessionRef` guard that keeps the route effect from reloading
  a session this tab is mid-send on stays as it is.
- `stopAwaitingReply`, `startNewChat`, the unmount cleanup, the sidebar,
  message rendering, the chat API route, the proxy.

---

## 4. Summary of edits

| Step | File | Current lines | Change |
|---|---|---|---|
| 1 | `src/lib/types.ts` | 22-28 | add `RunState` type and `ChatSession.runState` |
| 2a | `src/lib/session-api.ts` | 1 | import `RunState` |
| 2b | `src/lib/session-api.ts` | 31-38 | `ApiSession.run_state?` |
| 2c | `src/lib/session-api.ts` | 77-84 | `ApiSessionDetail.run_state?` and new `parseRunState()` |
| 2d | `src/lib/session-api.ts` | 239-245 | detail mapper returns `runState` |
| 2e | `src/lib/session-api.ts` | 301-307 | list mapper returns `runState` |
| 2f | `src/lib/session-api.ts` | after 396 | new `SessionStorage.getRunState()` |
| 3a | `src/components/chat/chat-view.tsx` | 24-33 | drop `REPLY_WAIT_LIMIT_MS`, add `withMissingReply()` |
| 3b | `src/components/chat/chat-view.tsx` | 250-303 | poll `run-state`; fetch the session once on `idle` |
| 3c | `src/components/chat/chat-view.tsx` | 315-331 | wait iff `session.runState === "running"` |

`REPLY_WAIT_LIMIT_MS` is referenced only on lines 33, 287 and 328 of
`chat-view.tsx`. All three sit inside the blocks replaced in 3a, 3b and 3c, so
nothing else breaks when the constant goes.

---

## 5. Step 1: `src/lib/types.ts`

### 1a. Lines 22-28: add `RunState` and `runState`

**Current code:**

```ts
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

**Replace with:**

```ts
// Whether the agent is still working on the session's last turn, as reported
// by the backend. "running" means a reply is on its way and the view should
// wait for it; "idle" means nothing more is coming.
export type RunState = "idle" | "running";

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // From the backend's `run_state`. Both the detail and the list endpoint
  // report it; a backend that omits the field reads as "idle".
  runState: RunState;
}
```

`ChatSession` objects are built only by the two mappers in
`src/lib/session-api.ts` (steps 2d and 2e). The sidebar spreads existing
objects when it renames, so no other file needs the new field added.

---

## 6. Step 2: `src/lib/session-api.ts`

### 2a. Line 1: import the type

**Current code:**

```ts
import { ChatSession, Message, MessageArtifact } from "./types";
```

**Replace with:**

```ts
import { ChatSession, Message, MessageArtifact, RunState } from "./types";
```

### 2b. Lines 31-38: `run_state` on the list item

**Current code:**

```ts
interface ApiSession {
  session_id: string;
  app_name: string;
  user_id: string;
  state: Record<string, unknown>;
  events: unknown[];
  last_update_time: string;
}
```

**Replace with:**

```ts
interface ApiSession {
  session_id: string;
  app_name: string;
  user_id: string;
  state: Record<string, unknown>;
  events: unknown[];
  last_update_time: string;
  run_state?: string | null;
}
```

### 2c. Lines 77-84: `run_state` on the detail, plus the parser

**Current code:**

```ts
// The id is deliberately absent: the endpoints disagree on what to call it
// (the list gives `session_id`, the detail may not echo one at all), so the
// mapper is handed the id the caller requested instead of reading it back.
interface ApiSessionDetail {
  state: Record<string, unknown>;
  events: ApiEvent[] | null;
  last_update_time: string;
}
```

**Replace with:**

```ts
// The id is deliberately absent: the endpoints disagree on what to call it
// (the list gives `session_id`, the detail may not echo one at all), so the
// mapper is handed the id the caller requested instead of reading it back.
interface ApiSessionDetail {
  state: Record<string, unknown>;
  events: ApiEvent[] | null;
  last_update_time: string;
  run_state?: string | null;
}

// The backend's RunState enum, read defensively: anything that is not
// "running" -- including a missing field from an older backend -- is "idle",
// so a session is never waited on by mistake. Case-insensitive in case the
// enum serializes in upper case.
function parseRunState(value: unknown): RunState {
  return String(value ?? "").toLowerCase() === "running" ? "running" : "idle";
}
```

### 2d. Lines 239-245: detail mapper returns `runState`

This is the final `return` of `mapApiSessionDetail`.

**Current code:**

```ts
  return {
    id: sessionId,
    title,
    messages: collapsed,
    createdAt: updatedAt,
    updatedAt,
  };
```

**Replace with:**

```ts
  return {
    id: sessionId,
    title,
    messages: collapsed,
    createdAt: updatedAt,
    updatedAt,
    runState: parseRunState(data.run_state),
  };
```

### 2e. Lines 301-307: list mapper returns `runState`

This is the final `return` of `mapApiSession`. The list endpoint's
`SessionInfo` carries `run_state` too, so it is read rather than hard-coded.
Nothing in the sidebar uses it yet; see section 9.

**Current code:**

```ts
  return {
    id: api.session_id,
    title,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
```

**Replace with:**

```ts
  return {
    id: api.session_id,
    title,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
    runState: parseRunState(api.run_state),
  };
```

### 2f. After line 396: add `getRunState`

Line 396 is the closing `}` of `SessionStorage.getSession`, directly before
the JSDoc comment of `loadArtifact`. For reference, the method it follows:

**Current code (lines 374-396, unchanged):**

```ts
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
```

**Insert directly after it:**

```ts

  /**
   * Asks only whether the agent is still working on the session's last turn.
   * Cheap enough to poll: no events, no state, just the one field.
   */
  static async getRunState(
    userId: string,
    sessionId: string,
  ): Promise<RunState> {
    const res = await fetch(
      `${API_BASE}/apps/users/${encodeURIComponent(
        userId,
      )}/sessions/${encodeURIComponent(sessionId)}/run-state`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to load run state: ${res.status}`);
    }

    const data: { session_id?: string; run_state?: string | null } =
      await res.json();

    return parseRunState(data.run_state);
  }
```

---

## 7. Step 3: `src/components/chat/chat-view.tsx`

`Message` (line 3) and `ERROR_REPLY` (line 17) are already imported. No import
changes.

### 3a. Lines 24-33: replace the timing constants

**Current code:**

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

**Replace with:**

```ts
// A session opened while the backend reports its run as still going is one
// whose reply is on its way -- the request was sent from another page of this
// tab, or from another tab. The view waits for it the way it waits after a
// send, and asks the backend again at this interval until the run is over.
// There is no upper limit on the wait: the backend owns the state.
const REPLY_POLL_INTERVAL_MS = 3000;

// A finished run whose last turn is still the user's produced no reply -- it
// ended without leaving an event behind. The turn is shown the same line a
// failed send shows, so it reads as answered rather than as still pending.
// The line is only on screen; nothing is written back to the backend.
function withMissingReply(messages: Message[]): Message[] {
  const last = messages[messages.length - 1];

  if (!last || last.role !== "user") return messages;

  return [
    ...messages,
    { role: "assistant", content: ERROR_REPLY, timestamp: new Date() },
  ];
}
```

### 3b. Lines 250-303: replace the polling effect

The whole `useEffect` that starts with the comment "Polls the backend while a
session is waited on", directly above `if (!userId) return null;`.

**Current code:**

```ts
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
```

**Replace with:**

```ts
  // Polls the backend while a session is waited on. Each tick asks only for
  // the run state, which is cheap; the full session is fetched once, when the
  // run is over. The poll touches no state until then, so nothing on screen
  // moves between polls; then the reply lands exactly as it does after a
  // send. A tick that fails is logged and the next one is scheduled anyway.
  useEffect(() => {
    if (!awaitingSessionId || !userId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const runState = await SessionStorage.getRunState(
          userId,
          awaitingSessionId,
        );

        if (cancelled) return;

        if (runState === "idle") {
          const session = await SessionStorage.getSession(
            userId,
            awaitingSessionId,
          );

          if (cancelled) return;

          const last = session.messages[session.messages.length - 1];
          const replied = last !== undefined && last.role !== "user";

          const messages = replied
            ? session.messages
            : withMissingReply(session.messages);

          // A real reply types itself out; the error line for a missing one
          // just appears, the same as after a failed send.
          setRevealIndex(replied ? messages.length - 1 : null);
          setMessages(messages);
          setAwaitingSessionId(null);
          setIsSending(false);

          return;
        }
      } catch (e) {
        console.error("Error polling session:", e);
      }

      if (cancelled) return;

      timer = setTimeout(tick, REPLY_POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, REPLY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingSessionId, userId]);
```

### 3c. Lines 315-331: replace the open-session decision

Inside `loadSessionFromBackend`, between `justLoadedRef.current = true;` and
the comment that starts "Opening another chat from the sidebar".

**Current code:**

```ts
      setRevealIndex(null);
      setMessages(session.messages);
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
```

**Replace with:**

```ts
      // The backend says whether the agent is still working on the last turn.
      // Waiting looks the same as after a send: spinner, "Thinking...", and
      // the box held until the reply lands. A finished run whose last turn is
      // still the user's produced no reply, so it is shown as a failed turn
      // rather than as one still pending.
      const running = session.runState === "running";

      setRevealIndex(null);
      setMessages(
        running ? session.messages : withMissingReply(session.messages),
      );
      setCurrentSessionTitle(session.title);
      setSidebarOpen(false);

      setAwaitingSessionId(running ? session.id : null);
      setIsSending(running);
```

For context, the whole function after the edit reads:

```ts
  const loadSessionFromBackend = async (id: string) => {
    try {
      const session = await SessionStorage.getSession(userId, id);

      setSessionId(session.id);

      justLoadedRef.current = true;

      // The backend says whether the agent is still working on the last turn.
      // Waiting looks the same as after a send: spinner, "Thinking...", and
      // the box held until the reply lands. A finished run whose last turn is
      // still the user's produced no reply, so it is shown as a failed turn
      // rather than as one still pending.
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

---

## 8. Backend requirement: ordering

The poll fetches the full session right after the first `run-state` call that
returns `idle`. That GET must already contain the final assistant event. If
the backend flips `run_state` to `idle` before appending the reply event, the
view sees a session that ends with the user's turn, appends the "Sorry..."
line, and the real reply only appears on the next load of the session.

So in the backend runner: append the final event (or the error event) to the
session first, then mark the run `idle`.

The error-event mapping in `mapApiSessionDetail` (a non-user event with
`error_code` / `error_message` and no text becomes a "Sorry..." bubble) stays
in place and still applies.

---

## 9. Not part of this change

- **Sidebar indicator.** After step 2e every list item carries `runState`.
  Showing a small spinner next to a running session in the sidebar would be
  a separate, small change in `session-sidebar.tsx`.
- **`onSessionSelect` prop.** The sidebar never calls it (it navigates with
  `router.push`); the chat view passes `loadSessionFromBackend` into it for
  nothing. Dead code, harmless, left alone here.
- **Idle logout during a wait.** `fix_keep_alive.md` describes calling
  `keepAlive()` while a reply is pending. The chat view does not do that
  today, so a user who waits more than 30 minutes is still logged out. That
  fix is independent of this one; if it is applied, the natural hook is the
  polling effect in step 3b (call `keepAlive()` on each tick).
- **Safety-net timeout.** Dropped on purpose. If a stuck backend ever becomes
  a problem, re-add `REPLY_WAIT_LIMIT_MS`, a `startedAt` in the effect, and on
  expiry append `withMissingReply` to the current messages and clear the two
  flags, as the `fde3850` version did.

---

## 10. How to verify

Type-check first; it must be clean:

```
npx tsc --noEmit -p tsconfig.json
```

Then confirm the old heuristic is gone:

```
grep -rn "REPLY_WAIT_LIMIT_MS" src
```

should print nothing.

With the backend running:

1. In tab A, send a question that takes a while. In tab B, open the same
   session from the sidebar. Tab B shows the spinner and "Thinking...". In the
   network panel it should hit `.../run-state` every 3 seconds, not the full
   session URL.
2. When the answer arrives, tab B fetches the full session once and types the
   reply out.
3. Reload tab B while the run is still going. It should come back straight
   into the waiting state, since the state lives on the backend.
4. Open an old session whose last message is the user's and whose run is
   `idle`. It opens instantly with the "Sorry, I encountered an error" line
   under the user's message. Reloading shows the same.
5. Open a session while the backend is stopped. The "Could not connect" banner
   appears, as before.
6. Start polling on a session, then stop the backend. The spinner stays up
   and the console logs a poll error every 3 seconds. Start the backend again;
   the next successful tick resumes normally.
7. Sanity-check a session older than 10 minutes that the backend reports as
   `running`. It must wait; before this change it opened as finished.
