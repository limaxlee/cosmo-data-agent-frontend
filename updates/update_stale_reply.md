# Update: a reply lands only in the chat it was sent from

**Date:** 2026-11-17
**Re-based:** 2026-11-22, onto the code with the DICE single sign-on change.
**Branch / base:** `develop-261121`: commit `fe881c9 [feat] apply fixes 261117`
plus the DICE single sign-on change (base path, `apiFetch`, the login check in
`handleSend`). That is the working tree as it stands on 2026-11-22.
`update_waiting_mechanism.md` and `update_session_title.md` are already part
of that code.
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

The only file touched is `src/components/chat/chat-view.tsx`. Line numbers
refer to that file as it is in the working tree described above, 856 lines
long, with `update_session_open_blank.md` **not** yet applied. If that
document has been applied first, add 10 to the numbers in step 1a and 14 to
the numbers in steps 1b and 1c; its edits all sit above or below the blocks
changed here, so nothing else moves. Applying this document first and that one
second also works; that document gives the numbers for that order.

Within the file, edits are listed top to bottom, so each edit shifts the
numbers of the ones below it; the shifted numbers are given at each step. The
"current code" block under every step is copied verbatim from the file and is
the reliable anchor; search for it rather than trusting the number once you
have started editing.

**What the re-base changed in this document.** The single sign-on change
rewrote parts of `handleSend` and one line of `startNewChat`, so this
document changed in substance, not only in its numbers:

- `handleSend` now has an await before anything else happens: the login check
  (`loginStillAlive()`). The token is therefore taken above that check, and a
  send that finds its token retired after the check ends there. This is new;
  see step 1c-i and the design notes.
- `setIsSending(true)` moved to the top of `handleSend`, above the login
  check. Step 1c, which was three sub-edits, is now four: the old first one
  is split into the top of the function (1c-i) and the session creation
  (1c-ii).
- Both `window.history.replaceState` calls carry `BASE_PATH` now. The blocks
  below keep them as they are in the code.
- `response.ok` is now checked after the `/api/chat` call, so that item is
  gone from section 6.
- Two counts were corrected: the question-bubble edit adds 3 lines (it said
  2), and `sendTokenRef` appears on twelve lines after the change, not ten.

---

## 1. Why

Reproduce: open `/chat/new`, send a message, and while "Thinking..." is up
click New in the sidebar. The pane shows the new-chat greeting and the box
accepts typing, but the send button stays disabled. When the reply to the
first message arrives, that message and its reply appear in the new chat, and
the reply types itself out there. A send from that screen would then create a
third session and post the first chat's history into it.

Three things line up to produce this.

**The New click does not remount the view.** The first send ran inside the
`/chat/new` page instance. It created session A and moved the URL to
`/chat/A` with `history.replaceState`, which changes the address bar but not
the route the router has rendered. The sidebar's New handler calls
`onNewSession` and then `router.push("/chat/new")`:

```ts
  const handleNewSession = () => {
    onNewSession();
    router.push("/chat/new");
    setIsMobileOpen(false);
  };
```

That is the route already on screen, so the same component instance stays
mounted and the send that is in flight keeps running inside it. Clicking a
different chat instead goes to `/chat/{id}`, a different route, which
remounts and discards the old instance along with its pending send. The bug
therefore needs the New button (or the wordmark, which runs the same handler).

**The pending send assumes the screen is still its chat.** When the reply
comes back, `handleSend` applies it unconditionally:

```ts
      // The reply is here in full; the reveal only decides how it lands.
      setRevealIndex(historyWithUserMessage.length);
      setMessages(updatedMessages);
```

`historyWithUserMessage` is chat A's history plus A's question, and
`updatedMessages` adds A's reply. Nothing checks that A is still what the
user is looking at. The `catch` branch does the same with the error line.

**The box stays locked.** `isSending` is cleared only in the send's
`finally`. `startNewChat` calls `stopAwaitingReply`, but that clears only the
state of a chat opened from the sidebar and polled for; by design it leaves a
send from this instance alone. So the send button is disabled, and
`handleSend` returns early, until A's reply has arrived.

The remedy is a rule, not a special case: a send belongs to the chat it was
sent from, and if that chat has left the screen by the time anything comes
back, the send touches nothing on screen. The reply is not lost. The backend
wrote it to session A, so opening A from the sidebar shows it, or shows
"Thinking..." and polls if the run is still going, through the waiting
mechanism already in place.

---

## 2. Behavior after the change

**The reported sequence**

1. On `/chat/new`, send. Session A is created, the URL becomes `/chat/A`, the
   question is shown, "Thinking..." is up, the box is locked. Unchanged.
2. Click New. The pane shows the greeting, the box is empty and **unlocked at
   once**, the URL is `/chat/new`. Typing enables the send button as in any
   new chat.
3. A's reply arrives. **Nothing on screen changes.** A is named after its
   first exchange as before, and within 5 s the sidebar's poll lists it under
   its new title.
4. Clicking A in the sidebar opens it with the question and the reply. If the
   run is still going at that point, it opens with "Thinking..." and waits,
   as the waiting mechanism specifies.

**Sending in the new chat before A's reply arrives.** The new chat's send
proceeds normally. When A's reply arrives it is dropped, and it neither
unlocks nor refocuses the box, so the new chat's own "Thinking..." stays up
until its own reply lands and types out.

**Clicking New while the session is still being created.** A narrower
window, but handled. The session is still created and the message is still
sent to it, so it is answered, named and listed like any other chat. It is
just not adopted on screen: the URL stays `/chat/new`, `sessionId` stays
empty, and the question bubble is not shown in the new chat.

**Clicking New while the login is being checked.** Narrower still: the check
is instant unless the pass has under a minute left and has to be renewed
first, which is one request to the login service. If New is clicked in that
moment, the send ends there. Nothing was cleared, created or sent, and the
text is still saved as the draft of the chat it was typed in, so it is in the
box when that chat is on screen again.

**A failed send after New.** The error line is dropped the same way the
reply is. The failure is still logged.

**The login ends during a send.** Unchanged by this document. The provider
takes the chat off the screen and sends the browser through the login page;
the checks added here make no difference to that.

**Unchanged**

- A send in a chat that stays on screen: question, "Thinking...", reply with
  the typing reveal, box unlocked and refocused, chat named if new.
- Clicking another chat mid-send. That path remounts, as today.
- A chat opened from the sidebar while its run is going: `stopAwaitingReply`
  still ends that wait on New, as today.
- The chat API route, the backend, the sidebar, `loadSessionFromBackend`.

---

## 3. Summary of edits

| Step | File | Current lines | Change |
|---|---|---|---|
| 1a | `src/components/chat/chat-view.tsx` | after 117 | add `sendTokenRef` |
| 1b | `src/components/chat/chat-view.tsx` | 357-374 | `startNewChat` retires the token and unlocks the box |
| 1c | `src/components/chat/chat-view.tsx` | 438-579 | `handleSend` takes a token and checks it after every await |

No import changes; `useRef` is already imported. After 1a (+7 lines) step 1b
is at 364-381; after 1b (+6 lines) step 1c starts at line 451. Step 1c is
given as four sub-edits with their own shifted numbers.

---

## 4. Step 1: `src/components/chat/chat-view.tsx`

### 1a. After line 117: the token

Lines 115-117 are the three bookkeeping refs; line 119 opens the element
refs. The new ref goes with the first group.

**Current code (lines 115-117, unchanged):**

```ts
  const shouldPinRef = useRef(false);
  const justLoadedRef = useRef(false);
  const ownSessionRef = useRef<string | null>(null);
```

**Insert directly after it** (between `ownSessionRef` and the blank line
above `inputRef`):

```ts

  // Counts sends. handleSend takes the next value when it starts and applies
  // what comes back only while the count is unchanged. startNewChat bumps it,
  // so a reply to a chat the user has since left is dropped instead of landing
  // in the chat that replaced it on screen. The reply itself is not lost: the
  // backend wrote it to the session it belongs to.
  const sendTokenRef = useRef(0);
```

### 1b. Lines 357-374 (364-381 after 1a): `startNewChat`

Two additions at the top of the function: retire the token, and unlock the
box. The rest of the body is unchanged.

**Current code:**

```ts
  const startNewChat = () => {
    ownSessionRef.current = null;

    stopAwaitingReply();

    setSessionId("");
    setRevealIndex(null);
    setMessages([]);
    restoreDraft(readDraft(""));
    setAttachedFile(null);
    setFileError("");
    setCurrentSessionTitle(NEW_CHAT_TITLE);
    setSidebarOpen(false);

    window.history.replaceState(null, "", `${BASE_PATH}/chat/new`);

    setTimeout(() => inputRef.current?.focus(), 100);
  };
```

**Replace with:**

```ts
  const startNewChat = () => {
    ownSessionRef.current = null;

    // A send still in flight belongs to the chat being left. Retiring its
    // token drops its reply on arrival, and the box is freed now rather than
    // when that reply comes back.
    sendTokenRef.current += 1;

    stopAwaitingReply();
    setIsSending(false);

    setSessionId("");
    setRevealIndex(null);
    setMessages([]);
    restoreDraft(readDraft(""));
    setAttachedFile(null);
    setFileError("");
    setCurrentSessionTitle(NEW_CHAT_TITLE);
    setSidebarOpen(false);

    window.history.replaceState(null, "", `${BASE_PATH}/chat/new`);

    setTimeout(() => inputRef.current?.focus(), 100);
  };
```

### 1c. Lines 438-579 (451-592 after 1a and 1b): `handleSend`

Four regions of the function change. Everything between them -- the early
return, the box reset, the `userMessage` construction, the `FormData`
assembly, the `apiFetch` call with its `response.ok` check and the parsing of
the reply -- is untouched.

#### 1c-i. Lines 443-453 (456-466 after 1a and 1b): take the token, guard the login check

From `setIsSending(true);` to the closing `}` of the login check, directly
above `const currentInput = input;`.

**Current code:**

```ts
    setIsSending(true);

    // The DICE login ends about once an hour. Nothing is cleared and no
    // session is created until it is known to be alive: if it has ended, the
    // provider takes over and sends the browser through the login page, and
    // the text -- already saved as a draft -- is back in the box afterwards.
    if (!(await loginStillAlive())) {
      setIsSending(false);

      return;
    }
```

**Replace with:**

```ts
    setIsSending(true);

    // This send's claim on the screen. Checked after every await below: a
    // different value means the user has moved on to another chat, and
    // nothing from this send may touch what is on screen any more.
    sendTokenRef.current += 1;
    const token = sendTokenRef.current;

    // The DICE login ends about once an hour. Nothing is cleared and no
    // session is created until it is known to be alive: if it has ended, the
    // provider takes over and sends the browser through the login page, and
    // the text -- already saved as a draft -- is back in the box afterwards.
    if (!(await loginStillAlive())) {
      if (sendTokenRef.current === token) setIsSending(false);

      return;
    }

    // New may have been clicked while the login was being checked. Nothing
    // has been cleared or sent at this point, and the text is still saved as
    // the draft of the chat it was typed in, so this send simply ends here.
    if (sendTokenRef.current !== token) return;
```

This sub-edit adds 11 lines.

#### 1c-ii. Lines 467-493 (491-517 after 1a, 1b and 1c-i): guard the adoption

From `let activeSessionId` to the closing `}` of the session-creation block.

**Current code:**

```ts
    let activeSessionId = sessionId || initialSessionId || "";
    let isNewSession = false;

    if (!activeSessionId) {
      try {
        activeSessionId = await SessionStorage.createSession(userId);

        isNewSession = true;

        ownSessionRef.current = activeSessionId;

        setSessionId(activeSessionId);

        window.history.replaceState(
          null,
          "",
          `${BASE_PATH}/chat/${activeSessionId}`,
        );
      } catch (error) {
        console.error("Error creating session:", error);

        setIsBackendError(true);
        setIsSending(false);

        return;
      }
    }
```

**Replace with:**

```ts
    let activeSessionId = sessionId || initialSessionId || "";
    let isNewSession = false;

    if (!activeSessionId) {
      try {
        activeSessionId = await SessionStorage.createSession(userId);

        isNewSession = true;

        // New may have been clicked while the session was being created.
        // The message still goes to the session below, so it is answered
        // and the chat is named and listed; it is just not adopted on
        // screen, which belongs to the new chat now.
        if (sendTokenRef.current === token) {
          ownSessionRef.current = activeSessionId;

          setSessionId(activeSessionId);

          window.history.replaceState(
            null,
            "",
            `${BASE_PATH}/chat/${activeSessionId}`,
          );
        }
      } catch (error) {
        console.error("Error creating session:", error);

        setIsBackendError(true);

        if (sendTokenRef.current === token) setIsSending(false);

        return;
      }
    }
```

This sub-edit adds 7 lines.

#### 1c-iii. Lines 503-509 (534-540 after 1a through 1c-ii): guard the question bubble

Directly after the `userMessage` object. Three awaits can sit above this
point (the login check, session creation, and the file read when an image is
attached), so the screen may already belong to another chat here.

**Current code:**

```ts
    const historyWithUserMessage = [...messages, userMessage];

    shouldPinRef.current = true;

    // Whatever was typing itself out before this send is finished with.
    setRevealIndex(null);
    setMessages(historyWithUserMessage);
```

**Replace with:**

```ts
    const historyWithUserMessage = [...messages, userMessage];

    // Shown only while this is still the chat on screen; see above.
    if (sendTokenRef.current === token) {
      shouldPinRef.current = true;

      // Whatever was typing itself out before this send is finished with.
      setRevealIndex(null);
      setMessages(historyWithUserMessage);
    }
```

This sub-edit adds 3 lines.

#### 1c-iv. Lines 552-579 (586-613 after 1a through 1c-iii): guard the reply, the error line and the unlock

From `const updatedMessages` to the end of the function. The title call for
a new chat stays **before** the check in both branches, so a chat the user
left still gets its name.

**Current code:**

```ts
      const updatedMessages = [...historyWithUserMessage, assistantMessage];

      // A new chat is named after its first exchange, and the reply waits for
      // that to settle. nameNewSession never throws, so a naming failure
      // cannot turn a good reply into the error line below.
      if (isNewSession) await nameNewSession(activeSessionId);

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

      if (isNewSession) await nameNewSession(activeSessionId);

      setMessages([...historyWithUserMessage, errorMessage]);
    } finally {
      setIsSending(false);

      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };
```

**Replace with:**

```ts
      const updatedMessages = [...historyWithUserMessage, assistantMessage];

      // A new chat is named after its first exchange, and the reply waits for
      // that to settle. nameNewSession never throws, so a naming failure
      // cannot turn a good reply into the error line below.
      if (isNewSession) await nameNewSession(activeSessionId);

      // The user may have left this chat while the reply was on its way. The
      // reply is in its own session on the backend and shows when that chat
      // is opened; it is not this screen's to show.
      if (sendTokenRef.current !== token) return;

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

      if (isNewSession) await nameNewSession(activeSessionId);

      if (sendTokenRef.current !== token) return;

      setMessages([...historyWithUserMessage, errorMessage]);
    } finally {
      // A send the user has left behind must not unlock, or refocus, the
      // chat that is on screen now; that one has its own send to answer to.
      if (sendTokenRef.current === token) {
        setIsSending(false);

        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };
```

This sub-edit adds 11 lines. A `return` inside `try` or `catch` still runs
the `finally`, which is what keeps the unlock in one place.

The whole document adds 45 lines to the file.

---

## 5. Design notes

- **Why a counter rather than comparing session ids.** A chat that has not
  been created yet has no id, so two new chats in a row would both compare as
  `""`. A counter that moves on every send and on every New is unambiguous,
  and it also covers "New, then send in the new chat": the old send's value
  is two behind and is dropped, the new send's value is current and lands.
- **Why the token is taken before the first await.** The first await is now
  the login check, and `createSession` after it is a network call too. Taking
  the token after either would leave what follows unguarded: the box would be
  cleared in the chat that is on screen now, and the adoption of the new id
  (`setSessionId`, `replaceState`) would silently turn that chat into
  session A.
- **Why a send ends after the login check when its token is retired.** At
  that point the send has done nothing: the box is not cleared, no session
  exists, nothing was posted. The text is safe, because every keystroke is
  saved as the draft of the chat it was typed in. Going on would mean clearing
  the box of a chat the text does not belong to. Ending is the only choice
  that loses nothing. For a new chat the draft is filed under "new", so
  `startNewChat` puts the same text straight back in the box.
- **Why the message is still sent when New was clicked during creation.**
  The user pressed Send; the text has already left the box. Dropping it would
  lose it and leave an empty session behind. Sending it gives the same
  outcome as the main case: the question is answered in its own chat, which
  is named and listed.
- **Why the title call runs before the check.** Naming belongs to the chat
  that was sent to, not to the screen. A chat the user walked away from
  would otherwise sit in the sidebar under its raw id.
- **Why `finally` is guarded.** Unguarded, a stale send arriving while the
  new chat has its own send in flight would clear `isSending`, removing
  "Thinking..." and enabling the button mid-request, and would steal focus.
- **Why the failed login check is guarded too.** For the same reason as
  `finally`: only the send that still owns the screen may unlock the box. In
  practice the provider takes the chat off the screen when the login has
  ended, so the guard only keeps the rule without exception.
- **What has to keep the rule in future.** Any code path that swaps the chat
  on screen without a remount must bump `sendTokenRef`. Today that is only
  `startNewChat`. If chats are ever switched in place (the deferred
  smoother-switch work), `loadSessionFromBackend` must bump it too, as its
  first statement.

---

## 6. Not part of this change

- **Aborting the request** with an `AbortController` on New. The backend run
  continues regardless, the title call would be skipped, and the `catch`
  would need to tell an abort from a failure. The token achieves the same
  on-screen result without any of that.
- **Forcing a remount on New.** Would also hide the bug, at the cost of
  tearing down the sidebar and composer on every New, and it would not
  survive the in-place switching that is planned later.
- **A "running" marker in the sidebar.** After this change a chat left
  mid-reply quietly finishes in the background. The list endpoint already
  reports `runState` per chat (see `update_waiting_mechanism.md`, step 2e),
  so a small spinner next to such a chat in Recents is a natural follow-up
  in `session-sidebar.tsx`.

---

## 7. How to verify

Type-check first; it must be clean:

```
npx tsc --noEmit -p tsconfig.json
```

Then confirm the token is read at every site:

```
grep -n "sendTokenRef" src/components/chat/chat-view.tsx
```

should print twelve lines: the declaration, the bump in `startNewChat`, and
in `handleSend` the bump, the `const token`, and eight checks (failed login
check, after the login check, adoption, creation failure, question bubble,
reply, error line, `finally`).

With the backend running and a login in place (locally: the stand-in from
`dev/mock-login-service.mjs`, see the Login section of `STRUCTURE.md`), in a
desktop-width window, using a question that takes several seconds to answer:

1. **The reported sequence.** From `/chat/new`, send. While "Thinking..." is
   up, click New. Expect: the greeting, an empty and usable box, the URL
   `/chat/new`. Type something; the send button enables. Wait past the time
   the reply would take: nothing appears in this chat. Within 5 s the first
   chat appears in Recents with a generated title. Click it: the question
   and the reply are there.
2. **Send in the new chat meanwhile.** Repeat 1, but send a second question
   in the new chat before the first reply is due. The second reply arrives
   and types out in the new chat; the first never shows there; the box is
   not unlocked early and "Thinking..." does not disappear before the second
   reply.
3. **Go back while it runs.** Repeat 1, but click the first chat in the
   sidebar before its reply is due. It opens with the question and
   "Thinking...", then the reply lands through the poll.
4. **From an existing chat.** Open a chat from the sidebar, send, click New
   while "Thinking..." is up. Same expectations as 1. This path remounts and
   never had the bug; it must still behave.
5. **Undisturbed sends.** A send from `/chat/new` and a send in an existing
   chat, left alone: question, "Thinking...", reply with the reveal, box
   unlocked and refocused, new chat named. Unchanged.
6. **Failure after New.** Stop the backend after the question is sent (or
   send something the agent rejects), then click New before the error comes
   back. The error line does not appear in the new chat, the box is usable,
   and the console shows the usual "Error sending message" entry.
7. **New during creation.** Throttle the network in dev tools so the session
   creation takes a second or two. From `/chat/new`, send, and click New at
   once. The URL must stay `/chat/new` and the new chat must not show the
   question. Once the reply has returned, the created chat appears in
   Recents with a title and holds the question and the reply.
8. **New during the login check.** Only reachable when the pass is being
   renewed, so start the stand-in with `MOCK_PASS_LIFETIME_SECONDS=50`: the
   page then asks `/auth/token` before every request. Throttle the network,
   type a question on `/chat/new`, send, and click New at once. Expect: no
   `POST .../sessions` and no `POST /api/chat` in the network panel, the URL
   stays `/chat/new`, and the question is still in the box. Send again
   without clicking New: it goes through as usual.
