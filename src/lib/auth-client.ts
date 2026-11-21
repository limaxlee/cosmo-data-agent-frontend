import { BASE_PATH } from "./base-path";

/**
 * Everything the browser knows about the DICE login service and the pass.
 *
 * The login service is not part of this app. It answers under /auth/... at the
 * top of the site and owns an HttpOnly cookie this page can never read. What
 * the page gets from it is a short-lived signed pass, which it sends as
 * `Authorization: Bearer <pass>` with every request to this app's own server
 * (/backend/... and /api/chat). The server passes it on and the backend checks
 * it. Nothing here decodes the pass or decides anything from its contents.
 *
 * Not to be confused with <base path>/backend/auth/me, which is the backend.
 */

// The login service. At the top of the site, never under BASE_PATH.
const AUTH = "/auth";

// A pass with less than this left is renewed before it is used.
const RENEW_MARGIN_SECONDS = 60;

// Set, per tab, once this tab has been sent to the login page. It is what
// stops a login that keeps failing from redirecting for ever: with the mark
// set, the gate shows a "Log in" button instead of redirecting again.
const LOGIN_TRIED_KEY = "login_redirect_tried";

// The pass lives in memory only -- never in storage, a cookie or a log line.
let pass: string | null = null;
let expiresAt = 0; // unix seconds
let renewing: Promise<string> | null = null; // one /auth/token request at a time
let forgotten = 0; // counts forgetPass() calls, see getPass()

/** The login service said there is no login (any more). */
export class LoginEndedError extends Error {
  constructor() {
    super("The DICE login has ended");
    this.name = "LoginEndedError";
  }
}

// --- What the provider is told ---------------------------------------------

export type LoginEvent = "login-ended" | "account-inactive" | "user-mismatch";

const listeners = new Set<(event: LoginEvent) => void>();

/** Subscribes to what apiFetch() notices. Returns the unsubscribe function. */
export function onLoginEvent(listener: (event: LoginEvent) => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function report(event: LoginEvent) {
  listeners.forEach((listener) => listener(event));
}

// --- The login service -----------------------------------------------------

/** GET /auth/session. Throws when the login service cannot be asked. */
export async function isLoggedIn(): Promise<boolean> {
  const res = await fetch(`${AUTH}/session`, {
    credentials: "include",
    cache: "no-store",
  });

  if (res.status !== 200) {
    throw new Error(`Login service answered ${res.status}`);
  }

  const body: { authenticated?: unknown } | null = await res.json();

  return body?.authenticated === true;
}

async function requestPass(): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(`${AUTH}/token`, {
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) throw new LoginEndedError();

  if (!res.ok) throw new Error(`Login service answered ${res.status}`);

  const body: { accessToken?: unknown; expiresAt?: unknown } | null =
    await res.json();

  if (typeof body?.accessToken !== "string" || !body.accessToken) {
    throw new Error("Login service sent no pass");
  }

  return {
    accessToken: body.accessToken,
    expiresAt: Number(body.expiresAt) || 0,
  };
}

/**
 * Hands out the pass, asking the login service first when it has less than a
 * minute left (or when `force` is set, after the backend refused it).
 *
 * It asks at most once and uses whatever comes back: close to expiry the
 * login service keeps returning the same pass, so asking until it looks fresh
 * would never end. Callers at the same moment share one request.
 *
 * Throws LoginEndedError when the login service answers 401.
 */
export function getPass(force = false): Promise<string> {
  const fresh =
    pass !== null && expiresAt > Date.now() / 1000 + RENEW_MARGIN_SECONDS;

  if (fresh && !force) return Promise.resolve(pass as string);

  if (!renewing) {
    const startedAt = forgotten;

    const request = requestPass()
      .then((token) => {
        // A pass that arrives after forgetPass() -- a logout, say -- is given
        // to the request that was waiting for it, but not kept.
        if (forgotten === startedAt) {
          pass = token.accessToken;
          expiresAt = token.expiresAt;
        }

        return token.accessToken;
      })
      .finally(() => {
        if (renewing === request) renewing = null;
      });

    renewing = request;
  }

  return renewing;
}

/** Drops the pass from memory: on logout, and when the login has ended. */
export function forgetPass() {
  pass = null;
  expiresAt = 0;
  forgotten += 1;
}

/**
 * For a caller about to do something it cannot take back (clearing the message
 * box, creating a session): false when the login has ended, in which case the
 * provider has been told and takes over. A login service that cannot be asked
 * at all counts as alive here; the request that follows shows the error.
 */
export async function loginStillAlive(): Promise<boolean> {
  try {
    await getPass();

    return true;
  } catch (error) {
    if (!(error instanceof LoginEndedError)) return true;

    report("login-ended");

    return false;
  }
}

// --- Requests to this app's own server -------------------------------------

function isRead(init: RequestInit): boolean {
  return ["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());
}

/**
 * fetch() for this app's own server, without telling the provider anything.
 * `path` is "/backend/..." or "/api/chat"; the base path and the pass are
 * added, and nothing else about the request is touched (no Content-Type is
 * set, so a FormData body keeps its own).
 *
 * On a 401 a new pass is fetched. A read (GET, HEAD) is then sent once more;
 * a write is not sent twice -- its 401 goes back to the caller and the next
 * request uses the new pass.
 */
export async function fetchWithPass(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = async (force: boolean) => {
    const headers = new Headers(init.headers);

    headers.set("Authorization", `Bearer ${await getPass(force)}`);

    return fetch(BASE_PATH + path, { ...init, headers });
  };

  let res = await send(false);

  if (res.status === 401) {
    if (isRead(init)) {
      res = await send(true);
    } else {
      try {
        await getPass(true);
      } catch (error) {
        if (error instanceof LoginEndedError) throw error;
        // The login service could not be asked. The caller still gets its 401.
      }
    }
  }

  return res;
}

/**
 * The one way the app calls its own server. Same as fetchWithPass(), and also
 * tells the provider when the answer means the login state has changed:
 *
 * - the login has ended (/auth/token answered 401, or a read was refused with
 *   401 even with a new pass),
 * - 403 `account_inactive`: an admin took the approval away,
 * - 403 `user_mismatch`: a different person is now logged in to DICE.
 *
 * The response still goes back to the caller, which handles it as it always
 * did. A LoginEndedError is thrown on after being reported.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    const res = await fetchWithPass(path, init);

    if (res.status === 401 && isRead(init)) report("login-ended");

    if (res.status === 403) {
      // An error body is not always JSON: this app's own routes can answer in
      // plain text.
      const code: unknown = await res
        .clone()
        .json()
        .then(
          (body) => body?.code,
          () => undefined,
        );

      if (code === "account_inactive") report("account-inactive");
      if (code === "user_mismatch") report("user-mismatch");
    }

    return res;
  } catch (error) {
    if (error instanceof LoginEndedError) report("login-ended");

    throw error;
  }
}

// --- Login and logout addresses --------------------------------------------

/**
 * The login page, set to come back to the address the person is on now. A
 * page to navigate to, not to fetch. The address must be on this origin.
 */
export function loginUrl(): string {
  return `${AUTH}/login?callbackUrl=${encodeURIComponent(window.location.href)}`;
}

/**
 * Logs the person out of all of DICE and of Samsung SSO, and lands on a DICE
 * page. A navigation as well, used exactly like this, without parameters.
 */
export const LOGOUT_URL = `${AUTH}/logout`;

/** Whether this tab was already sent to the login page. */
export function loginWasTried(): boolean {
  try {
    return sessionStorage.getItem(LOGIN_TRIED_KEY) !== null;
  } catch {
    // Storage blocked: the mark cannot be kept, so never redirect by itself.
    return true;
  }
}

/** Sets the mark. False when it could not be stored. */
export function markLoginTried(): boolean {
  try {
    sessionStorage.setItem(LOGIN_TRIED_KEY, "1");

    return true;
  } catch {
    return false;
  }
}

export function clearLoginTried() {
  try {
    sessionStorage.removeItem(LOGIN_TRIED_KEY);
  } catch {
    // Storage blocked: there was no mark to remove.
  }
}
