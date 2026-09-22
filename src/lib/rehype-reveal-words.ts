import type { Element, ElementContent, Root, RootContent } from "hast";

// A rehype plugin that splits the rendered reply into one <span> per word, so
// each word can fade in as it is revealed. It runs inside react-markdown's own
// pipeline, which means React builds those spans itself -- nothing here reaches
// into the DOM behind React's back.
//
// The timing is carried entirely by a NEGATIVE animation-delay: the newest word
// starts at 0, the one before it starts 60ms in, and anything older than
// SETTLED_MS starts past the end of its own animation and therefore paints at
// its final state. That is what makes the effect survive a re-render -- the
// whole message is re-rendered on every new word, and a word that has already
// faded in must never fade in again.

// Gap between one word starting and the next.
const STAGGER_MS = 60;

// Past this age a word is done; clamping keeps the delay from growing without
// bound on a long reply.
const SETTLED_MS = 600;

// Block-level code keeps its own whitespace and line breaks. Wrapping words in
// there would wreck the layout, so it is left alone.
const OPAQUE = new Set(["pre"]);

// Elements that fade as a single unit rather than word by word.
const ATOMIC = new Set(["code", "img", "kbd"]);

type Content = RootContent | ElementContent;

export function rehypeRevealWords() {
  return (tree: Root) => {
    const words: Element[] = [];

    split(tree, words);

    const newest = words.length - 1;

    words.forEach((word, index) => {
      const age = Math.min((newest - index) * STAGGER_MS, SETTLED_MS);

      word.properties.style = `animation-delay:-${age}ms`;
    });
  };
}

function split(parent: Root | Element, words: Element[]): void {
  const next: Content[] = [];

  for (const child of parent.children as Content[]) {
    if (child.type === "text") {
      // split() with a capturing group keeps the whitespace, so the gaps
      // between words stay plain text and wrapping behaves as it always did.
      for (const piece of child.value.split(/(\s+)/)) {
        if (!piece) continue;

        if (!piece.trim()) {
          next.push({ type: "text", value: piece });

          continue;
        }

        next.push(word(words, { type: "text", value: piece }));
      }

      continue;
    }

    if (child.type === "element") {
      if (OPAQUE.has(child.tagName)) {
        next.push(child);

        continue;
      }

      if (ATOMIC.has(child.tagName)) {
        next.push(word(words, child));

        continue;
      }

      split(child, words);
    }

    next.push(child);
  }

  if (parent.type === "root") parent.children = next as RootContent[];
  else parent.children = next as ElementContent[];
}

function word(words: Element[], child: ElementContent): Element {
  const span: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["reveal-word"] },
    children: [child],
  };

  words.push(span);

  return span;
}
