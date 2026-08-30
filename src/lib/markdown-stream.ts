// Helpers for showing a Markdown string that is still being revealed a word at
// a time.
//
// The reply arrives complete -- nothing here changes how the backend is called.
// Only the slice on screen grows. The catch is that a slice of Markdown is not
// itself Markdown: cut mid-way through a table or a bold run and the renderer
// shows raw punctuation, or swallows the rest of the answer into a code block.
// guardPartialMarkdown() patches the tail so every frame renders as the author
// meant it to, and nothing has to restyle itself once the closer arrives.

const FENCE = /^ {0,3}```/;

/**
 * Index just past the next word, counting from `from`.
 *
 * Leading whitespace is taken with the word rather than before it, so a step
 * never parks on a trailing space -- and a blank line lands in the same frame
 * as the heading or list item that follows it, instead of one frame early.
 */
export function nextWordEnd(text: string, from: number): number {
  let i = from;

  while (i < text.length && /\s/.test(text[i])) i++;
  while (i < text.length && !/\s/.test(text[i])) i++;

  return i;
}

export function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

/**
 * Makes a partially revealed Markdown string safe to render on its own.
 */
export function guardPartialMarkdown(text: string): string {
  const lines = text.split("\n");

  // A table row only means anything once its line is finished. Rendered
  // half-written it becomes a row with one stray cell, which then jumps as the
  // rest of the row lands.
  if (lines.length > 0 && /^\s*\|/.test(lines[lines.length - 1])) {
    lines.pop();
  }

  let out = lines.join("\n");

  // An opening fence with no closing one swallows the whole rest of the answer
  // into a code block. Close it here; the real closer replaces this one later.
  if (count(out, FENCE_GLOBAL) % 2 === 1) {
    return `${out}\n\`\`\``;
  }

  // Emphasis and inline code whose closing marker has not been revealed yet
  // would otherwise show as literal punctuation. Close them rather than drop
  // the opener, so the words do not restyle themselves a moment later.
  out = balance(out, "**");
  out = balance(out, "`");

  return out;
}

const FENCE_GLOBAL = /^ {0,3}```/gm;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Markers inside a fenced code block are literal text, so they must not be
 * counted when deciding whether an emphasis run is still open.
 */
function withoutFencedCode(text: string): string {
  let inside = false;

  return text
    .split("\n")
    .filter((line) => {
      if (FENCE.test(line)) {
        inside = !inside;

        return false;
      }

      return !inside;
    })
    .join("\n");
}

function balance(text: string, marker: string): string {
  const open = withoutFencedCode(text).split(marker).length - 1;

  if (open % 2 === 0) return text;

  // A marker sitting at the very end has nothing to wrap yet. Closing it would
  // render as literal punctuation, so drop it until its word arrives.
  if (text.trimEnd().endsWith(marker)) {
    const at = text.lastIndexOf(marker);

    return text.slice(0, at) + text.slice(at + marker.length);
  }

  return text + marker;
}
