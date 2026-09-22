"use client";

import { useEffect, useState } from "react";
import { countWords, nextWordEnd } from "@/lib/markdown-stream";

const WORDS_PER_SECOND = 20;

const MAX_DURATION_MS = 5000;

export function useWordReveal(text: string, enabled: boolean): string {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const rate = Math.max(
      WORDS_PER_SECOND,
      countWords(text) / (MAX_DURATION_MS / 1000),
    );

    let cursor = 0;

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

      setRevealed(cursor);

      if (cursor < text.length) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [text, enabled]);

  if (!enabled || revealed >= text.length) return text;

  return text.slice(0, revealed);
}
