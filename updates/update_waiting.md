# Update: wait on the backend's `run_state` instead of guessing

## Why

The frontend currently decides whether a session is still being answered by
looking at the last message: if the user wrote it and it is younger than
10 minutes, the view waits and polls the full session every 3 seconds until
the last message is no longer the user's. After 10 minutes it silently gives
up.

The backend now reports this directly. The session detail endpoint
(`GET /apps/users/{user_id}/sessions/{session_id}`) carries a `run_state`
field, and a new lightweight endpoint
(`GET /apps/users/{user_id}/sessions/{session_id}/run-state`) returns only
that field. Its value is `idle` (nothing to wait for) or `running` (the
agent is still working on the last turn).

After this change:

- A session opened while `running` waits, with no time limit.
- The poll asks the cheap `run-state` endpoint, not the full session.
- When the state is `idle` but the last message is still the user's, the
  reply never came. The view shows the existing "Sorry, I encountered an
  error. Please try again." line in its place, on screen only.

Three files change. Follow the steps in order. Every "replace" block shows
the exact current code first, then the code to put in its place.

---

## Step 1: `src/lib/types.ts`

Add the `RunState` type and a `runState` field on `ChatSession`.

**Replace this:**

```ts
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

**With this:**

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
  // Only the session detail endpoint reports this. The list endpoint does
  // not, so sessions from the list are always "idle".
  runState: RunState;
}
```

---

## Step 2: `src/lib/session-api.ts`

Four edits in this file.

### 2a. Import the new type

**Replace this** (line 1):

```ts
import { ChatSession, Message, MessageArtifact } from "./types";
```

**With this:**

```ts
import { ChatSession, Message, MessageArtifact, RunState } from "./types";
```

### 2b. Read `run_state` from the detail response

**Replace this:**

```ts
interface ApiSessionDetail {
  state: Record<string, unknown>;
  events: ApiEvent[] | null;
  last_update_time: string;
}
```

**With this:**

```ts
interface ApiSessionDetail {
  state: Record<string, unknown>;
  events: ApiEvent[] | null;
  last_update_time: string;
  run_state?: string | null;
}

// The backend's RunState enum, read defensively: anything that is not
// "running" (including a missing field from an older backend) is "idle", so
// a session is never waited on by mistake. Case-insensitive in case the enum
// serializes in upper case.
function parseRunState(value: unknown): RunState {
  return String(value ?? "").toLowerCase() === "running" ? "running" : "idle";
}
```

### 2c. Return `runState` from both mappers

In `mapApiSessionDetail`, **replace this** (the function's final `return`):

```ts
  return {
    id: sessionId,
    title,
    messages: collapsed,
    createdAt: updatedAt,
    updatedAt,
  };
}
```

**With this:**

```ts
  return {
    id: sessionId,
    title,
    messages: collapsed,
    createdAt: updatedAt,
    updatedAt,
    runState: parseRunState(data.run_state),
  };
}
```

In `mapApiSession` (the list mapper, further down), **replace this:**

```ts
  return {
    id: api.session_id,
    title,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
}
```

**With this:**

```ts
  return {
    id: api.session_id,
    title,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
    runState: "idle",
  };
}
```

### 2d. Add the `getRunState` method

Inside the `SessionStorage` class, directly after the `getSession` method
(it ends with `return mapApiSessionDetail(data, userId, sessionId);` and a
closing `}`), **add this:**

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

    const data: { run_state?: string | null } = await res.json();

    return parseRunState(data.run_state);
  }
```

No change is needed to the proxy in `src/app/backend/[...path]/route.ts`.
It forwards any path under `/backend`, so the new endpoint goes through
as-is.

---

## Step 3: `src/components/chat/chat-view.tsx`

Three edits in this file. `Message` and `ERROR_REPLY` are already imported
at the top, so no import changes.

### 3a. Replace the timing constants

**Replace this** (near the top, just above `const IMAGE_EXTENSIONS`):

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

**With this:**

```ts
// A session opened while the backend reports its run as still going is one
// whose reply is on its way -- the request was sent from another page of this
// tab, or from another tab. The view waits for it the way it waits after a
// send, and asks the backend again at this interval until the run is over.
// There is no upper limit on the wait.
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

The 10 minute limit is gone on purpose. The backend now says whether a run
is live, so the view no longer has to guess when to stop.

### 3b. Replace the polling effect

**Replace this** (the whole `useEffect` that begins with the comment
"Polls the backend while a session is waited on", directly above
`if (!userId) return null;`):

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

**With this:**

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

### 3c. Replace the open-session logic

**Replace this** (the body of `loadSessionFromBackend`, from the first
`setSessionId` down to `restoreDraft`):

```ts
      setSessionId(session.id);

      justLoadedRef.current = true;

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

      // Opening another chat from the sidebar keeps this component mounted,
      // so the box has to be swapped over to that chat's draft by hand.
      restoreDraft(readDraft(session.id));
```

**With this:**

```ts
      setSessionId(session.id);

      justLoadedRef.current = true;

      // The backend says whether the agent is still working on the last turn.
      // Waiting looks the same as after a send: spinner, "Thinking...", and
      // the box held until the reply lands. A finished run with no reply on
      // record is shown as a failed turn instead of as one still pending.
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
```

---

## What the new flow does

**Opening a session**

1. Fetch the session once. The response now includes `runState`.
2. If `running`: show the history as-is, put up the spinner, lock the box,
   and start polling.
3. If `idle`: no waiting. If the last message is the user's, the error line
   is appended on screen so the turn does not look pending. An empty session
   gets nothing appended.

**Polling (only while `running`)**

1. Every 3 seconds, call the `run-state` endpoint.
2. `running`: schedule the next tick. Nothing on screen changes.
3. `idle`: fetch the full session once. A real reply lands with the typing
   reveal. A missing reply gets the error line instead. Spinner goes away,
   box unlocks.
4. A request error on any tick is logged and the next tick is scheduled.
   There is no time limit, so a backend stuck in `running` keeps the spinner
   up until the user starts a new chat or opens another session.

**Unchanged**

- Sending a message from this tab. That path waits on its own request and
  never polls.
- The chat API route, the backend proxy, the sidebar, message rendering.

---

## How to verify

Run the type checker first; it must come back clean:

```
npx tsc --noEmit -p .
```

Then, with the backend running:

1. In tab A, send a question that takes a while to answer. In tab B, open
   the same session from the sidebar. Tab B should show the spinner and
   "Thinking...". Check the network panel: it should hit `.../run-state`
   every 3 seconds, not the full session URL.
2. When the answer arrives, tab B should fetch the full session once and
   type the reply out.
3. Open an old session whose last message is the user's and whose run is
   `idle`. It should open instantly with the "Sorry, I encountered an error"
   line under the user's message. Reloading the page shows the same.
4. Open a session while the backend is stopped. The red "Could not connect"
   banner should appear, as before.
5. Start polling on a session, then stop the backend. The spinner should
   stay up and the console should log a poll error every 3 seconds. Start
   the backend again; the next successful tick resumes normally.
