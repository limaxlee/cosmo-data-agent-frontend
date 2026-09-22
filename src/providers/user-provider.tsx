"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface UserContextValue {
  userId: string | null;
  setUserId: (id: string) => void;
  clearUserId: () => void;
  // Pushes the idle logout back by IDLE_MS. Wired to user activity below, and
  // called by the chat view while a reply is pending, so waiting for the agent
  // does not count as being idle.
  keepAlive: () => void;
  isReady: boolean;
}

const STORAGE_KEY = "mock_user_id";

// The login ends after this long without activity. Activity is any pointer,
// keyboard, wheel, scroll or touch event, the tab becoming visible again, or a
// reply the chat is still waiting for.
const IDLE_MS = 30 * 60 * 1000;

// Activity events arrive many times a second; the expiry is rewritten at most
// this often.
const KEEP_ALIVE_THROTTLE_MS = 15 * 1000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
] as const;

interface StoredSession {
  id: string;
  expiresAt: number;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors of the stored session for the event listeners, which are
  // registered once and must not close over a stale render.
  const userIdRef = useRef<string | null>(null);
  const expiresAtRef = useRef<number | null>(null);
  const lastKeepAliveRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clearUserId = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    userIdRef.current = null;
    expiresAtRef.current = null;
    setUserIdState(null);
    clearTimer();
  }, [clearTimer]);

  const scheduleExpiry = useCallback(
    (expiresAt: number) => {
      clearTimer();
      expiresAtRef.current = expiresAt;
      const msLeft = expiresAt - Date.now();
      if (msLeft <= 0) {
        clearUserId();
        return;
      }
      timeoutRef.current = setTimeout(() => clearUserId(), msLeft);
    },
    [clearTimer, clearUserId],
  );

  // Store the session, arm its timer, and mirror it for the listeners. Every
  // write goes through here so the tabs sharing this storage see the same
  // expiry (see the storage listener below).
  const writeSession = useCallback(
    (id: string, expiresAt: number) => {
      const session: StoredSession = { id, expiresAt };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      userIdRef.current = id;
      setUserIdState(id);
      scheduleExpiry(expiresAt);
    },
    [scheduleExpiry],
  );

  const keepAlive = useCallback(() => {
    const id = userIdRef.current;
    const expiresAt = expiresAtRef.current;
    if (!id || expiresAt === null) return;

    // A background tab may have had its timer held back by the browser. If
    // the window has already passed, this is a logout, not an extension.
    const now = Date.now();
    if (now >= expiresAt) {
      clearUserId();
      return;
    }

    if (now - lastKeepAliveRef.current < KEEP_ALIVE_THROTTLE_MS) return;
    lastKeepAliveRef.current = now;

    writeSession(id, now + IDLE_MS);
  }, [clearUserId, writeSession]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: StoredSession = JSON.parse(raw);
        if (parsed.expiresAt > Date.now()) {
          userIdRef.current = parsed.id;
          setUserIdState(parsed.id);
          scheduleExpiry(parsed.expiresAt);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {}
    setIsReady(true);

    const onActivity = () => keepAlive();

    const onVisibility = () => {
      if (document.visibilityState === "visible") keepAlive();
    };

    // Another tab wrote (activity there) or removed (logout there) the
    // session. Follow it, so one active tab keeps every tab logged in and one
    // logout logs every tab out.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;

      if (!e.newValue) {
        userIdRef.current = null;
        expiresAtRef.current = null;
        setUserIdState(null);
        clearTimer();
        return;
      }

      try {
        const parsed: StoredSession = JSON.parse(e.newValue);
        userIdRef.current = parsed.id;
        setUserIdState(parsed.id);
        scheduleExpiry(parsed.expiresAt);
      } catch {}
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      clearTimer();
    };
  }, [scheduleExpiry, keepAlive, clearTimer]);

  const setUserId = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    lastKeepAliveRef.current = Date.now();
    writeSession(trimmed, Date.now() + IDLE_MS);
  };

  return (
    <UserContext.Provider
      value={{ userId, setUserId, clearUserId, keepAlive, isReady }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
