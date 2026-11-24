"use client";

import { createContext, useContext } from "react";

export interface AdminContextValue {
  // Part of the key of every request. A new number asks the backend for
  // everything on screen again.
  version: number;
  // After a change, and behind every "Refresh" button. Nothing reloads by
  // itself.
  refresh: () => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);

  if (!ctx) throw new Error("useAdmin must be used within the admin area");

  return ctx;
}
