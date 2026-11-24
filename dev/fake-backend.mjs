#!/usr/bin/env node
/**
 * A stand-in for the data agent backend. LOCAL DEVELOPMENT ONLY.
 *
 * The real backend with the admin addresses cannot be reached from a
 * development machine. This script answers what the admin area needs, on
 * invented data it keeps in memory: /auth/me, an empty chat list, and every
 * /admin/... address. It follows the backend's rules for searching, paging,
 * dates, statuses and refusals, so the admin area can be tried for real.
 * It does not answer the chat itself: sending a message fails.
 *
 * It is never imported by the app and never part of the Docker image.
 *
 *   node dev/mock-login-service.mjs
 *   node dev/fake-backend.mjs
 *
 * and, for `npm run dev`, in .env.local:
 *
 *   AUTH_DEV_PROXY_TARGET=http://127.0.0.1:13081
 *   BACKEND_ORIGIN=http://127.0.0.1:13082
 *
 * The person is whoever the pass names (MOCK_LOGIN_ID of the login stand-in).
 * The pass is read, not checked: this is not a place to test signatures.
 *
 * Settings (environment variables, all optional):
 *
 *   FAKE_BACKEND_PORT   Default: 13082.
 *   FAKE_IS_ADMIN       "0" makes the person who logs in not an admin.
 *                       Default: an admin.
 *   FAKE_IS_ACTIVE      "0" makes the person who logs in not approved.
 *                       Default: approved.
 *   FAKE_DELAY_MS       Every answer waits this long. Default: 0.
 *
 * Switches while it runs. Open the address in a browser or with curl:
 *
 *   http://127.0.0.1:13082/__fake                    shows the switches
 *   http://127.0.0.1:13082/__fake?admin_required=1   every /admin address answers
 *                                                    403 admin_required, as if the
 *                                                    admin right was taken away
 *   http://127.0.0.1:13082/__fake?delay=1500         slow answers, to see the
 *                                                    loading state and late answers
 *   http://127.0.0.1:13082/__fake?fail=1             every /admin address answers 500
 *   http://127.0.0.1:13082/__fake?change=409:last_admin
 *                                                    every change (PATCH, PUT, DELETE)
 *                                                    is refused with this status and
 *                                                    code, to see what the page says.
 *                                                    Also: 401:invalid_token,
 *                                                    404:user_not_found, 400, 500
 *
 * `=0` turns a switch off again. A restart brings the data back.
 */
import { createServer } from "node:http";

const env = process.env;
const PORT = Number(env.FAKE_BACKEND_PORT) || 13082;
const CALLER_IS_ADMIN = env.FAKE_IS_ADMIN !== "0";
const CALLER_IS_ACTIVE = env.FAKE_IS_ACTIVE !== "0";

const switches = {
  admin_required: false,
  fail: false,
  change: "",
  delay: Math.max(0, Number(env.FAKE_DELAY_MS) || 0),
};

const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 86400e3;
const START = Date.now();

// Times as the backend writes them: "2026-11-23T01:00:00Z".
const iso = (time) => new Date(time).toISOString().replace(/\.\d+Z$/, "Z");

// The same numbers on every start, so a view looks the same after a restart.
function generator(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;

    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = generator(20261124);

// --- Invented data -----------------------------------------------------------

const DEPARTMENTS = [
  "메모리 수율분석 그룹",
  "Defect Inspection Platform Team",
  "공정데이터 엔지니어링 파트",
  "AI/ML Platform Engineering Group, Data Intelligence Lab (Advanced Analytics & Automation)",
  "설비기술팀",
  "Process Integration",
  "품질보증실 신뢰성분석 그룹 (Reliability Analysis Group, Quality Assurance Office)",
  "Metrology & Inspection",
  "데이터플랫폼 개발팀",
  "Smart Factory Solutions",
];

const SITES = ["한빛 캠퍼스", "새별 캠퍼스", "Dasan R&D Center", "Munich Research Office"];

const BROWSERS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15",
];

const TITLES = [
  "Defect images from line 3",
  "3라인 결함 이미지 분류",
  "Yield drop on lot A27: root cause candidates",
  "주간 수율 리포트 요약",
  "Wafer map clustering for edge defects",
  "CD-SEM 측정값 이상치 탐지",
  "설비 알람 이력 조회",
  "Top 10 defect types this week",
  "공정 조건별 불량률 비교 (Etch / CMP / Photo)",
  "Scratch pattern on wafer 14",
  "SQL for daily WIP by step",
  "FDC 센서 드리프트 원인 분석",
  "Which lots were on hold yesterday?",
  "불량 이미지 유사도 검색",
  "Overlay error trend by scanner",
];

const LONG_TITLE =
  "Compare particle counts between chamber B and chamber D over the last 30 days and list the outliers by recipe";

// login ID | department | site | a(ctive) w(aiting) d(eactivated) | first visit, days ago | last visit, hours ago
// "j.kim" and "hj.kim" are both here on purpose: a search for "j.kim" finds
// both, and user_id=j.kim finds one.
const PEOPLE = `sora.yoon|8|0|a|34|0.1
minjun.cha|8|0|w|36|5
minho.jeon|0|0|w|0.03|
emily.carter|3|3|w|1.1|20
dasom.eom|6|1|w|4.2|52
j.kim|0|0|a|33|0.6
hj.kim|2|1|a|30|2
jiwoo.park|1|2|a|33|1.2
seoyeon.lee|0|0|a|32|0.4
dohyun.choi|4|1|a|31|26
yuna.jung|6|1|a|30|3.5
taeyang.kang|5|0|a|29|7
haeun.shin|7|2|a|29|1.8
junho.oh|4|1|d|28|190
minseo.han|2|1|a|27|4
eunji.seo|8|0|a|27|0.9
sungmin.kwon|9|2|a|26|30
jihoon.lim|1|2|a|25|2.4
nayeon.song|0|0|a|24|49
hyunwoo.bae|3|2|a|23|1.1
chaewon.moon|6|1|a|22|6
donghyun.yang|5|0|a|21|28
subin.ahn|7|2|a|20|3
woojin.jang|9|2|a|19|75
yerin.hwang|2|1|a|18|0.7
seungwoo.noh|4|1|a|17|22
mina.ryu|0|0|a|16|5.5
kyungsoo.nam|8|0|a|15|1.4
anna.schmidt|3|3|a|14|18
rahul.verma|3|3|d|13|240
thanh.nguyen|1|2|a|12|2.2
daniel.okafor|9|3|a|11|44
sofia.rossi|7|3|a|10|8
jaehyun.baek|5|0|a|9|1.6
soyeon.go|6|1|a|8|27
taemin.heo|2|1|a|7|3.2
bora.min|0|0|d|6.5|120
inho.pyo|4|1|a|6|0.5
yejin.ki|1|2|a|5|9
sangwoo.ma|9|2|d|4.5|96
hana.tak|8|0|a|3|2.8`
  .split("\n")
  .map((line) => line.split("|"));

// Thirty more, so that the accounts need a second page.
const GIVEN = ["areum", "beomseok", "chanwoo", "dahye", "eunho", "gaeun", "hajun", "iseul", "jaemin", "kyuri", "minji", "nari", "ohyun", "pureum", "rina", "siwoo", "taeri", "ujin", "wonho", "yuri"];
const FAMILY = ["kim", "lee", "park", "choi", "jung", "kang", "cho", "yoon", "jang", "lim"];

for (let i = 0; i < 30; i += 1) {
  const id = `${GIVEN[i % 20]}.${FAMILY[(i * 3 + Math.floor(i / 20)) % 10]}`;

  PEOPLE.push([id, String(i % 10), String(i % 4), i % 11 === 5 ? "d" : "a", String(37 + i * 1.7), String(2 + i * 9)]);
}

/** user_id -> account, as stored. `status` and `is_admin` are worked out. */
const users = new Map();
/** user_id -> { added_at, added_by } */
const admins = new Map();
/** { user_id, time, ip_address, user_agent } */
const visits = [];
/** { user_id, session_id, session_title, created, updated, run_state } */
const sessions = [];

const hex = () => Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(random() * 16)]).join("");

PEOPLE.forEach(([id, department, site, state, daysAgo, hoursAgo], index) => {
  const created = START - Number(daysAgo) * DAY - ((index * 7919) % 3600) * 1000;
  const lastVisit = hoursAgo === "" ? created : Math.max(created, START - Number(hoursAgo) * HOUR);
  const approved = state === "w" ? null : created + (20 + ((index * 13) % 300)) * MIN;
  const bare = id === "yejin.ki"; // an account with empty fields

  users.set(id, {
    user_id: id,
    is_active: state === "a",
    email: `${id}@samsung.com`,
    full_name: `${id}@samsung.com`,
    department: bare ? null : DEPARTMENTS[Number(department)],
    company: bare ? null : SITES[Number(site)],
    unique_name: `CORP\\${id}`,
    sid: `S-1-5-21-${1004336348 + index * 7717}-${1177238915 + index * 3301}-${682003330 + index * 911}-${51200 + index * 17}`,
    roles: [],
    created_at: iso(created),
    activated_at: approved ? iso(approved) : null,
    activated_by: approved ? (Number(daysAgo) > 20 ? "minjun.cha" : "sora.yoon") : null,
    last_access_at: iso(lastVisit),
    last_access_ip: `10.254.${100 + ((index * 37) % 120)}.${1 + ((index * 53) % 250)}`,
    // For the generator below only. Never sent.
    _created: created,
    _last: lastVisit,
    _browser: index % 3,
    _rate: 0.5 + ((index * 29) % 45) / 100,
  });
});

// One admin who was never approved (waiting, and still has access), one who
// is approved, and one who has no account at all.
admins.set("minjun.cha", { added_at: iso(START - 36.2 * DAY), added_by: "bootstrap" });
admins.set("sora.yoon", { added_at: iso(START - 33.4 * DAY), added_by: "minjun.cha" });
admins.set("daeho.kwon", { added_at: iso(START - 2.1 * DAY), added_by: "sora.yoon" });

function addVisit(user, time) {
  visits.push({
    user_id: user.user_id,
    time,
    ip_address: random() < 0.03 ? null : user.last_access_ip,
    user_agent: random() < 0.04 ? null : BROWSERS[user._browser],
  });
}

function addSession(userId, time) {
  const updated = Math.min(START - 5 * MIN, time + (2 + random() * 40) * MIN + (random() < 0.1 ? random() * 3 * DAY : 0));

  sessions.push({
    user_id: userId,
    session_id: hex(),
    session_title: random() < 0.07 ? null : TITLES[Math.floor(random() * TITLES.length)],
    created: time,
    updated: Math.max(time, updated),
    run_state: "idle",
  });
}

for (const user of users.values()) {
  addVisit(user, user._created);

  if (user._last <= user._created + MIN) continue;

  const uses = user.activated_at !== null || admins.has(user.user_id);

  for (let day = Math.floor(user._created / DAY) + 1; uses && day * DAY < user._last; day += 1) {
    const weekday = new Date(day * DAY).getUTCDay();

    if (random() > user._rate * (weekday === 0 || weekday === 6 ? 0.15 : 1)) continue;

    // 08:00 to 19:00 Korean time. A reload about once an hour is a visit.
    for (let n = 2 + Math.floor(random() * 6); n > 0; n -= 1) {
      const time = day * DAY + (random() * 11 - 1) * HOUR;

      if (time > user._created && time < user._last) addVisit(user, time);
    }

    for (let n = Math.floor(random() * 4); n > 0; n -= 1) {
      const time = day * DAY + (random() * 11 - 1) * HOUR;

      if (time > user._created && time < user._last) addSession(user.user_id, time);
    }
  }

  addVisit(user, user._last);
}

// Old chats can belong to a login ID that has no account.
for (let i = 0; i < 7; i += 1) addSession("legacy.tester", START - (41 + i * 2.3) * DAY);

const newestFirst = (field) => (a, b) => b[field] - a[field];

visits.sort(newestFirst("time"));
sessions.sort(newestFirst("created"));

// Two chats that are running, one without a title, one with a long title.
Object.assign(sessions[0], { run_state: "running", updated: START - 20e3 });
Object.assign(sessions[2], { run_state: "running", updated: START - 45e3 });
sessions[3].session_title = null;
sessions[5].session_title = LONG_TITLE;

// --- What goes out -----------------------------------------------------------

// "active" when approved. Otherwise "waiting" when never approved, and
// "deactivated" when it was approved once.
function statusOf(user) {
  if (user.is_active) return "active";

  return user.activated_at === null ? "waiting" : "deactivated";
}

function userOut(user) {
  const out = {};

  for (const [key, value] of Object.entries(user)) {
    if (!key.startsWith("_")) out[key] = value;
  }

  return { ...out, is_admin: admins.has(user.user_id), status: statusOf(user) };
}

const visitOut = (visit) => ({
  user_id: visit.user_id,
  accessed_at: iso(visit.time),
  ip_address: visit.ip_address,
  user_agent: visit.user_agent,
});

const sessionOut = (session) => ({
  user_id: session.user_id,
  session_id: session.session_id,
  session_title: session.session_title,
  created_at: iso(session.created),
  last_update_time: iso(session.updated),
  run_state: session.run_state,
});

const adminOut = ([userId, entry]) => ({ user_id: userId, ...entry });

// --- Requests ----------------------------------------------------------------

class Refusal extends Error {
  constructor(status, body) {
    super(`refused with ${status}`);
    this.status = status;
    this.body = body;
  }
}

const refuse = (status, detail, code) => new Refusal(status, code ? { detail, code } : { detail });

// A filter value that is not valid: 422, and `detail` is a list.
const invalid = (name, message, input) =>
  new Refusal(422, { detail: [{ type: "value_error", loc: ["query", name], msg: message, input }] });

// Who the pass names. Read, not checked.
function callerOf(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");

  if (!match) return null;

  try {
    const payload = JSON.parse(Buffer.from(match[1].split(".")[1], "base64url").toString("utf8"));
    const id = String(payload.username ?? payload.sub ?? "").trim().toLowerCase();

    if (!id || (payload.exp && payload.exp * 1000 < Date.now())) return null;

    return { id, payload };
  } catch {
    return null;
  }
}

// The login ID in an address, as the backend stores it.
function userIdOf(segment) {
  const id = segment.trim().toLowerCase();

  if (!id || id.length > 255 || /[\s/\\]/.test(id) || ["null", "undefined", "none"].includes(id)) {
    throw refuse(400, "User id is invalid");
  }

  return id;
}

function numberOf(query, name, fallback, min, max) {
  const raw = query.get(name);

  if (raw === null) return fallback;

  const value = Number(raw);

  if (!/^-?\d+$/.test(raw) || value < min || value > max) {
    throw invalid(name, `Input should be a whole number from ${min} to ${max}`, raw);
  }

  return value;
}

// A moment, written with a time zone. Without one it is refused.
function momentOf(query, name) {
  const raw = query.get(name);

  if (raw === null) return null;

  const time = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? Date.parse(raw) : NaN;

  if (Number.isNaN(time)) throw invalid(name, "Input should be a datetime with a time zone", raw);

  return time;
}

// A piece of text, at most 255 characters. Spaces around it are ignored and
// an empty one is the same as none. "%" and "_" are ordinary characters.
function searchOf(query) {
  const text = (query.get("search") ?? "").trim();

  if (text.length > 255) throw invalid("search", "String should have at most 255 characters", text);

  return text.toLowerCase();
}

const contains = (value, text) => value !== null && value !== undefined && String(value).toLowerCase().includes(text);

// `total` counts all matching rows, not the rows of the page. A page behind
// the end is an empty list with the true total.
function pageOf(query, rows, maxLimit, defaultLimit) {
  const limit = numberOf(query, "limit", defaultLimit, 1, maxLimit);
  const offset = numberOf(query, "offset", 0, 0, Number.MAX_SAFE_INTEGER);

  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

function between(query, from, to, field, rows) {
  const first = momentOf(query, from);
  const end = momentOf(query, to);

  // `..._from` includes its moment, `..._to` excludes it.
  return rows.filter((row) => (first === null || row[field] >= first) && (end === null || row[field] < end));
}

function listUsers(query) {
  const text = searchOf(query);
  const status = query.get("status");
  const isAdmin = query.get("is_admin");

  if (status !== null && !["waiting", "active", "deactivated"].includes(status)) {
    throw invalid("status", "Input should be 'waiting', 'active' or 'deactivated'", status);
  }

  if (isAdmin !== null && !["true", "false"].includes(isAdmin)) {
    throw invalid("is_admin", "Input should be a valid boolean", isAdmin);
  }

  const rows = [...users.values()]
    .filter(
      (user) =>
        (!text || [user.user_id, user.email, user.full_name, user.department, user.company].some((value) => contains(value, text))) &&
        (status === null || statusOf(user) === status) &&
        (isAdmin === null || String(admins.has(user.user_id)) === isAdmin),
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const page = pageOf(query, rows, 200, 50);

  return { users: page.rows.map(userOut), total: page.total };
}

function listAccessLog(query) {
  const text = searchOf(query);
  const userId = query.get("user_id")?.trim().toLowerCase();

  const rows = between(query, "accessed_from", "accessed_to", "time", visits).filter(
    (visit) =>
      (!userId || visit.user_id === userId) &&
      (!text || contains(visit.user_id, text) || contains(visit.ip_address, text)),
  );

  const page = pageOf(query, rows, 1000, 100);

  return { access_logs: page.rows.map(visitOut), total: page.total };
}

function listSessions(query) {
  const text = searchOf(query);
  const userId = query.get("user_id")?.trim().toLowerCase();

  const created = between(query, "created_from", "created_to", "created", sessions);

  const rows = between(query, "updated_from", "updated_to", "updated", created).filter(
    (session) =>
      (!userId || session.user_id === userId) &&
      (!text || contains(session.user_id, text) || contains(session.session_title, text) || contains(session.session_id, text)),
  );

  const page = pageOf(query, rows, 200, 50);

  return { sessions: page.rows.map(sessionOut), total: page.total };
}

function setActive(id, query, callerId) {
  const wanted = query.get("is_active");

  if (wanted !== "true" && wanted !== "false") {
    throw invalid("is_active", "Input should be a valid boolean", wanted);
  }

  const user = users.get(id);

  if (!user) throw refuse(404, "User not found", "user_not_found");

  if (wanted === "true") {
    // Approving sets these anew, also after a deactivation.
    Object.assign(user, { is_active: true, activated_at: iso(Date.now()), activated_by: callerId });
  } else {
    // Deactivating leaves them.
    user.is_active = false;
  }

  return userOut(user);
}

// The first time a person is seen in this run, they are set up the way the
// environment variables say. After that, what admins do to them stays.
const seen = new Set();

function me(caller, req) {
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim() || null;
  let user = users.get(caller.id);

  if (!user) {
    const email = caller.payload.email ?? `${caller.id}@samsung.com`;

    user = {
      user_id: caller.id,
      is_active: false,
      email,
      full_name: caller.payload.full_name ?? email,
      department: caller.payload.department ?? null,
      company: caller.payload.company ?? null,
      unique_name: caller.payload.unique_name ?? null,
      sid: caller.payload.sid ?? null,
      roles: caller.payload.roles ?? [],
      created_at: iso(now),
      activated_at: null,
      activated_by: null,
      last_access_at: null,
      last_access_ip: null,
    };
    users.set(caller.id, user);
  }

  if (!seen.has(caller.id)) {
    seen.add(caller.id);

    if (CALLER_IS_ACTIVE && !user.is_active) {
      Object.assign(user, { is_active: true, activated_at: iso(now), activated_by: "bootstrap" });
    }

    if (!CALLER_IS_ACTIVE) user.is_active = false;

    if (CALLER_IS_ADMIN && !admins.has(caller.id)) {
      admins.set(caller.id, { added_at: iso(now), added_by: "bootstrap" });
    }

    if (!CALLER_IS_ADMIN) admins.delete(caller.id);
  }

  // Each call is one visit. This is why the page asks only once per load.
  visits.unshift({ user_id: caller.id, time: now, ip_address: ip, user_agent: req.headers["user-agent"] ?? null });
  Object.assign(user, { last_access_at: iso(now), last_access_ip: ip });

  const isAdmin = admins.has(caller.id);

  return {
    user_id: user.user_id,
    // An admin can always use the app, approved or not.
    is_active: user.is_active || isAdmin,
    is_admin: isAdmin,
    email: user.email,
    full_name: user.full_name,
    department: user.department,
    company: user.company,
    created_at: user.created_at,
  };
}

function admin(method, parts, query, caller) {
  // The admin right is looked up on every single request.
  if (switches.admin_required || !admins.has(caller.id)) {
    throw refuse(403, "Administrator rights are required", "admin_required");
  }

  if (switches.fail) throw refuse(500, "Internal Server Error");

  if (switches.change && method !== "GET") {
    const [status, code] = switches.change.split(":");

    throw refuse(Number(status) || 500, "Refused by the 'change' switch", code);
  }

  const [list, target, ...rest] = parts;

  if (rest.length === 0 && target === undefined && method === "GET") {
    if (list === "users") return listUsers(query);
    if (list === "access-log") return listAccessLog(query);
    if (list === "sessions") return listSessions(query);

    if (list === "admins") {
      const newest = [...admins.entries()].sort((a, b) => Date.parse(b[1].added_at) - Date.parse(a[1].added_at));

      return { admins: newest.map(adminOut) };
    }
  }

  if (rest.length === 0 && target !== undefined) {
    if (list === "users" && method === "PATCH") return setActive(userIdOf(target), query, caller.id);

    if (list === "admins" && method === "PUT") {
      const id = userIdOf(target);

      // Works for a login ID without an account. Doing it twice changes nothing.
      if (!admins.has(id)) admins.set(id, { added_at: iso(Date.now()), added_by: caller.id });

      return adminOut([id, admins.get(id)]);
    }

    if (list === "admins" && method === "DELETE") {
      const id = userIdOf(target);

      if (!admins.has(id)) throw refuse(404, "Admin not found", "admin_not_found");
      if (admins.size === 1) throw refuse(409, "The last admin cannot be removed", "last_admin");

      admins.delete(id);

      return null; // 200 with the body `null`
    }
  }

  throw refuse(404, "Not Found");
}

function answer(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method ?? "GET";

  if (parts[0] === "__fake") {
    for (const name of ["admin_required", "fail"]) {
      if (url.searchParams.has(name)) switches[name] = url.searchParams.get(name) === "1";
    }

    if (url.searchParams.has("change")) {
      const value = url.searchParams.get("change") ?? "";

      switches.change = value === "0" ? "" : value;
    }

    if (url.searchParams.has("delay")) switches.delay = Math.max(0, Number(url.searchParams.get("delay")) || 0);

    return { body: switches, note: "switches" };
  }

  const caller = callerOf(req);

  if (!caller) throw refuse(401, "Token is missing or invalid", "invalid_token");

  const note = `as ${caller.id}`;

  if (method === "GET" && url.pathname === "/auth/me") return { body: me(caller, req), note };

  // The chat's own list, so that going back to the chat shows no error.
  // Another person's chats are refused, as the real backend does.
  if (parts[0] === "apps" && parts[1] === "users" && parts[2] !== undefined) {
    if (parts[2].toLowerCase() !== caller.id) throw Object.assign(refuse(403, "User mismatch", "user_mismatch"), { note });

    const user = users.get(caller.id);

    if (!admins.has(caller.id) && !user?.is_active) throw Object.assign(refuse(403, "Account is inactive", "account_inactive"), { note });

    if (method === "GET" && parts[3] === "sessions" && parts.length === 4) return { body: { sessions: [] }, note };
  }

  if (parts[0] === "admin") {
    try {
      return { body: admin(method, parts.slice(1), url.searchParams, caller), note };
    } catch (error) {
      throw Object.assign(error, { note });
    }
  }

  throw Object.assign(refuse(404, "Not Found"), { note });
}

const server = createServer(async (req, res) => {
  let status = 200;
  let body;
  let note = "";

  try {
    ({ body, note } = answer(req));
  } catch (error) {
    if (!(error instanceof Refusal)) {
      console.error(error);
      error = refuse(500, "Internal Server Error");
    }

    ({ status, body } = error);
    note = error.note ?? "";
  }

  if (switches.delay > 0 && !(req.url ?? "").startsWith("/__fake")) {
    await new Promise((resolve) => setTimeout(resolve, switches.delay));
  }

  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));

  // Who asked, never the pass itself.
  console.log(`${req.method} ${req.url} -> ${status}${note ? ` (${note})` : ""}`);
});

// Loopback only: it answers anyone who shows a pass, without checking it.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Fake data agent backend on http://127.0.0.1:${PORT}`);
  console.log(`  accounts: ${users.size}, visits: ${visits.length}, chats: ${sessions.length}, admins: ${admins.size}`);
  console.log(`  the person who logs in: ${CALLER_IS_ADMIN ? "an admin" : "not an admin"}, ${CALLER_IS_ACTIVE ? "approved" : "not approved"}`);
  console.log(`  switches: http://127.0.0.1:${PORT}/__fake`);
  console.log(`For "npm run dev", set BACKEND_ORIGIN=http://127.0.0.1:${PORT} in .env.local`);
});
