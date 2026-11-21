#!/usr/bin/env node
/**
 * A stand-in for the DICE login service. LOCAL DEVELOPMENT ONLY.
 *
 * The real login service exists only behind the DICE address, so on localhost
 * the app could never get past its login check. This script answers the same
 * four addresses the way the real service does, and hands out a real signed
 * pass that a backend running locally with the same secret accepts.
 *
 * It is never imported by the app and never part of the Docker image.
 *
 *   node dev/mock-login-service.mjs
 *
 * and, for `npm run dev`, in .env.local:
 *
 *   AUTH_DEV_PROXY_TARGET=http://127.0.0.1:13081
 *
 * which makes next.config.mjs send /auth/... to this script.
 *
 * Settings (environment variables, all optional):
 *
 *   AUTH_SERVICE_JWT_SECRET       The secret the pass is signed with. It must
 *                                 equal the local backend's setting of the
 *                                 same name. NEVER the production secret.
 *                                 Default: "local-dev-secret".
 *   MOCK_LOGIN_ID                 The login ID to hand out. Default:
 *                                 "gildong.hong".
 *   MOCK_LOGIN_PORT               Default: 13081.
 *   MOCK_PASS_LIFETIME_SECONDS    How long a pass lasts. Default: 3600. Set it
 *                                 to 90 to watch the page renew its pass.
 *   MOCK_LOGIN_LIFETIME_SECONDS   How long the login itself lasts. Default:
 *                                 3600. Set it to 120 to watch the page go
 *                                 through the login redirect again.
 *   MOCK_LOGIN_FAILS              "1" makes /auth/login come back without
 *                                 logging in, to try the "login does not
 *                                 succeed" case.
 *
 * "Logged in" is a cookie holding the time of the login, so it survives a
 * restart of this script. Restarting with another MOCK_LOGIN_ID is how to
 * try "a different person logs in on the same browser".
 */
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";

const env = process.env;

const seconds = (value, fallback) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const PORT = seconds(env.MOCK_LOGIN_PORT, 13081);
const SECRET = env.AUTH_SERVICE_JWT_SECRET || "local-dev-secret";
const LOGIN_ID = env.MOCK_LOGIN_ID || "gildong.hong";
const PASS_LIFETIME = seconds(env.MOCK_PASS_LIFETIME_SECONDS, 3600);
const LOGIN_LIFETIME = seconds(env.MOCK_LOGIN_LIFETIME_SECONDS, 3600);
const LOGIN_FAILS = env.MOCK_LOGIN_FAILS === "1";

const COOKIE = "mock_dice_login";

if (/[\s/\\]/.test(LOGIN_ID)) {
  console.error("MOCK_LOGIN_ID must not contain spaces, / or \\");
  process.exit(1);
}

const EMAIL = `${LOGIN_ID}@samsung.com`;

// Samsung SSO's internal value for the person. Deliberately nothing like the
// login ID: the app must not use it as one.
const SSO_ID = createHash("sha256").update(LOGIN_ID).digest("base64");

const now = () => Math.floor(Date.now() / 1000);

const base64url = (value) => Buffer.from(value).toString("base64url");

// A JWT signed with HS256: HMAC-SHA256 over base64url(header) + "." +
// base64url(payload), keyed with the secret as UTF-8 text.
function signPass(expiresAt) {
  const header = { alg: "HS256", typ: "JWT" };

  const payload = {
    sub: LOGIN_ID,
    username: LOGIN_ID,
    email: EMAIL,
    full_name: EMAIL,
    department: null,
    company: null,
    unique_name: null,
    sid: null,
    roles: [],
    type: "service",
    iss: "web-auth",
    aud: "dice-backend",
    iat: now(),
    exp: expiresAt,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;

  const signature = createHmac("sha256", Buffer.from(SECRET, "utf8"))
    .update(unsigned)
    .digest("base64url");

  return `${unsigned}.${signature}`;
}

// When the login in this request's cookie started, or null without a login
// that is still alive.
function loginStart(req) {
  const match = (req.headers.cookie ?? "").match(
    new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)`),
  );

  if (!match) return null;

  const start = Number(match[1]);

  return start <= now() && now() < start + LOGIN_LIFETIME ? start : null;
}

// Like the real service: asking again before the pass expires returns the
// same pass, and a pass never outlives the login it belongs to.
let lastPass = null; // { start, token, expiresAt }

function passFor(start) {
  if (lastPass && lastPass.start === start && lastPass.expiresAt > now()) {
    return lastPass;
  }

  const expiresAt = Math.min(now() + PASS_LIFETIME, start + LOGIN_LIFETIME);

  lastPass = { start, token: signPass(expiresAt), expiresAt };

  return lastPass;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location, cookie) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  });
  res.end();
}

// Only an address on the origin the browser is on is accepted; anything else
// is replaced by the top of the site (the real service uses the DICE home
// page). Behind the `next dev` rewrite that origin is in x-forwarded-host.
function callbackPath(req, url) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";

  try {
    const target = new URL(
      url.searchParams.get("callbackUrl") ?? "/",
      `http://${host}`,
    );

    if (target.host !== host) return "/";

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const start = loginStart(req);

  // What happened, for the log line. Never the pass itself.
  let note = "";

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "method_not_allowed" });
  } else if (url.pathname === "/auth/session") {
    if (start === null) {
      note = "not logged in";
      sendJson(res, 200, {
        authenticated: false,
        user: null,
        roles: [],
        error: null,
      });
    } else {
      note = `logged in as ${LOGIN_ID}`;
      sendJson(res, 200, {
        authenticated: true,
        user: { id: SSO_ID, name: EMAIL, email: EMAIL },
        roles: [],
        expiresAt: start + LOGIN_LIFETIME,
      });
    }
  } else if (url.pathname === "/auth/token") {
    if (start === null) {
      note = "no login";
      sendJson(res, 401, { error: "unauthorized" });
    } else {
      const pass = passFor(start);

      note = `pass for ${LOGIN_ID}, ${pass.expiresAt - now()} s left`;
      sendJson(res, 200, {
        accessToken: pass.token,
        tokenType: "Bearer",
        expiresAt: pass.expiresAt,
      });
    }
  } else if (url.pathname === "/auth/login") {
    const back = callbackPath(req, url);

    if (LOGIN_FAILS) {
      note = `MOCK_LOGIN_FAILS is set, back to ${back} without a login`;
      redirect(res, back);
    } else {
      note = `logged in as ${LOGIN_ID}, back to ${back}`;
      redirect(
        res,
        back,
        `${COOKIE}=${now()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${LOGIN_LIFETIME}`,
      );
    }
  } else if (url.pathname === "/auth/logout") {
    note = "logged out";
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    });
    res.end(
      "<!doctype html><title>Logged out</title>" +
        "<p>Mock DICE page: you are logged out.</p>",
    );
  } else {
    sendJson(res, 404, { error: "not_found" });
  }

  console.log(
    `${req.method} ${url.pathname} -> ${res.statusCode}${note ? ` (${note})` : ""}`,
  );
});

// Loopback only: this hands a signed pass to anyone who asks.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock DICE login service on http://127.0.0.1:${PORT}`);
  console.log(`  login ID:       ${LOGIN_ID}`);
  console.log(
    `  secret:         ${
      env.AUTH_SERVICE_JWT_SECRET
        ? "from AUTH_SERVICE_JWT_SECRET"
        : 'the default, "local-dev-secret"'
    }`,
  );
  console.log(`  pass lifetime:  ${PASS_LIFETIME} s`);
  console.log(`  login lifetime: ${LOGIN_LIFETIME} s`);
  if (LOGIN_FAILS) console.log("  MOCK_LOGIN_FAILS is set: nobody gets in");
  console.log(
    `For "npm run dev", set AUTH_DEV_PROXY_TARGET=http://127.0.0.1:${PORT} in .env.local`,
  );
});
