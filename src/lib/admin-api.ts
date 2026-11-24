import { apiFetch } from "./auth-client";

/**
 * Every call the admin area makes, and the shapes of the replies.
 *
 * All of them go to this app's own server as /backend/admin/..., which passes
 * them on to the backend's /admin/.... Not to be confused with /admin/...
 * without "/backend": those are the pages of this app.
 *
 * The backend is what protects this data. It looks the caller up in its list
 * of admins on every request and answers 403 `admin_required` to anyone else,
 * also to a person whose admin right was taken away a moment ago.
 */

// Rows in one page of a list.
export const PAGE_SIZE = 50;

// The most the backend hands out in one request for accounts.
const MAX_USERS_PER_REQUEST = 200;

export type UserStatus = "waiting" | "active" | "deactivated";

/** One entry of GET /admin/users. */
export interface AdminUser {
  // The login ID, in lower case.
  user_id: string;
  is_active: boolean;
  is_admin: boolean;
  // About the approval only. An admin who was never approved is "waiting"
  // and still has full access.
  status: UserStatus;
  email: string | null;
  department: string | null;
  company: string | null;
  // Technical values from the company login. Shown in a details view only.
  unique_name: string | null;
  sid: string | null;
  roles: string[] | null;
  // The person's first visit.
  created_at: string;
  // When and by whom the account was last approved. They stay filled after a
  // deactivation.
  activated_at: string | null;
  activated_by: string | null;
  last_access_at: string | null;
  last_access_ip: string | null;
}

/** One entry of GET /admin/access-log: a person opened the app. */
export interface AccessLogEntry {
  user_id: string;
  accessed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/** One entry of GET /admin/sessions. The list only: never the messages. */
export interface AdminSession {
  user_id: string;
  session_id: string;
  // Null for a chat that has no title yet.
  session_title: string | null;
  created_at: string;
  last_update_time: string;
  // "running" while the agent is answering in that chat, otherwise "idle".
  run_state: string | null;
}

/** One entry of GET /admin/admins. */
export interface AdminEntry {
  user_id: string;
  added_at: string | null;
  // The admin who added this one. "bootstrap" means by hand, in the database.
  added_by: string | null;
}

/** One page of a list, and how many rows match the filters in total. */
export interface Page<T> {
  rows: T[];
  total: number;
}

/**
 * A request that did not succeed. `status` is 0 when no answer arrived at
 * all. `code` is the backend's own word for the refusal, when it sent one.
 */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`Admin request failed: ${status}${code ? ` ${code}` : ""}`);
    this.name = "AdminApiError";
  }
}

// --- "You are not an admin (any more)" --------------------------------------

const revokedListeners = new Set<() => void>();

/**
 * Subscribes to the backend answering 403 `admin_required`. The value of
 * `isAdmin` in the page is from the page load, so this is how the admin area
 * learns that the right was taken away while it was open. Returns the
 * unsubscribe function.
 */
export function onAdminRevoked(listener: () => void) {
  revokedListeners.add(listener);

  return () => {
    revokedListeners.delete(listener);
  };
}

// --- The request -------------------------------------------------------------

// `path` is "/users?..." and so on. apiFetch() adds the base path and the
// pass. After a 401 it sends a read again by itself, and deliberately does not
// send a change twice: that 401 comes back here and becomes an error.
async function call<T>(path: string, method = "GET"): Promise<T> {
  let res: Response;

  try {
    res = await apiFetch(`/backend/admin${path}`, {
      method,
      headers: { Accept: "application/json" },
    });
  } catch {
    // No answer at all, or the login has ended (the provider was told).
    throw new AdminApiError(0);
  }

  if (res.ok) {
    try {
      // DELETE answers 200 with the body `null`. That is success.
      return (await res.json()) as T;
    } catch {
      throw new AdminApiError(res.status);
    }
  }

  // An error body is not always JSON (this app's own server answers in plain
  // text), and `detail` is a list on a 422. Only `code` is read.
  const body: { code?: unknown } | null = await res.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : undefined;

  if (res.status === 403 && code === "admin_required") {
    revokedListeners.forEach((listener) => listener());
  }

  throw new AdminApiError(res.status, code);
}

// --- Days --------------------------------------------------------------------

// The admin picks days, and a day means that day in the admin's own time
// zone. Without a zone in the text, JavaScript reads it in that zone.
function dayStart(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const date = new Date(`${day}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whether a text is a day the filters can use: "2026-11-23". */
export function isDay(day: string): boolean {
  return dayStart(day) !== null;
}

// "From 1 November to 23 November" means both days in full. `..._from`
// includes its moment and `..._to` excludes it, so the end is the start of the
// day after the last day. toISOString() ends in "Z", which also keeps a "+"
// out of the address.
function addDayRange(
  params: URLSearchParams,
  field: string,
  from?: string,
  to?: string,
) {
  const first = from ? dayStart(from) : null;
  const last = to ? dayStart(to) : null;

  if (first) params.set(`${field}_from`, first.toISOString());

  if (last) {
    last.setDate(last.getDate() + 1);
    params.set(`${field}_to`, last.toISOString());
  }
}

function pageParams(page = 1, limit = PAGE_SIZE): URLSearchParams {
  return new URLSearchParams({
    limit: String(limit),
    offset: String((Math.max(1, page) - 1) * limit),
  });
}

// Empty filters are left out of the request.
function addText(params: URLSearchParams, name: string, value?: string) {
  const trimmed = value?.trim();

  if (trimmed) params.set(name, trimmed);
}

function toPage<T>(rows: T[] | undefined, total: unknown): Page<T> {
  const list = Array.isArray(rows) ? rows : [];

  return { rows: list, total: typeof total === "number" ? total : list.length };
}

// --- The lists ---------------------------------------------------------------

export interface UserFilters {
  // Found anywhere in the login ID, email, department or company.
  search?: string;
  status?: UserStatus;
  isAdmin?: boolean;
  page?: number;
  limit?: number;
}

export async function listUsers(filters: UserFilters): Promise<Page<AdminUser>> {
  const params = pageParams(filters.page, filters.limit);

  addText(params, "search", filters.search);
  if (filters.status) params.set("status", filters.status);

  if (filters.isAdmin !== undefined) {
    params.set("is_admin", String(filters.isAdmin));
  }

  const reply = await call<{ users?: AdminUser[]; total?: number }>(
    `/users?${params}`,
  );

  return toPage(reply?.users, reply?.total);
}

/**
 * "The people who are waiting" are never approved and not admins. Without
 * `isAdmin: false` this would count admins who were never approved, and they
 * have access already.
 */
export const WAITING: UserFilters = { status: "waiting", isAdmin: false };

/** How many people are waiting: the `total` of a request for one row. */
export async function countWaiting(): Promise<number> {
  return (await listUsers({ ...WAITING, limit: 1 })).total;
}

/** How many accounts match: the `total` of a request for one row. */
export async function countUsers(filters: UserFilters): Promise<number> {
  return (await listUsers({ ...filters, limit: 1, page: 1 })).total;
}

/**
 * The account with exactly this login ID, or null. The backend has no address
 * for one account, and its search also finds IDs that contain the text
 * ("j.kim" finds "hj.kim"), so the exact one is picked out here.
 */
export async function findUser(userId: string): Promise<AdminUser | null> {
  const wanted = userId.trim().toLowerCase();

  if (!wanted) return null;

  for (let page = 1; ; page += 1) {
    const { rows, total } = await listUsers({
      search: wanted,
      page,
      limit: MAX_USERS_PER_REQUEST,
    });

    const found = rows.find((user) => user.user_id.toLowerCase() === wanted);

    if (found) return found;

    if (rows.length === 0 || page * MAX_USERS_PER_REQUEST >= total) return null;
  }
}

export interface AccessLogFilters {
  // This person and nobody else. Not the same as `search`.
  userId?: string;
  // Found anywhere in the login ID or the IP address.
  search?: string;
  // Days, both included: "2026-11-23".
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listAccessLog(
  filters: AccessLogFilters,
): Promise<Page<AccessLogEntry>> {
  const params = pageParams(filters.page, filters.limit);

  addText(params, "user_id", filters.userId);
  addText(params, "search", filters.search);
  addDayRange(params, "accessed", filters.from, filters.to);

  const reply = await call<{ access_logs?: AccessLogEntry[]; total?: number }>(
    `/access-log?${params}`,
  );

  return toPage(reply?.access_logs, reply?.total);
}

export interface SessionFilters {
  // This person and nobody else. Not the same as `search`.
  userId?: string;
  // Found anywhere in the owner's login ID, the title or the session ID.
  search?: string;
  // Which date the days are about: when the chat was created (the default),
  // or its last activity.
  dateField?: "created" | "updated";
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listSessions(
  filters: SessionFilters,
): Promise<Page<AdminSession>> {
  const params = pageParams(filters.page, filters.limit);

  addText(params, "user_id", filters.userId);
  addText(params, "search", filters.search);
  addDayRange(
    params,
    filters.dateField === "updated" ? "updated" : "created",
    filters.from,
    filters.to,
  );

  const reply = await call<{ sessions?: AdminSession[]; total?: number }>(
    `/sessions?${params}`,
  );

  return toPage(reply?.sessions, reply?.total);
}

/** All admins. The list is short and has no pages. */
export async function listAdmins(): Promise<AdminEntry[]> {
  const reply = await call<{ admins?: AdminEntry[] }>("/admins");

  return Array.isArray(reply?.admins) ? reply.admins : [];
}

// --- The changes -------------------------------------------------------------

/** Approves the account, or takes the approval away. */
export function setActive(userId: string, isActive: boolean) {
  return call<AdminUser>(
    `/users/${encodeURIComponent(userId)}?${new URLSearchParams({
      is_active: String(isActive),
    })}`,
    "PATCH",
  );
}

/** Works for a login ID that has no account yet, too. */
export function makeAdmin(userId: string) {
  return call<AdminEntry>(`/admins/${encodeURIComponent(userId)}`, "PUT");
}

export function removeAdmin(userId: string) {
  return call<null>(`/admins/${encodeURIComponent(userId)}`, "DELETE");
}

/**
 * The backend's rule for a login ID, so that an ID it would refuse is not
 * sent at all. Returns the ID as the backend stores it, or null.
 */
export function normalizeUserId(typed: string): string | null {
  const userId = typed.trim().toLowerCase();

  if (!userId || userId.length > 255) return null;
  if (/[\s/\\]/.test(userId)) return null;
  if (["null", "undefined", "none"].includes(userId)) return null;

  return userId;
}
