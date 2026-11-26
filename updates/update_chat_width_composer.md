# Update: wider chat column, refined composer, Korean placeholder

**Date:** 2026-11-26
**Branch / base:** `develop-261123`: commit `ef49304 admin page`. On 2026-11-26
`src/` in the working tree is identical to that commit.
**Status:** not applied. Nothing in `src/` has been changed; this file is the
instruction set.

The only file touched is `src/components/chat/chat-view.tsx`, 874 lines long
in the working tree described above. Every edit is the value of a `className`,
a code comment, or one string literal. No statement, hook, handler, prop,
condition or element is added, removed or moved.

Within the file, edits are listed top to bottom. Steps 1a, 1b and 1d replace
one line with one line. Step 1c adds 3 lines and step 1e adds 7, so the
numbers below them shift; the shifted numbers are given at each step. The
"current code" block under every step is copied verbatim from the file and is
the reliable anchor; search for it rather than trusting the number once you
have started editing.

No other document in this folder edits these lines. One quotes them:
`update_session_open_blank.md` shows `max-w-4xl` inside its step 1d. Its edits
are already in the working tree (`isSessionLoading` and `showEmptyState` are
both there), so there is nothing left of it to apply; if it is ever applied to
an older tree after this change, read `max-w-5xl` where it prints `max-w-4xl`.

**Where the look comes from.** It was chosen on the design canvas "Chat width
and composer options", https://claude.ai/artifact/Rcg2wWK8Bmb9NzL9SrQr1X :
"Width A", "Look 1 · Refined tonal" and "Send A · Slate". The canvas is a
mock-up; this document is what produces the same result in the real code.

**Checked before writing, without applying.** On 2026-11-26 the new class
strings were run through the project's own `cva` and `tailwind-merge`,
compiled from `src/app/globals.css` with the project's Tailwind (4.1.11), and
rendered in headless Chrome in both themes, on a test page outside the repo.
The colours and sizes of the composer quoted in section 2 were measured
there. The hover colour and the window-width table are worked out from the
rules, not measured. The change has not been run inside the app itself;
section 7 is the list for that.

---

## 1. Why

Three things, asked for together.

**The message column is narrow on a wide window.** Messages and the composer
both sit in a column capped at 896px (`max-w-4xl`). On a 1920px window with
the sidebar open that leaves about 350px of empty page on either side, and
the agent's tables are squeezed. The cap moves one step up Tailwind's scale to
1024px (`max-w-5xl`). The composer moves with it, so the right edge of a
question bubble still meets the right edge of the composer, and the left edge
of the composer still lines up with the left edge of the column.

**The send button does not say when it is ready.** It is a ghost icon, the
same weight as the paperclip next to it, and the only difference between
"ready to send" and "nothing to send" is 50% opacity. After this change it is
a filled circle while there is something to send and a greyed-out circle while
there is not. The box around it gets a thin outline and slightly rounder
corners, and focusing it darkens the outline instead of putting a drop shadow
under a grey box.

**The placeholder is the last English sentence a user reads before typing.**
The greeting and the suggested questions are Korean. The placeholder becomes
"메시지를 입력하세요".

The colours are all ones the chat already has. The filled send button was
first drawn in the text colour (near-black in light, near-white in dark) and
that was rejected as too strong in both themes; it now takes the grey of the
secondary text in light and the slate of the account avatar in dark.

---

## 2. Behavior after the change

### What looks different

**Column width.** The cap is 1024px instead of 896px, for the messages and
for the composer. The column is as wide as the pane allows, less the 16px
gutter on each side, up to the cap. So:

| Window width | Sidebar open (288px) | Sidebar collapsed (56px) |
|---|---|---|
| up to 984px | no change | no change |
| 985 to 1216px | no change | wider than before |
| 1217 to 1343px | fills the pane, where it used to stop at 896px | 1024px |
| 1344px and up | 1024px | 1024px |

Below 768px the sidebar is hidden and the pane is the window, which is under
every one of these limits: the mobile layout does not change.

What follows from the wider column, with no edit of its own:

- A question bubble may grow to 819px (80% of the column) before it wraps. It
  was 717px.
- Reply text and tables run 128px wider, so replies have fewer lines and the
  same chat is shorter on screen. Tables are `w-full` and take the room.
- A wide attached image may show up to 102px wider. Its height limit
  (`max-h-80`) is unchanged.
- The greeting and the suggested-question tiles do not move sideways: the
  tiles keep their own 672px cap (`max-w-2xl`) and stay centred.

**The composer box.**

| | Before | After |
|---|---|---|
| Corners | 16px (`rounded-2xl`) | 20px |
| Outline | none | 1px, `--tile-border`, the outline of the suggested-question tiles |
| Padding | 8px | 10px |
| Fill | `--input` in light, zinc-800 in dark | the same |
| Height, two empty rows | 110px | 116px |
| Focused | drop shadow (`shadow-md`) | outline darkens; a 1px hairline shadow (`shadow-xs`) |
| File dragged over it | 2px ring | the same ring, drawn outside the outline |

Measured outline colours: `rgb(214, 218, 224)` in light and
`rgb(64, 64, 69)` in dark; focused, `--muted-foreground` at 50% in light and
zinc-500 in dark.

The box is 6px taller (2px of outline, 4px of padding), so the whole input
area is 172px instead of 166px and the message pane above it is 6px shorter.
The greeting on a new chat is centred in that pane and therefore sits 3px
higher.

The text in the box starts 19px in from the edge of the column. It was 16px.
The typing area is the column less 22px (1002px at the full width); it was
the column less 16px. Its height is still 52px for two rows.

**The send button.** Same place, same 36px circle, same icon.

| State | Light | Dark |
|---|---|---|
| Something to send | fill `--muted-foreground` `rgb(92, 100, 112)`, icon `--background` `rgb(246, 247, 249)` | fill `--input` `rgb(65, 85, 113)`, icon `--foreground` `rgb(249, 250, 251)` |
| The same, hovered | the fill at 90% | the fill at 90% |
| Nothing to send, or sending | fill `--accent` `rgb(208, 215, 225)`, icon `--muted-foreground` at 70% | fill `--accent` `rgb(56, 67, 81)`, icon `--muted-foreground` at 70% |

Before the change it had no fill in any state: a grey icon, an `--accent`
circle with a darker icon on hover, and the whole button at 50% opacity when
it could not be pressed.

The icon is moved 1px down and 1px to the left. The paper plane's weight sits
up and to the right of its square, which did not show on a bare icon and does
show inside a circle.

**The placeholder** reads "메시지를 입력하세요". While a file is dragged over
the box it still reads "Drop your image here...".

### What does not change

Everything the composer and the page do. Listed, because this is the part
that must hold exactly:

- When the send button can be pressed: `isSending || (!input.trim() &&
  !attachedFile)` is untouched, and so is `handleSend`.
- Enter sends, Shift+Enter starts a new line.
- The box grows with the text up to 15 rows (360px), then scrolls. `fitToText`
  reads the textarea's own `scrollHeight`, and the textarea's classes are not
  touched.
- Drafts: saved on every keystroke, restored on load and when another chat is
  opened, with the caret at the end.
- Focus: back in the box after a send, after closing the mobile sidebar, and
  on New.
- The paperclip, its tooltip, the file picker, the attached-file chip and its
  remove button, drag and drop, the file-type error line.
- The line under the box ("Press Enter to send..." and "Sending...").
- The textarea being disabled while a reply is on its way.
- Keyboard focus on the send button: the ring comes from the `Button`
  component's own classes, which stay.
- The sidebar, the header, the message bubbles, the reveal animation, the
  pinning of the last question, and how a chat loads.

### Why none of it can change

The edits are `className` values, comments and one string. React compares the
element tree it rendered last time with the new one; here the tree is the
same, element for element, with different class attributes on five of them
(the two columns, the box, the send button and its icon) and a different
`placeholder` on one. No element gains or loses a parent, a
key or a type, so nothing is unmounted or mounted, no effect re-runs, and no
state is reset.

That is the difference from the blink fixed by `update_sidebar_flicker.md`.
The blink came from a component being mounted again and starting from an
empty list. A changed class cannot mount anything. `SessionSidebar` is not
edited and receives the same props.

The second way a style change can make a page jump is by changing a size in
response to an event. The one event-driven style here is focus on the box,
and it changes a colour and a shadow only: the outline is 1px wide whether
the box is focused or not, so focusing it moves nothing. The transition is
limited to `box-shadow` and `border-color` for the same reason.

The code that scrolls the pane does not know the height of the composer.
`useFollowReveal` and the two `scrollIntoView` effects measure the pane when
they run, so a pane that is 6px shorter is followed exactly as before.

---

## 3. Summary of edits

| Step | File | Current lines | Change |
|---|---|---|---|
| 1a | `src/components/chat/chat-view.tsx` | 660 | message column: `max-w-4xl` becomes `max-w-5xl` |
| 1b | `src/components/chat/chat-view.tsx` | 761 | composer column: the same |
| 1c | `src/components/chat/chat-view.tsx` | 771-778 | composer box: classes, and a comment above it |
| 1d | `src/components/chat/chat-view.tsx` | 792 | placeholder text |
| 1e | `src/components/chat/chat-view.tsx` | 841-849 | send button: comment, classes, icon nudge |

No import changes. No new file. `src/app/globals.css` is not touched: every
colour is a token that already exists there, or a step of the zinc scale the
composer already uses in dark (`dark:bg-zinc-800`, `dark:ring-zinc-500`).
`src/components/ui/button.tsx` is not touched either.

Steps 1a and 1b do not move any line. After 1c, which adds 3 lines, step 1d
is at line 795 and step 1e at lines 844-852. Step 1d does not move any line.
Step 1e adds 7 lines. The file ends at 884 lines.

---

## 4. Step 1: `src/components/chat/chat-view.tsx`

### 1a. Line 660: the message column

**Current code (lines 659-663, for context):**

```tsx
          <div
            className={`max-w-4xl mx-auto ${
              showEmptyState ? "h-full" : "space-y-2"
            }`}
          >
```

**Replace line 660 only:**

```tsx
            className={`max-w-4xl mx-auto ${
```

**with:**

```tsx
            className={`max-w-5xl mx-auto ${
```

### 1b. Line 761: the composer column

It has to be the same class as in 1a. If the two ever differ, the composer
and the messages stop sharing their edges.

**Current code (lines 759-761, for context):**

```tsx
        {/* Input area */}
        <div className="bg-background p-4">
          <div className="max-w-4xl mx-auto">
```

**Replace line 761 only:**

```tsx
          <div className="max-w-4xl mx-auto">
```

**with:**

```tsx
          <div className="max-w-5xl mx-auto">
```

### 1c. Lines 771-778: the composer box

A comment goes in above the `<div>`, and line 775 is replaced. The three
drag handlers, the `isDragging` line and the closing lines stay exactly as
they are. Line 770, the empty line above the `<div>`, stays too.

**Current code:**

```tsx
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-2xl bg-input dark:bg-zinc-800 p-2 transition-shadow focus-within:shadow-md ${
                isDragging ? "ring-2 ring-ring/40 dark:ring-zinc-500" : ""
              }`}
            >
```

**Replace with:**

```tsx
            {/* The composer box. Its outline is the one the suggested-question
                tiles have, and it is 1px wide in every state: focusing the box
                changes the colour of the line, never the size of the box. */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-[20px] border border-tile-border bg-input dark:bg-zinc-800 p-2.5 transition-[box-shadow,border-color] focus-within:border-muted-foreground/50 dark:focus-within:border-zinc-500 focus-within:shadow-xs ${
                isDragging ? "ring-2 ring-ring/40 dark:ring-zinc-500" : ""
              }`}
            >
```

Class by class, old to new:

| Old | New | What it does |
|---|---|---|
| `rounded-2xl` | `rounded-[20px]` | corners, 16px to 20px |
| | `border border-tile-border` | the 1px outline, in both themes |
| `bg-input dark:bg-zinc-800` | `bg-input dark:bg-zinc-800` | fill, unchanged |
| `p-2` | `p-2.5` | padding, 8px to 10px |
| `transition-shadow` | `transition-[box-shadow,border-color]` | the outline colour eases in with the shadow, 150ms as before |
| `focus-within:shadow-md` | `focus-within:shadow-xs` | hairline shadow on focus |
| | `focus-within:border-muted-foreground/50 dark:focus-within:border-zinc-500` | darker outline on focus |

Keep the space before `${`. Without it the last class and the ring classes
run together into one word while a file is dragged over the box.

### 1d. Line 792 (795 after 1c): the placeholder

**Current code (lines 789-793, for context):**

```tsx
                placeholder={
                  isDragging
                    ? "Drop your image here..."
                    : "Type your message..."
                }
```

**Replace line 792 only:**

```tsx
                    : "Type your message..."
```

**with:**

```tsx
                    : "메시지를 입력하세요"
```

The file is UTF-8 and already holds Korean (the greeting on line 669), so
nothing about its encoding changes. Nothing in the repo looks the old text up:
it appears on this line only.

### 1e. Lines 841-849 (844-852 after 1c): the send button

Three things in one block: the comment grows, the `className` line is
replaced, and the icon gets a comment and two classes. `onClick`, `disabled`,
`variant` and `size` are not touched, and neither are the two lines that
follow the icon (the empty line and the `sr-only` label).

**Current code:**

```tsx
                {/* Right: send button */}
                <Button
                  onClick={handleSend}
                  disabled={isSending || (!input.trim() && !attachedFile)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
```

**Replace with:**

```tsx
                {/* Right: send button. Filled while there is something to
                    send: the secondary-text grey in light, the avatar's slate
                    in dark. With nothing to send it is greyed out rather than
                    faded, which is what disabled:opacity-100 is for. The hover
                    classes are needed, not decoration: without them the ghost
                    variant swaps the fill and darkens the icon on hover. */}
                <Button
                  onClick={handleSend}
                  disabled={isSending || (!input.trim() && !attachedFile)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full bg-muted-foreground text-background hover:bg-muted-foreground/90 hover:text-background dark:bg-input dark:text-foreground dark:hover:bg-input/90 dark:hover:text-foreground disabled:bg-accent disabled:text-muted-foreground/70 disabled:opacity-100 disabled:cursor-not-allowed transition-colors"
                >
                  {/* One pixel down and to the left: the plane's weight sits
                      up and to the right of its box, which shows in a circle. */}
                  <Send className="w-4 h-4 -translate-x-px translate-y-px" />
```

Class by class, old to new:

| Old | New | What it does |
|---|---|---|
| `h-9 w-9 rounded-full` | `h-9 w-9 rounded-full` | size and shape, unchanged |
| `text-muted-foreground` | `bg-muted-foreground text-background` | light: grey fill, light icon |
| | `dark:bg-input dark:text-foreground` | dark: slate fill, light icon |
| `hover:text-foreground` | `hover:bg-muted-foreground/90 hover:text-background` | light: keeps fill and icon on hover |
| | `dark:hover:bg-input/90 dark:hover:text-foreground` | dark: the same |
| `disabled:opacity-50` | `disabled:bg-accent disabled:text-muted-foreground/70 disabled:opacity-100` | greyed-out circle when it cannot be pressed |
| `disabled:cursor-not-allowed transition-colors` | `disabled:cursor-not-allowed transition-colors` | unchanged |

The attach button a few lines above (line 827) has the same old class string.
Leave it alone: the paperclip stays a ghost icon.

---

## 5. Design notes

- **Why `max-w-5xl` and not a pixel value.** It is the next step of the scale
  the column was already on, 56rem to 64rem. One step makes lines about 15%
  longer; two steps (`max-w-6xl`, 1152px) make them about 30% longer, which
  helps tables and hurts prose.
- **Why the composer is widened too.** Leaving it at 896px under a 1024px
  column was one of the options looked at and was turned down: the bubble's
  right edge would no longer meet the composer's.
- **Why the outline is `--tile-border`.** It is the one outline colour the
  chat pane already has, on the suggested-question tiles, and it has a value
  for each theme. In dark that value is all but identical to zinc-700.
- **Why focus is a colour and not a size.** See section 2: a border that
  appeared on focus would make the box 2px taller and push the pane. The
  outline is always there; only its colour moves.
- **Why the dark focus colour is `zinc-500` and not a token.** The composer's
  dark surface is already written in the zinc scale, and the drag ring on the
  same element is `dark:ring-zinc-500`. The focus outline uses the same step,
  so in dark the box has one "active" colour.
- **Why the disabled send button sets `disabled:opacity-100`.** `Button` adds
  `disabled:opacity-50` to every button. `tailwind-merge` lets the later class
  win, so the 50% rule is dropped from the element altogether. Without the
  override the grey circle would be faded on top of being grey.
- **Why there are four hover classes.** The `ghost` variant brings
  `hover:bg-accent hover:text-accent-foreground`. Left in, hovering a ready
  send button would replace its fill with the hover grey and, in light, turn
  the icon dark. `hover:bg-muted-foreground/90` and `hover:text-background`
  replace those two; the `dark:` pair is needed because a `hover:` rule
  outweighs a plain `dark:` rule, so in dark the light hover colours would
  otherwise win. The 90% is the convention of the default `Button`
  (`hover:bg-primary/90`).
- **Why `disabled:` needs no `dark:` twin.** `--accent` and
  `--muted-foreground` have a value per theme, and a `disabled:` rule
  outweighs the plain `dark:bg-input` and `dark:text-foreground` rules. One
  class covers both themes.
- **The class list the browser ends up with.** After `cva` and
  `tailwind-merge`, the send button's `class` attribute ends in
  `size-9 h-9 w-9 rounded-full bg-muted-foreground text-background
  hover:bg-muted-foreground/90 hover:text-background dark:bg-input
  dark:text-foreground dark:hover:bg-input/90 dark:hover:text-foreground
  disabled:bg-accent disabled:text-muted-foreground/70 disabled:opacity-100
  disabled:cursor-not-allowed transition-colors`. It must not contain
  `hover:bg-accent`, `hover:text-accent-foreground` or `disabled:opacity-50`.
- **Why the comments.** The file explains its non-obvious classes where they
  are used. Both long class strings have a reason for nearly every word, and
  the next person to "tidy" them would break a hover or a focus state.
- **Why the textarea is not touched.** Its padding is what puts the text 19px
  from the column edge instead of 16px. Bringing it back to 16px means
  changing `px-2` on the textarea, and the textarea is the one element whose
  measurements the auto-grow depends on. It is listed in section 6 instead.

---

## 6. Not part of this change

- **The other English strings.** "Drop your image here...", "Press Enter to
  send, Shift+Enter for new line", "Sending...", "Thinking...", the "Add
  file" tooltip and the file-type error stay as they are. Only the resting
  placeholder was asked for.
- **Lining the typed text up with the reply text.** Replies start 16px in
  from the column edge; typed text now starts 19px in. Changing the
  textarea's `px-2` to `px-[5px]` would close the gap. Left out on purpose,
  see the last note in section 5.
- **The paperclip button and the attached-file chip.** Unchanged.
- **The user bubble.** It keeps the composer's fill (`--input`) and has no
  outline. The comment on `--input` in `globals.css`, "Raised surface: shared
  by the composer and the user message bubble", is still true.
- **The comment on `--tile-border` in `globals.css`.** It names only the
  suggested-question tiles. It could mention the composer as well; that is a
  comment-only edit in four places and was left out to keep this change to
  one file.
- **A width that follows the window.** A column of 80% of the pane, between
  896px and 1280px, was one of the options looked at and was not chosen.
- **The admin area.** It has its own shell and does not use `ChatView`.

---

## 7. How to verify

Type-check first; it must be clean:

```
npx tsc --noEmit -p tsconfig.json
```

Then confirm the edits are the ones listed and nothing else:

```
git diff --stat -- src
```

should name one file, `src/components/chat/chat-view.tsx`, with 17 insertions
and 7 deletions.

```
grep -n "max-w-4xl" src/components/chat/chat-view.tsx
```

should print nothing, and

```
grep -n "max-w-5xl" src/components/chat/chat-view.tsx
```

should print two lines, 660 and 761.

```
git diff -U0 -- src/components/chat/chat-view.tsx | grep "^[-+]"
```

Every line it prints, apart from the two file headers, must be a `className`
line, a comment line, the `<Send ... />` line or the placeholder. If anything
else shows, something was changed that this document does not ask for.

With the backend running and a login in place (locally: the stand-in from
`dev/mock-login-service.mjs`, see the Login section of `STRUCTURE.md`), in a
window at least 1344px wide:

1. **Width.** Open a chat with a table in a reply. The column is 1024px wide
   (the element with `max-w-5xl`, in the browser's inspector). The right edge
   of a long question bubble and the right edge of the composer are on the
   same vertical line, and so are the left edge of the composer and the left
   edge of the column.
2. **Narrower windows.** Drag the window down to about 1250px with the
   sidebar open: the column fills the pane with a 16px gutter on each side.
   Down to 900px: the same as before the change. No horizontal scrollbar at
   any width.
3. **Send button, light theme.** Empty box: a pale grey circle with a grey
   icon, and it cannot be clicked. Type one character: the circle turns
   mid-grey with a light icon. Delete the character: back to pale. Type
   spaces only: it stays pale. Hover the ready button: it lightens slightly
   and keeps a light icon.
4. **Send button, dark theme.** The same four checks: a dim slate circle with
   a grey icon when empty, a clearer blue-grey circle with a near-white icon
   when ready.
5. **Focus.** Click into the box and out again several times while watching
   the line under it ("Press Enter to send..."). The outline darkens and
   lightens; the line must not move, not even by a pixel. In the inspector
   the box is 116px high in both states.
6. **Typing.** Enter sends. Shift+Enter adds a line. Paste twenty lines: the
   box grows to 360px and then scrolls inside. Send: the box returns to two
   rows, the question is pinned to the top of the pane, "Thinking..." shows,
   and the caret is back in the box when the reply has landed.
7. **Sending.** While "Thinking..." shows, the box is disabled, the send
   button is the pale circle, and the line under the box reads "Sending...".
8. **A file.** Click the paperclip and pick an image: the chip replaces the
   paperclip and the send button is ready with no text. Remove the chip: the
   send button goes pale. Drag an image over the box: a ring appears outside
   the outline and the placeholder reads "Drop your image here...". Drop it:
   the chip appears. Drag a `.pdf` over and drop it: the red error line
   shows under the box.
9. **Placeholder.** An empty box reads "메시지를 입력하세요" in both themes.
10. **The sidebar.** Click through several chats in Recents, including fast
    clicks. The list must not blink or show "No conversations yet", and the
    pane must not flash the greeting; both are as they were before this
    change. Collapse and expand the sidebar: the column re-centres, nothing
    else moves.
11. **Drafts.** Type half a sentence, open another chat, come back: the text
    is in the box with the caret at the end and the send button is ready.
    Reload the page: the same.
12. **New chat.** Click New. The greeting and the four tiles are centred
    above the composer. Click a tile: its question lands in the box and the
    send button turns ready.
13. **The class list.** Select the send button in the inspector and compare
    its `class` attribute with the list in section 5. It must not contain
    `hover:bg-accent` or `disabled:opacity-50`.
14. **Mobile width.** Narrow the window below 768px. The sidebar becomes the
    sheet behind the button at the top left, the composer fills the width,
    and sending works as in step 6.
