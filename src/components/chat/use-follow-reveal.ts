"use client";

import { RefObject, useEffect } from "react";

// Keeps the tail of a reply that is typing itself out inside the message pane.
//
// It only ever scrolls DOWN, and only by the amount the reply has actually run
// past the bottom edge -- a reply that fits on screen never moves the view at
// all. Scrolling up hands control back to the reader; scrolling back to the
// bottom takes it again.

// Gap left under the last line, so the text is not flush against the composer.
const STICK_PADDING = 24;

// Scrolling back to within this much of the bottom counts as caught up.
const RESUME_SLACK = 48;

export function useFollowReveal(
  scrollAreaRef: RefObject<HTMLDivElement | null>,
  messageRef: RefObject<HTMLDivElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;

    // Someone who asked for less motion gets the whole reply in one paint, so
    // there is nothing to follow -- and yanking the view to the end of it would
    // be exactly the jump they turned off.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // The Radix viewport is the element that actually scrolls; the ref points
    // at the Root above it.
    const viewport =
      scrollAreaRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ??
      scrollAreaRef.current?.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );

    const message = messageRef.current;

    if (!viewport || !message) return;

    let following = true;
    let lastTop = viewport.scrollTop;

    // How far the bottom of the reply sits past the bottom of the pane. Zero or
    // less means the whole reply is still on screen.
    const overflow = () =>
      message.getBoundingClientRect().bottom -
      (viewport.getBoundingClientRect().bottom - STICK_PADDING);

    const onScroll = () => {
      const top = viewport.scrollTop;

      // Nothing here scrolls up, so a decrease can only be the reader.
      if (top < lastTop - 1) following = false;
      else if (!following && overflow() <= RESUME_SLACK) following = true;

      lastTop = top;
    };

    // Fires on every word the reveal adds, because each one changes the height
    // of the message box.
    const observer = new ResizeObserver(() => {
      if (!following) return;

      const past = overflow();

      if (past <= 0) return;

      viewport.scrollTop += past;

      // Bank the position we just set, so the scroll event it raises is not
      // mistaken for the reader moving.
      lastTop = viewport.scrollTop;
    });

    viewport.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(message);

    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [scrollAreaRef, messageRef, active]);
}
