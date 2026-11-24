"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The state of a view lives in its address: the filters and the page number.
 * A reload keeps the view, the hourly login round trip comes back to it, and
 * one view can link to another with a filter already set.
 *
 * The component that calls this has to sit inside <Suspense>, because of
 * useSearchParams(). `next dev` works without it; `next build` does not.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback(
    (name: string) => searchParams.get(name) ?? "",
    [searchParams],
  );

  /**
   * Changes parameters; an empty value removes one. Anything that changes a
   * filter also passes `page: ""`, which is what returns to the first page.
   *
   * "replace" is for typing, so that every pause in a search text does not
   * become a step of the Back button.
   */
  const set = useCallback(
    (changes: Record<string, string>, how: "push" | "replace" = "push") => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [name, value] of Object.entries(changes)) {
        if (value) next.set(name, value);
        else next.delete(name);
      }

      const query = next.toString();
      // Without the base path: the router adds it.
      const address = query ? `${pathname}?${query}` : pathname;

      if (how === "replace") router.replace(address, { scroll: false });
      else router.push(address, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // 1, 2, 3, ... Anything else in the address counts as the first page.
  const page = Math.max(1, Math.floor(Number(get("page"))) || 1);

  return { get, set, page };
}
