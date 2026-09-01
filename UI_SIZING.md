# UI Sizing Guide

Where to change the font sizes and widths of the `/chat/new` empty state and
the chat layout. All knobs are single Tailwind classes in
[`src/components/chat/chat-view.tsx`](src/components/chat/chat-view.tsx) —
edit the class, save, done. Line numbers are correct as of this commit; if
they drift, the **Find** column is the string to search for.

## The knobs

| What | Line | Find | Current |
| --- | --- | --- | --- |
| Greeting above the tiles (무엇을 도와드릴까요?) | 503 | `text-5xl font-normal text-heading-foreground` | `text-5xl` (48px) |
| Width of the tile list | 507 | `flex w-full max-w-2xl flex-col gap-2` | `max-w-2xl` (672px) |
| Tile title font (시작하기, …) | 517 | `flex-none text-lg font-medium` | `text-lg` (18px) |
| Tile question font (the sentence after the title) | 521 | `truncate text-left text-base text-muted-foreground` | `text-base` (16px) |
| Chat / message area width | 495 | `max-w-4xl mx-auto ${` | `max-w-4xl` (896px) |
| Textarea (composer) width | 594 | `max-w-4xl mx-auto` | `max-w-4xl` (896px) |

## Possible values

**Font sizes** (Tailwind scale):

| Class | Size |
| --- | --- |
| `text-sm` | 14px |
| `text-base` | 16px |
| `text-lg` | 18px |
| `text-xl` | 20px |
| `text-2xl` | 24px |
| `text-3xl` | 30px |
| `text-4xl` | 36px |
| `text-5xl` | 48px |
| `text-6xl` | 60px |

Anything in between: an arbitrary value like `text-[17px]`.

**Widths** (Tailwind `max-w-*` scale):

| Class | Width |
| --- | --- |
| `max-w-lg` | 512px |
| `max-w-xl` | 576px |
| `max-w-2xl` | 672px |
| `max-w-3xl` | 768px |
| `max-w-4xl` | 896px |
| `max-w-5xl` | 1024px |

Anything in between: `max-w-[720px]`.

## Rules of thumb

- **Message area and textarea must change together.** They are two separate
  `max-w-4xl` occurrences (lines 495 and 594) with the same value on purpose —
  if only one changes, the composer no longer lines up under the messages.
- **Keep the tile list narrower than or equal to the composer** (tile list ≤
  message-area width), otherwise the tiles poke out past the input box below
  them.
- **The tile question truncates, never wraps.** A wider tile list shows more
  of each question before the `…`; larger question text shows less. Balance
  the two against each other.
- **Different sizes per screen width** are one prefix away: e.g.
  `text-3xl sm:text-5xl` renders the greeting at 30px on phones and 48px from
  640px up. The same `sm:` / `md:` / `lg:` prefixes work on every class above.
- Prefer moving **one step at a time** on the Tailwind scale — each step is a
  deliberate, visually distinct increment.
