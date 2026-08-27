"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

interface UserContextValue {
  userId: string | null;
  setUserId: (id: string) => void;
  clearUserId: () => void;
  isReady: boolean;
}

const STORAGE_KEY = "mock_user_id";
const SESSION_MS = 60 * 60 * 1000;

interface StoredSession {
  id: string;
  expiresAt: number;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUserId = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUserIdState(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const scheduleExpiry = (expiresAt: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const msLeft = expiresAt - Date.now();
    if (msLeft <= 0) {
      clearUserId();
      return;
    }
    timeoutRef.current = setTimeout(() => clearUserId(), msLeft);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: StoredSession = JSON.parse(raw);
        if (parsed.expiresAt > Date.now()) {
          setUserIdState(parsed.id);
          scheduleExpiry(parsed.expiresAt);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {}
    setIsReady(true);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const setUserId = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    const expiresAt = Date.now() + SESSION_MS;
    const session: StoredSession = { id: trimmed, expiresAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUserIdState(trimmed);
    scheduleExpiry(expiresAt);
  };

  return (
    <UserContext.Provider value={{ userId, setUserId, clearUserId, isReady }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
