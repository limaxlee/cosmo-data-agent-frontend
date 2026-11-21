# Project Structure

Frontend for the **DICE Data Agent** — a demo chat UI for an AI agent backed by a
Google ADK (Agent Development Kit) server.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui

---

## Table of contents

1. [What the app does](#what-the-app-does)
2. [How to run it](#how-to-run-it)
3. [Directory structure](#directory-structure)
4. [Login](#login)
5. [API calls — what is called from where](#api-calls--what-is-called-from-where)
6. [Theming — how to change colors](#theming--how-to-change-colors)
7. [Typography — how to change the font](#typography--how-to-change-the-font)
8. [Major points to pay attention to](#major-points-to-pay-attention-to)

---

## What the app does

A single-feature chat application:

- A person is logged in through the DICE single sign-on, and has to be approved
  by an admin before the app opens (see [Login](#login))
- They start a chat, type a message, optionally attach one image
- Messages go to an ADK backend; replies render as Markdown
- Past sessions are listed in a sidebar, and can be opened, exported, or deleted
- Light / dark / system theme, persisted in `localStorage`

### Routes

| URL | File | Rendering |
|---|---|---|
| `/` | — | redirects to `/chat/new` (see [`next.config.mjs`](next.config.mjs)) |
| `/chat/new` | [`src/app/chat/new/page.tsx`](src/app/chat/new/page.tsx) | static |
| `/chat/<sessionId>` | [`src/app/chat/[sessionId]/page.tsx`](src/app/chat/[sessionId]/page.tsx) | dynamic |
| `/api/chat` | [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) | route handler (POST only) |

Both pages render the same component, `ChatView`. The only difference is whether
`initialSessionId` is passed.

These are the addresses without a base path, as in local development. In the
Docker build everything above sits under `/data-agent` (see
[Base path](#base-path)).

---

## How to run it

### Prerequisites

- Node.js 20+
- A reachable ADK backend (see the CORS/network warning below)

### Setup

```bash
npm install

cp .env.example .env
# then edit .env and set NEXT_PUBLIC_API_BASE_URL to your ADK backend
```

The app cannot get past its login check on `localhost` by itself, because the
DICE login service exists only on the DICE address. Run the stand-in next to
`npm run dev` -- see [Running locally](#running-locally) under Login.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server on http://localhost:3000 (Turbopack) |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run lint` | ESLint (flat config) |

### Environment variables

All are `NEXT_PUBLIC_`, meaning **they are inlined into the client bundle**.
Never put secrets in `.env`. Full descriptions are in [`.env.example`](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | **yes** | ADK backend base URL, no trailing slash |
| `NEXT_PUBLIC_APP_TITLE` | no | browser tab title (default `Data Agent`) |
| `NEXT_PUBLIC_MAX_INPUT_LENGTH` | no | max message length (default `100000`) |

### Fonts are committed, not downloaded

`src/app/fonts/` holds two `.woff2` files loaded via `next/font/local`. They are
**imported by the bundler**, not served from `public/`, so they must exist on disk.

If you ever see `Processing image failed` or `end of data reached unexpectedly`
at startup, the font files are empty or corrupt. Verify with:

```bash
ls -l src/app/fonts/                        # should be ~300-400 KB each
head -c 4 src/app/fonts/InterVariable.woff2 # must print: wOF2
```

Download them as binaries — never copy-paste font contents through a text field.
To swap them for a different typeface, see
[Typography — how to change the font](#typography--how-to-change-the-font).

---

## Directory structure

```
src/
├── app/                          # App Router: routing tree only
│   ├── api/chat/route.ts         # server-side proxy to the ADK backend
│   ├── chat/
│   │   ├── [sessionId]/page.tsx  # /chat/<id>  — open an existing chat
│   │   └── new/page.tsx          # /chat/new   — start a new chat
│   ├── fonts/                    # local .woff2 files (imported, not served)
│   ├── globals.css               # ALL theme colors live here
│   └── layout.tsx                # root layout, font + providers
│
├── components/
│   ├── chat/                     # the chat feature
│   │   ├── chat-view.tsx         # the whole chat screen (state lives here)
│   │   ├── message-item.tsx      # one message bubble + Markdown rendering
│   │   └── session-sidebar.tsx   # session list, search, export, delete
│   ├── ui/                       # shadcn primitives — regenerable, avoid editing
│   ├── theme-toggle.tsx          # app-shell, not chat-specific
│   └── user-gate.tsx             # app-shell, shows the app only to a logged-in, approved person
│
├── providers/                    # React context providers
│   ├── theme-provider.tsx        # ThemeProvider + useTheme
│   └── user-provider.tsx         # UserProvider + useUser: the login state
│
└── lib/                          # non-React modules only
    ├── auth-client.ts            # the DICE login service, the pass, and apiFetch()
    ├── base-path.ts              # BASE_PATH, for addresses written by hand
    ├── session-api.ts            # HTTP client for the ADK session endpoints
    ├── types.ts                  # Message, ChatSession
    └── utils.ts                  # cn() — DO NOT MOVE (see gotchas)

public/
└── suggested-questions.json      # welcome-screen prompt cards, fetched at runtime

dev/
└── mock-login-service.mjs        # stand-in login service, local development only
```

### Conventions

- **File names are kebab-case.** All of them, including components.
- **`components/` groups by feature.** `chat/` is the only feature today. If a
  second one appears, consider promoting to `src/features/`.
- **`lib/` means non-React.** Anything rendering JSX belongs in `providers/` or
  `components/`.
- **Imports use the `@/` alias**, mapped to `src/` in [`tsconfig.json`](tsconfig.json).

---

## Login

The app has no login of its own. It uses the single sign-on the DICE platform
already runs, and the backend decides who may use the data agent.

```
browser ── https://dice.gtrai.sec.samsung.net ──► gateway
    /auth/...          ──► DICE login service            (not this app)
    /data-agent        ──► this app's server, port 13080
    /data-agent/...    ──► this app's server, port 13080

this app's server ── BACKEND_ORIGIN ──► data agent backend
```

### What happens when a person opens the app

1. The page asks the login service `GET /auth/session`. The browser attaches
   the login cookie by itself. The page can never read that cookie.
2. Not logged in: the page navigates to `/auth/login?callbackUrl=<this
   address>`. The login service takes the person through Samsung SSO and
   navigates back to the same address.
3. Logged in: the page asks `GET /auth/token` and receives a **pass** -- a
   short-lived signed string. The page keeps it in memory only and never looks
   inside it.
4. The page calls `GET /backend/auth/me` with `Authorization: Bearer <pass>`.
   This app's server passes the call on to the backend's `/auth/me`. The
   backend checks the pass and answers who this is (`user_id`) and whether an
   admin has approved them (`is_active`).
5. Approved: the app starts, and `user_id` is the `{userId}` of every backend
   address. Not approved: the waiting screen.
6. Every later call to `/backend/...` and `/api/chat` carries the same header.

> `/backend/auth/me` is the **backend**. `/auth/session`, `/auth/token`,
> `/auth/login` and `/auth/logout` are the **login service**, at the top of the
> site. The names look alike and the two must not be mixed up.

The pass lasts at most an hour, and so does the DICE login. About once an hour
`/auth/token` answers 401, and the page goes through step 2 again. If the
person is still logged in to Samsung SSO this is silent, but it is a full page
navigation: the page comes back on the same chat, and unsent text is back in
the box because every keystroke is saved as a draft.

### Where the code is

| File | What it owns |
|---|---|
| [`src/lib/auth-client.ts`](src/lib/auth-client.ts) | The login service and the pass. `getPass()` renews the pass when it has under a minute left. `apiFetch()` is the one way the app calls its own server: it adds the base path and the pass, gets a new pass on a 401 (and sends a `GET` once more), and tells the provider when the login ended or the backend answered `account_inactive` or `user_mismatch` |
| [`src/providers/user-provider.tsx`](src/providers/user-provider.tsx) | The start sequence above and the state it ends in. `useUser()` gives `status`, `userId`, `user`, `isAdmin`, `checkAgain()` and `logout()` |
| [`src/components/user-gate.tsx`](src/components/user-gate.tsx) | One screen per state. The app is rendered only in `ready` |
| [`src/app/backend/[...path]/route.ts`](src/app/backend/[...path]/route.ts), [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) | Pass the `Authorization` header on to the backend untouched. Nothing on the server checks the pass, and there is no secret in this repository |

| State | Meaning | Screen |
|---|---|---|
| `loading` | the check is running | a spinner |
| `redirecting` | on the way to the login page | "Going to Samsung SSO..." |
| `signed-out` | not logged in, and a redirect was already tried in this tab | "Log in" and "Check again" |
| `pending` | logged in, not approved | "Waiting for approval", the ID, "Check again", "Log out" |
| `ready` | logged in and approved | the app |
| `error` | the login service or the backend could not be asked | "Try again" |

Things kept in the browser, none of them a credential:

| Where | Key | What for |
|---|---|---|
| `sessionStorage` | `login_redirect_tried` | Set when this tab was sent to the login page, removed when a login succeeded. A login that keeps failing therefore redirects once and then shows the "Log in" button instead of looping. Logout sets it too, so the app does not log straight back in |
| `sessionStorage` | `user_mismatch_reload` | Set when the page reloaded because a different person is now logged in to DICE. Stops a second reload |
| `localStorage` | `last_user_id` | The last person who used the app in this browser. When a different one arrives, the saved drafts (`chat_draft:*`) are removed |

### Base path

`NEXT_PUBLIC_BASE_PATH` is the path the app is served under: empty locally,
`/data-agent` in the Docker build. The gateway does not remove it, so the app
is built with it ([`next.config.mjs`](next.config.mjs)).

Next.js adds it by itself to `router.push()`, `<Link>`, the redirect in
`next.config.mjs` and its own script, font and image files. It does **not**
touch an address the code writes by hand. Those use `BASE_PATH` from
[`src/lib/base-path.ts`](src/lib/base-path.ts): `apiFetch()`, the fetch of
`suggested-questions.json`, `window.history.replaceState(...)` and the
comparison with `window.location.pathname`. The login service's `/auth/...`
addresses never get it.

### Running locally

On `localhost` there is no login service, so the app would stop at "Could not
check your login". [`dev/mock-login-service.mjs`](dev/mock-login-service.mjs)
stands in for it: it answers the same four `/auth/...` addresses and hands out
a real signed pass.

```bash
# terminal 1
node dev/mock-login-service.mjs

# terminal 2 -- with AUTH_DEV_PROXY_TARGET=http://127.0.0.1:13081 in .env.local
npm run dev
```

`AUTH_DEV_PROXY_TARGET` makes `next.config.mjs` send `/auth/...` to the
stand-in. It is never set for a deployment, and then that rule does not exist.

For a local backend to accept the pass, the stand-in must sign it with the same
secret: start it with `AUTH_SERVICE_JWT_SECRET` set to the local backend's
value of the same name (never the production secret). The login ID it hands
out is `MOCK_LOGIN_ID`, `gildong.hong` by default. All settings, including
short lifetimes for trying expiry, are listed at the top of the script.

A person the backend sees for the first time is not approved, so the app shows
"Waiting for approval". The simplest way past it on a local backend is one row
in its `user_admins` table, then "Check again":

```sql
INSERT INTO user_admins (user_id, added_by) VALUES ('<login id>', 'bootstrap');
```

---

## API calls — what is called from where

There are **two different paths to the backend**, and the difference matters a lot
for debugging.

### Path A — session management: browser → ADK backend **directly**

All five live in [`src/lib/session-api.ts`](src/lib/session-api.ts) on the
`SessionStorage` class. These run **in the browser**, bypassing Next entirely.

| Method | HTTP call | Defined at | Called from |
|---|---|---|---|
| `createSession(userId)` | `POST {API_BASE}/apps/users/{userId}/sessions` | [session-api.ts:185](src/lib/session-api.ts#L185) | [chat-view.tsx:280](src/components/chat/chat-view.tsx#L280) — on first message |
| `listSessions(userId)` | `GET {API_BASE}/apps/users/{userId}/sessions` | [session-api.ts:218](src/lib/session-api.ts#L218) | [session-sidebar.tsx:102](src/components/chat/session-sidebar.tsx#L102) — polls every 5s |
| `getSession(userId, id)` | `GET {API_BASE}/apps/users/{userId}/sessions/{id}` | [session-api.ts:248](src/lib/session-api.ts#L248) | [chat-view.tsx:171](src/components/chat/chat-view.tsx#L171) — on opening a chat |
| `renameSession(userId, id, title)` | `PATCH {API_BASE}/apps/users/{userId}/sessions/{id}/title?session_title=...` | [session-api.ts:272](src/lib/session-api.ts#L272) | [session-sidebar.tsx:240](src/components/chat/session-sidebar.tsx#L240) — Rename in the session menu |
| `deleteSession(userId, id)` | `DELETE {API_BASE}/apps/users/{userId}/sessions/{id}` | [session-api.ts:296](src/lib/session-api.ts#L296) | [session-sidebar.tsx:167](src/components/chat/session-sidebar.tsx#L167) |

> **These require CORS.** Because the browser calls the backend directly, the ADK
> server must send `Access-Control-Allow-Origin` for this app's origin, and the
> host must be reachable from the user's machine (VPN, if internal).
>
> Note `createSession` sends `Content-Type: application/json` on a **bodyless**
> POST. That single header forces a CORS **preflight** (`OPTIONS`) that the other
> three calls don't trigger. If a preflight fails, the browser never sends the
> POST — so it looks like "no request was made at all", while `listSessions`
> visibly fails. Chrome hides preflights under the Fetch/XHR filter; switch the
> Network tab to **All** to see them.

### Path B — sending a message: browser → Next route → ADK backend

| Step | Call | Where |
|---|---|---|
| 1 | `POST /api/chat` (multipart `FormData`) | [chat-view.tsx:335](src/components/chat/chat-view.tsx#L335) |
| 2 | route handler receives it | [route.ts:9](src/app/api/chat/route.ts#L9) |
| 3 | `POST {API_BASE}/apps/users/{userId}/sessions/{sessionId}/run?query=...` | [route.ts:39](src/app/api/chat/route.ts#L39), sent at [:66/:71](src/app/api/chat/route.ts#L66) |

Sent as `FormData` so an optional image can ride along. Fields: `userId`,
`sessionId`, `message`, `newSession`, `messages`, `file`.

This path is **server-to-server** for the backend leg, so it is not subject to
CORS and works even when the browser cannot reach the ADK host directly.

Route responses: `400` missing fields · `413` message too long ·
backend status passed through · `500` on an unexpected error.

### Path C — static content

| Call | Where | Notes |
|---|---|---|
| `GET /suggested-questions.json` | [chat-view.tsx:112](src/components/chat/chat-view.tsx#L112) | served from [`public/`](public/suggested-questions.json) so it can be swapped per deployment without a rebuild |

Each entry is `{ title, question, icon }`. `icon` is a **lucide-react component
name** resolved at runtime by `getIcon` ([chat-view.tsx:44](src/components/chat/chat-view.tsx#L44)).

---

## Theming — how to change colors

### Everything lives in one file

**[`src/app/globals.css`](src/app/globals.css)** — there is no `tailwind.config`
file. Tailwind v4 is CSS-first, so all colors are CSS custom properties here.

The file has **four theme blocks**, and you must edit the right pair:

| Lines | Block | Applies when |
|---|---|---|
| 5 | `:root` | light — the default |
| 30 | `@media (prefers-color-scheme: dark)` | dark — OS preference, no explicit choice |
| 55 | `[data-theme="dark"]` | dark — user picked Dark in the toggle |
| 78 | `[data-theme="light"]` | light — user picked Light in the toggle |

> ⚠️ **The two light blocks must stay identical**, and so must the two dark blocks.
> Editing only `:root` means users who explicitly picked "Light" see the old
> colors. This is the single easiest theming mistake to make here.

Line 101 (`@theme inline`) maps each variable to a Tailwind utility — you rarely
touch it. It is what turns `--background` into the `bg-background` class.

### Which variable controls what

Values are **space-separated HSL without the `hsl()` wrapper** — `220 23% 97%`,
not `hsl(220, 23%, 97%)`. Keep that format or the color silently breaks.

| Variable | Controls | Tailwind class | Seen at |
|---|---|---|---|
| `--background` | page background | `bg-background` | [chat-view.tsx:379](src/components/chat/chat-view.tsx#L379) |
| **`--input`** | **composer + user message bubble** | `bg-input` | [chat-view.tsx:545](src/components/chat/chat-view.tsx#L545), [message-item.tsx:118](src/components/chat/message-item.tsx#L118) |
| `--foreground` | main text | `text-foreground` | throughout |
| `--muted-foreground` | placeholder, timestamps, hints | `text-muted-foreground` | throughout |
| `--ring` | focus ring, drag-over ring | `ring-ring` | [chat-view.tsx:546](src/components/chat/chat-view.tsx#L546) |
| `--card` | header bar, message `Card` | `bg-card` | [chat-view.tsx:411](src/components/chat/chat-view.tsx#L411) |
| `--popover` | dropdown menus | `bg-popover` | [session-sidebar.tsx:332](src/components/chat/session-sidebar.tsx#L332) |
| `--accent` | hover states | `hover:bg-accent` | sidebar, suggestion cards |
| `--border` | all borders | `border-border` | throughout |
| `--primary` | active-session highlight | `bg-primary/10`, `text-primary` | sidebar |
| `--destructive` | destructive UI | `text-destructive` | ui primitives |

### The composer and the user bubble share one variable

This is deliberate. Both use `--input`, so they **cannot drift apart** — change
that one value and both move together. If you ever want them to differ, add a new
variable rather than hardcoding a color in the component:

```css
/* globals.css — in BOTH light blocks */
--composer: 217 22% 93%;
```
```css
/* globals.css — inside @theme inline */
--color-composer: hsl(var(--composer));
```
Then use `bg-composer` in the component.

### Worked example: make the light background warmer

In **both** `:root` (line 5) and `[data-theme="light"]` (line 78):

```css
--background: 40 33% 97%;   /* was 220 23% 97% */
--card: 40 33% 97%;         /* keep card matching the background */
--input: 38 28% 91%;        /* nudge the surface to match the new warmth */
```

### Check contrast before committing a palette

Text must hit **4.5:1** against whatever sits behind it. `--muted-foreground` is
the one that usually fails, because it appears on *two* backgrounds — the page and
the raised surface. Check it against the surface (the harder case), not just the page.

The current light palette measures: body text 16:1 · muted text 4.7:1 on the
surface · primary 5.6:1.

### Colors that are NOT in globals.css

These are hardcoded in components and **will not follow your theme**. If a color
refuses to change after editing `globals.css`, it is one of these:

| Where | Hardcoded | What it is |
|---|---|---|
| [chat-view.tsx:420](src/components/chat/chat-view.tsx#L420), [:620](src/components/chat/chat-view.tsx#L620) | `from-slate-500 to-slate-600` | send button + welcome avatar gradient |
| [chat-view.tsx:402](src/components/chat/chat-view.tsx#L402) | `bg-red-500` | backend-error banner |
| [chat-view.tsx:630](src/components/chat/chat-view.tsx#L630) | `text-red-500` | file-error text |
| [session-sidebar.tsx:214](src/components/chat/session-sidebar.tsx#L214) | `text-slate-400` | search icon |
| several | `dark:bg-zinc-800`, `dark:bg-zinc-950`, `dark:bg-zinc-900` | **dark-mode surfaces** |

> ⚠️ That last row matters most: **the dark theme's composer and bubble are
> hardcoded `zinc-*`, not tokens.** Changing `--input` only affects light mode.
> To restyle dark mode you must edit the `dark:` classes in the components, or
> replace them with token classes so both modes come from `globals.css`.

### Adding or removing themes

The toggle is [`theme-toggle.tsx`](src/components/theme-toggle.tsx); the state
machine is [`theme-provider.tsx`](src/providers/theme-provider.tsx), which writes
`data-theme` onto `<html>` and persists to `localStorage`. A new theme needs a new
`[data-theme="..."]` block in `globals.css` plus an entry in both files.

---

## Typography — how to change the font

### One font, one wiring point

There is exactly one font in the app and it is defined in two places:

| Where | What it does |
|---|---|
| [layout.tsx:10-16](src/app/layout.tsx#L10-L16) | `localFont({...})` loads the two `.woff2` files and exposes them as the CSS variable `--font-geist-sans` |
| [globals.css:134](src/app/globals.css#L134) | `body { font-family: var(--font-geist-sans), system-ui, sans-serif }` |

Everything else **inherits from `body`** — the welcome greeting, message bubbles,
the composer textarea, buttons, the session sidebar, dropdown menus, and all
rendered Markdown. Tailwind's preflight sets `font-family: inherit` on form
controls, so the `<textarea>` and `<input>` are not the usual exception they
would be in plain CSS.

> There is currently **no second font**. `--font-mono` maps to `--font-geist-mono`
> ([globals.css:127](src/app/globals.css#L127)), which is never defined anywhere,
> so the `font-mono` class on inline code
> ([message-item.tsx:208](src/components/chat/message-item.tsx#L208)) resolves to
> an invalid value and inherits the body font too. `<pre>` blocks
> ([message-item.tsx:214](src/components/chat/message-item.tsx#L214)) carry no font
> class at all. Net effect: **every character in the app uses the one font.**
>
> If you want real monospace code, define `--font-geist-mono` — don't touch the
> `font-mono` classes.

### Swapping the font

Keep `variable: "--font-geist-sans"` unchanged. That name is what `globals.css`
and the `@theme inline` block look for; renaming it means editing three more
places for no benefit.

**If the replacement is a variable font** (one file spanning all weights, e.g.
`Roboto[wght].woff2`) — rename it to `InterVariable.woff2`, drop it into
[`src/app/fonts/`](src/app/fonts/), done. No code change.

**If it is a static family** (separate Regular / Medium / Bold files) — keep the
real filenames and rewrite the `src` array instead:

```ts
// src/app/layout.tsx
const inter = localFont({
  src: [
    { path: "./fonts/MyFont-Regular.woff2",  weight: "400", style: "normal" },
    { path: "./fonts/MyFont-Medium.woff2",   weight: "500", style: "normal" },
    { path: "./fonts/MyFont-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/MyFont-Bold.woff2",     weight: "700", style: "normal" },
    { path: "./fonts/MyFont-Italic.woff2",   weight: "400", style: "italic" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});
```

> ⚠️ **Do not drop a single-weight static font in under the old filename.**
> `InterVariable.woff2` is a *variable* font carrying weights 100–900 in one file,
> and the UI uses `font-medium` (500), `font-semibold` (600) and `font-bold` (700).
> A single-weight file leaves the browser to fake those by smearing glyphs —
> visibly bad on headings and the greeting.

**If the font is on Google Fonts**, skip the files entirely — Next downloads and
self-hosts it at build time:

```ts
import { Roboto } from "next/font/google";
const inter = Roboto({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
```

Then delete the `localFont` import and the [`src/app/fonts/`](src/app/fonts/) folder.

### Gotchas

- **Restart `npm run dev` after swapping.** `next/font` processes fonts at build
  time; hot reload will not pick up a replaced file.
- **`.woff2` only** in practice. `.ttf` / `.otf` work but are 3–5× larger over the wire.
- **Italic is barely used** — only Markdown blockquotes
  ([message-item.tsx:187](src/components/chat/message-item.tsx#L187)). If the new
  font ships no italic file, drop that entry from `src` and the browser will slant
  it artificially.
- The fallback chain `system-ui, sans-serif` in
  [globals.css:134](src/app/globals.css#L134) is what renders during the `swap`
  window and if the font file fails to load.

---

## Major points to pay attention to

### Sending a message fails silently when the backend is down

[`handleSend`](src/components/chat/chat-view.tsx#L256) creates the session
**before** it renders your message optimistically. If `createSession` throws, it
returns early — so the input clears, **no bubble appears, and `/api/chat` is never
called**. The only signal is the red banner.

This happens **only on the first message of a new chat**. In an existing session
`createSession` is skipped, so you instead see your message followed by
"Sorry, I encountered an error" — the same root cause looking completely different.

Moving `setMessages(...)` above the session-creation block would make the two
behave consistently.

### `lib/utils.ts` must not be moved or renamed

[`components.json`](components.json) declares `"utils": "@/lib/utils"`, and all
eight `ui/` primitives import `cn` from it. Move it and every future
`npx shadcn add <component>` generates a broken import.

### `components/ui/` is generated code

Those files come from shadcn. Prefer wrapping over editing — a regeneration
silently discards local changes.

### Turbopack caches the routing tree on disk

Renaming or moving anything under `src/app/` while `npm run dev` is running causes
`FATAL: An unexpected Turbopack error` in a loop, because the persisted incremental
graph still references the old route. Fix:

```bash
# stop the dev server first
rm -rf .next
npm run dev
```

Renames inside `components/` or `lib/` are safe to do live — it is specifically the
`app/` tree that behaves this way.

### The whole lucide icon set is in the bundle

[chat-view.tsx:14](src/components/chat/chat-view.tsx#L14) does
`import * as LucideIcons from "lucide-react"` so `getIcon` can look icons up by the
string names in `suggested-questions.json`. A namespace import indexed dynamically
**cannot be tree-shaken**, so all ~1500 icons ship to the client. Replacing it with
an explicit map of the handful actually used would cut the bundle substantially.

### `next lint` no longer exists

Next 16 removed it. The script is `"lint": "eslint"` and the config is
[`eslint.config.mjs`](eslint.config.mjs) (flat config, native — no `FlatCompat`).
ESLint currently reports errors, mostly `react-hooks/set-state-in-effect`. **They do
not block the build** — Next 16 no longer lints during `next build`.

### `.env` is currently NOT gitignored

The `.env` rules in [`.gitignore`](.gitignore) are commented out, so `.env` — which
contains your backend host — would be committed by `git add .`. To fix, uncomment:

```gitignore
.env
.env.*
!.env.example
```

### Known rough edges

- `isLoading` / `error` are set in the sidebar but never rendered, so a failed load
  shows **"No conversations yet"** instead of an error
- `SessionStorage` (the class in `session-api.ts`) is an HTTP client despite the
  name suggesting browser storage
- `onSessionSelect` is a required prop the sidebar never calls — navigation goes
  through `router.push` instead
- The ADK URLs are `/apps/users/...` with no app-name segment; ADK convention is
  `/apps/{app_name}/users/...`. If the backend returns 404s, check this first.
