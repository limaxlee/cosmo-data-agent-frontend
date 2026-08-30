"use client";

import { useEffect, useState } from "react";
import { countWords, nextWordEnd } from "@/lib/markdown-stream";

// Releases a finished reply one word at a time.
//
// The reply is already in hand -- this changes nothing about how it is
// fetched. It only spends the frames after it lands, so the text reads as
// arriving instead of appearing all at once.

// Baseline pace. Fast enough that a short answer is not withheld, slow enough
// that the words still read as landing one after another.
const WORDS_PER_SECOND = 20;

// A long answer speeds up rather than making the reader wait: past this, the
// pace stretches to fit instead of the reveal stretching past it.
const MAX_DURATION_MS = 5000;

/**
 * Returns the part of `text` revealed so far. With `enabled` false it returns
 * `text` whole and starts no timer -- which is what every message loaded from
 * a session does, so opening an old chat never replays its answers.
 */
export function useWordReveal(text: string, enabled: boolean): string {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    // Someone who has asked for less motion gets the whole reply at once.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const rate = Math.max(
      WORDS_PER_SECOND,
      countWords(text) / (MAX_DURATION_MS / 1000),
    );

    let cursor = 0;

    // Seeded with one word, not zero. The spinner unmounts in the same commit
    // that mounts this message, so an empty budget would leave a blank where
    // "Thinking..." just was until the pace released the first word.
    let budget = 1;

    let previous = performance.now();
    let frame = 0;

    const step = (now: number) => {
      if (reduced) {
        setRevealed(text.length);

        return;
      }

      budget += ((now - previous) / 1000) * rate;
      previous = now;

      while (budget >= 1 && cursor < text.length) {
        budget -= 1;
        cursor = nextWordEnd(text, cursor);
      }

      // Same value on a frame that released nothing -- React bails out, so
      // this costs a comparison rather than a render.
      setRevealed(cursor);

      if (cursor < text.length) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [text, enabled]);

  if (!enabled || revealed >= text.length) return text;

  return text.slice(0, revealed);
}
