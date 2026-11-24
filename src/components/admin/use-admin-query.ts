"use client";

import { useEffect, useState } from "react";

import { useAdmin } from "./admin-context";

// The last answer that arrived, and the question it belongs to.
interface Answer<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export interface AdminQuery<T> {
  // The answer on screen. While a newer question is on its way this is still
  // the previous answer, so a list keeps its rows instead of blinking.
  data: T | undefined;
  // Set when the newest question failed.
  error: unknown;
  loading: boolean;
}

/**
 * Asks the backend whenever `params` change or the admin area is refreshed.
 * Pass `null` to ask nothing.
 *
 * Answers can arrive in another order than the questions were sent: typing
 * "kim" sends three. Only the answer to the newest question is kept; one that
 * arrives late is dropped.
 *
 * `load` has to be a function that stays the same between renders -- one from
 * admin-api.ts -- and `params` plain data.
 */
export function useAdminQuery<P, T>(
  load: (params: P) => Promise<T>,
  params: P | null,
): AdminQuery<T> {
  const { version } = useAdmin();
  const [answer, setAnswer] = useState<Answer<T> | null>(null);

  const question = params === null ? null : JSON.stringify(params);
  const key = question === null ? null : `${version}:${question}`;

  useEffect(() => {
    if (key === null || question === null) return;

    let outdated = false;

    load(JSON.parse(question) as P).then(
      (data) => {
        if (!outdated) setAnswer({ key, data });
      },
      (error: unknown) => {
        if (!outdated) setAnswer({ key, error });
      },
    );

    return () => {
      outdated = true;
    };
  }, [load, key, question]);

  const answered = answer !== null && answer.key === key;

  return {
    data: key === null ? undefined : answer?.data,
    error: answered ? answer.error : undefined,
    loading: key !== null && !answered,
  };
}
