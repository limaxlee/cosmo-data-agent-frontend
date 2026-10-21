# Fix: idle logout fires while a reply is pending

## The bug

The login expires after 30 minutes without activity. "Activity" is tracked in
`src/providers/user-provider.tsx`: pointer, keyboard, wheel, scroll and touch
events, plus the tab becoming visible again, each call `keepAlive()`, which
pushes the expiry back to 30 minutes from now.

Waiting for the agent is not one of those events. A user who sends a question
and then sits still (or switches to another window) while the agent works is
logged out after 30 minutes, even though the reply is still on its way. When
the reply lands there is nobody logged in to show it to, and the user is sent
back to the login screen.

The chat view used to cover this case by calling `keepAlive()` on an interval
for as long as a reply was pending. That effect was removed from
`src/components/chat/chat-view.tsx`, so the gap is back.

## The fix

Restore the three pieces in `src/components/chat/chat-view.tsx`. Nothing in
`user-provider.tsx` needs to change; `keepAlive` is already exported from the
context and already handles throttling and the "expiry already passed" case.

### 1. Add the interval constant

Place it with the other timing constants near the top of the file, directly
after `REPLY_WAIT_LIMIT_MS`:

```ts
// age past which a session is opened as finished rather than waited on.
const REPLY_WAIT_LIMIT_MS = 10 * 60 * 1000;

// While a reply is pending the user is waiting, not idle. The login is kept
// alive at this interval until the reply lands.
const PENDING_REPLY_KEEP_ALIVE_MS = 60 * 1000;
```

One minute is well under the 30 minute idle window and well over the 15 second
throttle inside `keepAlive`, so each tick actually writes a new expiry.

### 2. Take `keepAlive` from the user context

Inside `ChatView`, change

```ts
const { userId } = useUser();
```

to

```ts
const { userId, keepAlive } = useUser();
```

### 3. Add the effect

Place it directly after the reply-polling effect (the one whose dependency
list is `[awaitingSessionId, userId]`) and before the `if (!userId) return
null;` guard:

```ts
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [awaitingSessionId, userId]);

  // A pending reply counts as activity for the idle logout.
  useEffect(() => {
    if (!isSending) return;
    keepAlive();
    const timer = setInterval(keepAlive, PENDING_REPLY_KEEP_ALIVE_MS);
    return () => clearInterval(timer);
  }, [isSending, keepAlive]);

  if (!userId) return null;
```

The effect must sit above the `return null` guard. React requires every hook
to run on every render, so a hook placed below an early return breaks the
rules of hooks and will fail lint.

## How it works

- When `isSending` flips to `true`, the effect calls `keepAlive()` once right
  away, then every 60 seconds.
- When the reply arrives (or fails) and `isSending` flips back to `false`, the
  cleanup clears the interval. From then on only real user activity extends
  the login.
- `keepAlive` is stable (`useCallback` in the provider), so the effect does
  not re-run on unrelated renders.

## Shortcut

The committed version of the file already contains all three pieces, and the
rest of the file matches it. Restoring it is equivalent to the edits above:

```
git checkout HEAD -- src/components/chat/chat-view.tsx
```

## How to verify

1. Temporarily lower `IDLE_MS` in `user-provider.tsx` to something short, for
   example 20 seconds, and `PENDING_REPLY_KEEP_ALIVE_MS` to 5 seconds.
2. Log in, send a question that takes longer than 20 seconds to answer, and do
   not touch the mouse or keyboard.
3. Without the fix the login screen appears before the reply. With the fix the
   reply is shown and the login survives.
4. Restore both constants.
