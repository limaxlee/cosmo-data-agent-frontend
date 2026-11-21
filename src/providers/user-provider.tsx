"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  LOGOUT_URL,
  LoginEndedError,
  clearLoginTried,
  fetchWithPass,
  forgetPass,
  isLoggedIn,
  loginUrl,
  loginWasTried,
  markLoginTried,
  onLoginEvent,
} from "@/lib/auth-client";
import { clearDrafts } from "@/lib/draft-storage";

/**
 * Where the person stands with the DICE single sign-on. UserGate renders one
 * screen per status, and the app itself only in "ready".
 */
export type LoginStatus =
  | "loading" // the check is running
  | "redirecting" // the browser is on its way to the login page
  | "signed-out" // not logged in, and a redirect was already tried in this tab
  | "pending" // logged in, not approved by an admin (yet)
  | "ready" // logged in and approved
  | "error"; // the login service or the backend could not be asked

/** The backend's answer to GET /auth/me. */
export interface CurrentUser {
  // The login ID in lower case: the {user_id} of every backend address.
  user_id: string;
  // "May use the data agent". Already true for admins.
  is_active: boolean;
  is_admin: boolean;
  email: string | null;
  full_name: string | null;
  department: string | null;
  company: string | null;
  created_at: string;
}

interface LoginState {
  status: LoginStatus;
  user: CurrentUser | null;
}

interface UserContextValue {
  status: LoginStatus;
  user: CurrentUser | null;
  // The ID the chat uses in backend addresses. Null until /auth/me answered.
  userId: string | null;
  // Nothing is built on this yet; it is here for a later admin page.
  isAdmin: boolean;
  // Runs the start sequence again: "Check again" and "Try again".
  checkAgain: () => void;
  logout: () => void;
}

// Where the stand-in login this replaced kept the typed knox ID.
const LEGACY_LOGIN_KEY = "mock_user_id";

// localStorage. The last person who used the app in this browser -- an ID,
// not a credential. A different one means the saved drafts are not theirs.
const LAST_USER_KEY = "last_user_id";

// sessionStorage. Set to the ID the page was running as when it reloaded
// because the backend answered `user_mismatch`. See the listener below.
const MISMATCH_RELOAD_KEY = "user_mismatch_reload";

const LOADING: LoginState = { status: "loading", user: null };
const FAILED: LoginState = { status: "error", user: null };

// Not logged in. The first time in a tab the browser is sent to the login
// page, which comes back to the same address. If that did not lead to a login,
// the mark is still set on the way back, and the person gets a button instead
// of a second redirect.
function notLoggedIn(): LoginState {
  forgetPass();

  if (loginWasTried() || !markLoginTried()) {
    return { status: "signed-out", user: null };
  }

  window.location.replace(loginUrl());

  return { status: "redirecting", user: null };
}

function rememberPerson(userId: string) {
  try {
    if (localStorage.getItem(LAST_USER_KEY) === userId) return;

    clearDrafts();
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Storage blocked: there are no drafts either.
  }
}

// The reload after a `user_mismatch` is over once it has brought in a
// different person. If the person is the same as before the reload, the mark
// stays, so that a second mismatch ends on the error screen, not in a reload
// loop.
function settleMismatchReload(userId: string) {
  try {
    const reloadedAs = sessionStorage.getItem(MISMATCH_RELOAD_KEY);

    if (reloadedAs !== null && reloadedAs !== userId) {
      sessionStorage.removeItem(MISMATCH_RELOAD_KEY);
    }
  } catch {
    // Storage blocked: there was no mark.
  }
}

// The start sequence: is there a DICE login, get a pass, ask the backend who
// this is and whether they are approved.
async function runStart(): Promise<LoginState> {
  try {
    localStorage.removeItem(LEGACY_LOGIN_KEY);
  } catch {
    // Storage blocked: nothing was kept there.
  }

  let loggedIn: boolean;

  try {
    loggedIn = await isLoggedIn();
  } catch {
    // No redirect when the login service cannot be asked.
    return FAILED;
  }

  if (!loggedIn) return notLoggedIn();

  // This is the backend's /auth/me, reached through this app's server -- not
  // the login service. The backend records each call as one visit, so it is
  // made once per start and never on a timer.
  let res: Response;

  try {
    res = await fetchWithPass("/backend/auth/me", {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    return error instanceof LoginEndedError ? notLoggedIn() : FAILED;
  }

  // Refused even with a new pass.
  if (res.status === 401) return notLoggedIn();

  if (!res.ok) return FAILED;

  let user: CurrentUser;

  try {
    user = await res.json();
  } catch {
    return FAILED;
  }

  if (typeof user?.user_id !== "string" || !user.user_id) return FAILED;

  // The login works. Removing the mark is what lets the next time the login
  // ends -- about once an hour -- redirect by itself again.
  clearLoginTried();
  settleMismatchReload(user.user_id);
  rememberPerson(user.user_id);

  return { status: user.is_active === true ? "ready" : "pending", user };
}

// One sequence at a time, shared by everyone who asks while it runs. React
// runs effects twice in development; two copies would race on the mark and
// call /auth/me twice.
let starting: Promise<LoginState> | null = null;

function start(): Promise<LoginState> {
  if (!starting) {
    const run = runStart()
      // Nothing above is expected to throw. If something does, the person
      // gets "Try again" rather than a spinner that never ends.
      .catch(() => FAILED)
      .finally(() => {
        if (starting === run) starting = null;
      });

    starting = run;
  }

  return starting;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  // "loading" on the server and in the browser alike, so the two render the
  // same thing; the login service is asked only after that.
  const [state, setState] = useState<LoginState>(LOADING);

  // The same state for the listener below, which has to know the status as it
  // is this instant, not as of the last render.
  const stateRef = useRef<LoginState>(LOADING);

  const apply = useCallback((next: LoginState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    start().then((next) => {
      if (!cancelled) apply(next);
    });

    return () => {
      cancelled = true;
    };
  }, [apply]);

  const checkAgain = useCallback(() => {
    apply(LOADING);
    start().then(apply);
  }, [apply]);

  // What apiFetch() notices while the app is running. Several requests can
  // fail at the same moment (the sidebar and the chat both poll), and the
  // reaction must happen once: each one below leaves "ready" straight away,
  // and anything that arrives outside "ready" is ignored.
  useEffect(
    () =>
      onLoginEvent((event) => {
        const { status, user } = stateRef.current;

        if (status !== "ready") return;

        if (event === "login-ended") {
          // The start sequence finds no login and, because the mark was
          // removed on the last success, goes to the login page by itself.
          forgetPass();
          checkAgain();

          return;
        }

        if (event === "account-inactive") {
          // An admin took the approval away while the app was open.
          apply({ status: "pending", user });

          return;
        }

        // user-mismatch: a different person is now logged in to DICE in this
        // browser. One reload brings their data in. If the mark is already
        // set, the reload did not help, and reloading again would loop.
        let reload = false;

        try {
          if (sessionStorage.getItem(MISMATCH_RELOAD_KEY) === null) {
            sessionStorage.setItem(MISMATCH_RELOAD_KEY, user?.user_id ?? "");
            reload = true;
          }
        } catch {
          // Storage blocked: the mark cannot be kept, so do not reload.
        }

        if (!reload) {
          apply(FAILED);

          return;
        }

        apply(LOADING);
        window.location.reload();
      }),
    [apply, checkAgain],
  );

  const logout = useCallback(() => {
    // The mark stops the app from logging straight back in if the person
    // returns to it in this tab. The pass is dropped and the app is taken off
    // the screen before leaving, so a page the browser later restores from
    // its history holds no pass and shows the "Log in" button.
    markLoginTried();
    forgetPass();
    apply({ status: "signed-out", user: null });

    window.location.assign(LOGOUT_URL);
  }, [apply]);

  return (
    <UserContext.Provider
      value={{
        status: state.status,
        user: state.user,
        userId: state.user?.user_id ?? null,
        isAdmin: state.user?.is_admin === true,
        checkAgain,
        logout,
      }}
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
