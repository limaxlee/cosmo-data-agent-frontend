# Bugfix: last table row missing when a reply ends with a table

**Date:** 2026-09-02
**Files changed for this fix:** `src/components/chat/message-item.tsx` (one block)

## Symptom

When the assistant's reply **ends with a Markdown table**, the last row of the
table is never rendered. If there is any sentence *after* the table, all rows
show up correctly.

## Root cause

The reply is revealed with a typewriter effect (`useWordReveal`). While the
text is only partially revealed, `guardPartialMarkdown()`
(`src/lib/markdown-stream.ts`, lines 42–44) intentionally **drops the last
line if it starts with `|`**, because a half-typed table row would render as a
broken one-cell row:

```ts
// src/lib/markdown-stream.ts:42-44  (correct — do NOT change this file)
if (lines.length > 0 && /^\s*\|/.test(lines[lines.length - 1])) {
  lines.pop();
}
```

The bug was in **where the guard was applied**. In `message-item.tsx` it ran
whenever `isRevealing` was true — and `isRevealing` stays true *after* the
animation finishes (ChatView keeps `revealIndex` set until the next send or
session switch). So on a fully revealed reply that ends with a table row, the
guard kept deleting the final row on every render, permanently.

With a sentence after the table, the last line doesn't start with `|`, so the
guard removed nothing — which is exactly why that case worked.

## The fix (swap this block)

**File:** `src/components/chat/message-item.tsx`
**Location:** inside the `MessageItem` component, right after
`const isRevealing = reveal && !isUser;` — lines **189–193** in the original
file, lines **189–199** after the fix.

### Before (original code — find this)

```tsx
  const revealed = useWordReveal(formatContent(message.content), isRevealing);

  // A prefix of Markdown is not itself Markdown, so the tail gets closed off
  // before the renderer sees it. See markdown-stream.ts.
  const markdown = isRevealing ? guardPartialMarkdown(revealed) : revealed;
```

### After (replace with this)

```tsx
  const content = formatContent(message.content);
  const revealed = useWordReveal(content, isRevealing);

  // A prefix of Markdown is not itself Markdown, so the tail gets closed off
  // before the renderer sees it. See markdown-stream.ts. Only while the text
  // is actually partial: the guard drops a trailing table row, which must come
  // back once the reveal has run its course.
  const markdown =
    isRevealing && revealed.length < content.length
      ? guardPartialMarkdown(revealed)
      : revealed;
```

### Why this works

`useWordReveal` returns the **full** string once its cursor reaches the end of
the text (and also in the reduced-motion path), so
`revealed.length < content.length` becomes false exactly when the animation
completes. From that point the guard is out of the render path and the
untouched Markdown renders — last table row included. During the animation
nothing changes: partial text still goes through `guardPartialMarkdown`, so a
half-typed row is still held back until it's complete.

No other file needs to change for this bug. `markdown-stream.ts`,
`use-word-reveal.ts`, and `chat-view.tsx` stay as they are.

### How to verify

1. Send a prompt whose answer ends with a table and nothing after it.
2. Let the typewriter animation finish.
3. The final row must be visible, and must stay visible on re-renders
   (e.g. after typing in the input box).

Verified here with a frame-by-frame simulation against the real
`guardPartialMarkdown`/`nextWordEnd`: old code drops the last row in the final
frame; new code's final frame is byte-identical to the full reply, and no
intermediate frame leaks a half-typed row.

---

## Appendix: unrelated repairs made in the same session

These are **not part of the table bug**. They restore JSX event-handler
attribute names that were stripped by a file transfer (a sanitizer removed
everything matching `on*=`, leaving the arrow-function bodies dangling). A
machine whose files were never corrupted already has all of these — skip this
section there. Line numbers are as of the fixed files.

### `src/components/chat/chat-view.tsx`

| Line | Restored attribute |
|---|---|
| 450 | `onSessionSelect={async (session) => ...}` on `<SessionSidebar>` |
| 462 | `onClick={() => setSidebarOpen(false)}` on the mobile overlay div |
| 512 | `onClick={() => { applyInput(sq.question); focusInputEnd(); }}` on suggested-question `<Card>` |
| 601 | `onChange={handleFileSelect}` on the hidden file `<input>` |
| 605–607 | `onDragOver={handleDragOver}`, `onDragLeave={handleDragLeave}`, `onDrop={handleDrop}` on the composer div |
| 616 | `onChange={(e) => { applyInput(e.target.value); fitToText(e.target); }}` on the `<textarea>` |
| 645 | `onClick={removeFile}` on the remove-file button |
| 656 | `onClick={() => fileInputRef.current?.click()}` on the attach `<Button>` |
| 676 | `onClick={handleSend}` on the send `<Button>` |

### `src/components/chat/session-sidebar.tsx`

| Line | Restored attribute |
|---|---|
| 306 | `onClick={handleNewSession}` on the wordmark `<button>` |
| 320 | `onClick={() => toggleCollapsed()}` on the collapse-toggle `<Button>` |
| 340 | `onClick={handleNewSession}` on the New `<Button>` |
| 356 | `onChange={(e) => setSearchQuery(e.target.value)}` on the search `<Input>` |
| 366 | `onClick={() => setIsSearchActive(true)}` on the search `<Button>` |
| 388 | `onClick={handleNewSession}` on the collapsed Plus `<Button>` |
| 438 | `onClick={() => { if (!isRenaming) handleSessionClick(session); }}` on the session row div |
| 449 | `onChange={(e) => setRenameValue(e.target.value)}` on the rename `<input>` |
| 475 | `onOpenChange={(open) => setOpenMenuId(open ? session.id : null)}` on `<DropdownMenu>` |
| 488 | `onClick={(e) => e.stopPropagation()}` on the menu-trigger `<Button>` |
| 496 | `onCloseAutoFocus={(event) => { ... }}` on `<DropdownMenuContent>` (rename focus guard) |
| 503 | `onClick={(e) => handleCopy(e, session)}` on the Copy item |
| 510 | `onClick={(e) => startRename(e, session)}` on the Rename item |
| 517 | `onClick={(e) => handleDeleteSession(e, session.id)}` on the Delete item |
| 579 | `onClick={handleLogout}` on the Log out item |
| 606 | `onOpenChange={setIsMobileOpen}` on the mobile `<Sheet>` |

### `src/components/chat/message-item.tsx`

| Line | Restored attribute |
|---|---|
| 323 | `onError={() => setImgError(true)}` on the attachment `<img>` |
| 358 | `onClick={handleCopy}` on the copy `<Button>` |
| 381 | `onClick={onRegenerate}` on the regenerate `<Button>` |
