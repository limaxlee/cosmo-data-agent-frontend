# Issues and PRs for moving `cosmo-data-agent-frontend` to GitHub

One issue = one branch = one PR, in the order below. Each PR builds on the previous ones, so after every merge the repo still type-checks (`npx tsc --noEmit`), lints (`npm run lint`) and builds (`npm run build`).

**How to read the line numbers.** They refer to the files in the local working tree on 2026-10-21, *including* the uncommitted changes (`git status` shows `.env`, `Dockerfile`, `chat-view.tsx`, `button.tsx`, `sheet.tsx`, `user-gate.tsx`, `user-provider.tsx` modified). Open the local file, copy the listed lines into the new repo. When an issue says "whole file minus the blocks claimed by #N", copy the file and delete those blocks; the later issue then adds them back as its own PR. Line numbers do not shift in the *local* file because you never edit it, only copy from it.

**Suggested branch names:** `issue-<number>-<slug>`, e.g. `issue-19-chat-view-core`.

**Suggested labels:** `setup`, `feature`, `bug`, `cleanup`, `docs`, `infra`, `tests`, `security`, `decision`.

**Before you start, three things that will bite you:**

1. `src/components/chat/session-sidebar.tsx:17` imports `@/app/dice_icon.png`. That file does not exist on disk and was never committed. `tsc` passes only because Next's global `*.png` module declaration hides it. `next build` will fail on #30 until the PNG is added. Find the original file or export a new one before that PR.
2. `.env` contains an internal IP (`BACKEND_ORIGIN`). Never commit it. The current `.gitignore` has the `.env` lines commented out (lines 68–71); #2 fixes that. Commit `.env.example` only.
3. `Dockerfile` lines 1, 10, 29 pull from an internal registry (`docker-remote.bart.sec.samsung.net`) and line 39 bakes in an internal IP. `next.config.mjs:8` has another internal IP. #58 and #74 parametrize these.

---

## Milestone 0 — Repository bootstrap

### #1 — Project scaffold: Next.js 16, TypeScript, Tailwind 4, ESLint
**Labels:** setup
**Depends on:** —

**Description**
> Set up the application skeleton: Next.js 16 (App Router, Turbopack, standalone output), React 19, TypeScript strict mode, Tailwind CSS 4 via `@tailwindcss/postcss`, ESLint 9 flat config with `eslint-config-next`, and the `@/*` path alias. The scaffold ships a root layout and no pages; `npm run build` must pass.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `package.json` | 1–45 | Keep the `"test"` stub for now (#68 replaces it). Keep `prepare: husky` (#67 decides). |
| `package-lock.json` | all | |
| `tsconfig.json` | 1–33 | |
| `next.config.mjs` | 1–7, 9–12, 22–24 | Leave out line 8 (`allowedDevOrigins`, internal IP → #58) and 13–21 (redirect → #20). |
| `postcss.config.mjs` | 1–5 | |
| `eslint.config.mjs` | 1–12 | |
| `components.json` | 1–16 | shadcn config |
| `next-env.d.ts` | 1–7 | Next regenerates it; committing it is fine. |
| `.gitignore` | 1–143 | The fix of lines 68–71 lands in #2. |
| `src/lib/utils.ts` | 1–6 | `cn()` helper |
| `src/app/layout.tsx` | 1, 3, 28–33, 49–52 | Render `{children}` directly inside `<body>`; providers come in #10, #11, #12. |
| `src/app/globals.css` | 1 | Only `@import "tailwindcss";` for now; #4 adds the tokens. |

---

### #2 — Environment template and `.gitignore` fix
**Labels:** setup
**Depends on:** #1

**Description**
> Add `.env.example` documenting `BACKEND_ORIGIN` (server-only), `NEXT_PUBLIC_APP_TITLE` and `NEXT_PUBLIC_MAX_INPUT_LENGTH` (build-time, public). Un-comment the dotenv ignore rules so `.env` and `.env.*` are never committed while `.env.example` is.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `.env.example` | 1–34 | |
| `.gitignore` | 68–71 | Change to `.env`, `.env.*`, `!.env.example` (remove the `#`). |

**Notes:** Do not copy `.env`. If it was ever added, `git rm --cached .env`.

---

### #3 — Inter variable font, self-hosted
**Labels:** setup
**Depends on:** #1

**Description**
> Ship Inter as a committed variable font loaded through `next/font/local`, so the build never downloads fonts (the deployment network has no outbound access). Expose it as `--font-geist-sans` and apply it on `<body>`.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/app/fonts/InterVariable.woff2` | binary | |
| `src/app/fonts/InterVariable-Italic.woff2` | binary | |
| `src/app/layout.tsx` | 4, 11–18, 33 | `localFont` + `className` on body |
| `src/app/globals.css` | 187, 192–196 | `--font-sans` mapping and `body` font-family (full token file comes in #4) |

---

### #4 — Design tokens: light/dark HSL variables and Tailwind theme mapping
**Labels:** setup, feature
**Depends on:** #1

**Description**
> Add the colour system: HSL custom properties for light and dark (`--background`, `--foreground`, `--card`, `--accent`, `--selected`, `--input`, `--tile-border`, `--sidebar-border`, `--heading-foreground`, …), a `dark` custom variant keyed on `data-theme="dark"`, and the `@theme inline` block that exposes them as Tailwind colours. Dark mode applies both via `prefers-color-scheme` and via an explicit `[data-theme]` attribute.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/app/globals.css` | 1–196 | Whole file. The three near-identical blocks (45–80, 83–116, 119–155) are de-duplicated in #55; keep them as-is here. |

---

### #5 — App icon and static metadata
**Labels:** setup
**Depends on:** #1

**Description**
> Add the SVG app icon (Next picks up `src/app/icon.svg` automatically) and the static `<title>` template `"%s - <APP_TITLE>"` with `APP_TITLE` coming from `NEXT_PUBLIC_APP_TITLE` (default "Data Agent").

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/app/icon.svg` | all | |
| `src/lib/app-title.ts` | 1–11 | `APP_TITLE`, `NEW_CHAT_TITLE`. `documentTitle()` (13–22) comes in #31. |
| `src/app/layout.tsx` | 1, 9, 20–26 | `Metadata` import, `APP_TITLE` import, `metadata` export |

---

## Milestone 1 — UI primitives and theming

### #6 — shadcn primitives: Button, Card, Input
**Labels:** setup
**Depends on:** #1

**Description**
> Add the three base primitives used everywhere: `Button` (cva variants: default/destructive/outline/secondary/ghost/link, sizes default/sm/lg/icon, `asChild` via Radix Slot), `Card`, and `Input`. Dependencies: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`.

**Code to include**

| File | Lines |
|---|---|
| `src/components/ui/button.tsx` | 1–58 |
| `src/components/ui/card.tsx` | 1–18 |
| `src/components/ui/input.tsx` | 1–21 |

---

### #7 — shadcn primitives: ScrollArea and Sheet
**Labels:** setup
**Depends on:** #1

**Description**
> Add `ScrollArea` (Radix scroll area with a styled vertical scrollbar, `data-slot="scroll-area-viewport"` on the viewport so hooks can find the scrolling element) and `Sheet` (Radix dialog as a slide-in panel, `side` prop for all four edges, built-in close button).

**Code to include**

| File | Lines |
|---|---|
| `src/components/ui/scroll-area.tsx` | 1–58 |
| `src/components/ui/sheet.tsx` | 1–78 |

---

### #8 — shadcn primitives: DropdownMenu and Switch
**Labels:** setup
**Depends on:** #1

**Description**
> Add `DropdownMenu` (Root, Trigger, Content, Item with `inset` and `destructive` variants) and `Switch`.

**Code to include**

| File | Lines |
|---|---|
| `src/components/ui/dropdown-menu.tsx` | 1–73 |
| `src/components/ui/switch.tsx` | 1–31 |

---

### #9 — Tooltip primitive with the stray-focus fix
**Labels:** setup, bug
**Depends on:** #1

**Description**
> Add `Tooltip`. Radix opens a tooltip on *any* focus event; a trigger that was clicked keeps DOM focus, so switching tabs and coming back re-fires focus and the tooltip pops open with the pointer nowhere near it. `TooltipTrigger` wraps `onFocus` and calls `preventDefault()` unless the element matches `:focus-visible`, so only real keyboard focus opens it. Default `delayDuration` is 0 and `sideOffset` 0.

**Code to include**

| File | Lines |
|---|---|
| `src/components/ui/tooltip.tsx` | 1–79 (the fix is 31–54) |

---

### #10 — Theme provider, pre-paint theme script and theme toggle
**Labels:** feature
**Depends on:** #4, #6, #8

**Description**
> Light / dark / system theme. `ThemeProvider` stores the choice under `localStorage["theme"]`, resolves "system" through `prefers-color-scheme`, and stamps `data-theme` on `<html>`. An inline script in the root layout applies the saved theme *before first paint* so there is no flash and no hydration mismatch. `ThemeToggle` is a dropdown (Sun/Moon/Monitor) whose icon is chosen by CSS (`dark:hidden` / `dark:block`), not by React state, for the same reason.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/providers/theme-provider.tsx` | 1–114 | |
| `src/components/theme-toggle.tsx` | 1–58 | `ThemeToggle` only. `SimpleThemeToggle` (60–73) is unused; do not port it (see #53). |
| `src/app/layout.tsx` | 8, 32 (`suppressHydrationWarning`), 34–43, 44, 48 | |

---

## Milestone 2 — Login stand-in

### #11 — UserProvider: Knox ID kept in localStorage with a fixed 2-hour expiry
**Labels:** feature
**Depends on:** #1

**Description**
> Until real SSO exists, the app identifies the user by a Knox ID typed once. `UserProvider` keeps `{ id, expiresAt }` under `localStorage["mock_user_id"]`, restores it on load if not expired, arms a timeout to clear it at expiry, and exposes `userId`, `setUserId`, `clearUserId`, `isReady` through `useUser()`.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/providers/user-provider.tsx` | 1–84 | This is the commented-out legacy block. Un-comment it (remove the leading `// `). #51 replaces it with the idle-timeout version. |
| `src/app/layout.tsx` | 6, 45, 47 | wrap children in `<UserProvider>` |

---

### #12 — UserGate: login screen shown until a user ID is set
**Labels:** feature
**Depends on:** #6, #11

**Description**
> Gate the whole app behind a minimal "Enter your knox ID" screen. Renders nothing until the provider has read storage (`isReady`), the form until `userId` is set, then the children. Enter key and the Continue button both submit; the button is disabled on blank input.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/components/user-gate.tsx` | 1–3, 5–11, 20–53 | Leave out 4, 12–14, 16–18 (redirect → #21). |
| `src/app/layout.tsx` | 7, 46 | wrap children in `<UserGate>` |

---

## Milestone 3 — Backend plumbing

### #13 — Same-origin proxy to the ADK backend (`/backend/*`)
**Labels:** feature, infra
**Depends on:** #1, #2

**Description**
> A catch-all route handler that forwards `GET/POST/PUT/PATCH/DELETE /backend/<path>?<query>` to `${BACKEND_ORIGIN}/<path>`. Only `accept` and `content-type` request headers are forwarded; hop-by-hop response headers (`content-encoding`, `content-length`, `transfer-encoding`, `connection`) are stripped. 500 if `BACKEND_ORIGIN` is unset, 502 if the backend is unreachable. Because the browser only ever talks to this app's origin, the backend needs no CORS and the host is a runtime setting (not baked into the client bundle). Marked `force-dynamic`.

**Code to include**

| File | Lines |
|---|---|
| `src/app/backend/[...path]/route.ts` | 1–76 |
| `.env.example` | 4–18 (already in #2; reference only) |

---

### #14 — `/api/chat` route: forward a text message to the agent run endpoint
**Labels:** feature
**Depends on:** #13

**Description**
> `POST /api/chat` takes multipart form fields `userId`, `sessionId`, `message`, optional `newSession`, validates them (400), and calls `POST ${BACKEND_ORIGIN}/apps/users/{userId}/sessions/{sessionId}/run?query=…&new_session=true` with a JSON body. Returns `{ response, timestamp }`. Backend errors are passed through with their status and body; unexpected errors give 500. Development builds log the outgoing request.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/app/api/chat/route.ts` | 1–5, 11–17, 19–25, 33–51, 53–61, 73–113 | Leave out 6–9 and 27–31 (max length → #49), 18, 52, 63–72 (image upload → #32). With no image branch, lines 61–83 collapse to the single JSON `fetch` (74–82). |

---

### #15 — Session API client: create, list, load, delete
**Labels:** feature
**Depends on:** #13

**Description**
> `SessionStorage` (static class) wraps the session endpoints through `/backend`: `createSession`, `listSessions` (tolerates three response shapes: `[["sessions",[…]]]`, a plain array, `{sessions:[…]}`), `getSession` (maps ADK events to `Message[]`: last non-thought text part per event, `author === "user"` → user role), `deleteSession`. Session title = `state.session_title` if non-empty, else the session id. Lists are sorted by `last_update_time` descending. Also adds the shared `Message` and `ChatSession` types.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/lib/types.ts` | 12–15, 20–28 | `Message` without `image`/`artifact` (→ #32, #34), plus `ChatSession` |
| `src/lib/session-api.ts` | 1 (import `ChatSession, Message` only), 4–8, 31–38, 49–51 + 54 (`ApiPart` without `inline_data`), 59–62 + 67 (`ApiEvent` without error fields), 77–84, 144–163, 197–199, 212–220, 229–246, 248–308, 310–330, 332–372, 374–396, 441–458 | Leave out 2 (→ #44), 10–29, 40–48, 52–53, 63–66, 69–75, 86–142, 165–195, 201–210, 222–227, 398–439. In the simplified mapper write `const text = (textParts[textParts.length - 1]?.text ?? "").trim(); if (!text) return null;`, and `messages` (not `collapsed`) on line 242. |

---

### #16 — Session API client: rename
**Labels:** feature
**Depends on:** #15

**Description**
> `SessionStorage.renameSession(userId, sessionId, title)` → `PATCH /backend/apps/users/{u}/sessions/{s}/title?session_title=…`. The backend declares the request model with `Depends()`, so the field travels in the query string, not a JSON body.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/session-api.ts` | 10–14, 417–439 |

---

## Milestone 4 — Chat core

### #17 — MessageItem: render a user bubble and a Markdown reply
**Labels:** feature
**Depends on:** #6, #15

**Description**
> One message row. User messages render as a filled bubble aligned right (`whitespace-pre-wrap`). Assistant messages render through `react-markdown` + `remark-gfm` with a fixed `components` map (headings, lists, blockquote, links opening in a new tab, inline vs. block code, tables wrapped in an `overflow-x-auto` div, `hr`). The map is a module-level constant on purpose: rebuilt inline, every renderer is a new component type and React remounts the whole message on each keystroke in the composer. A timestamp (time if today, else "Mon D") is shown under the bubble on hover.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/components/chat/message-item.tsx` | 1–7, 13, 24–26, 33, 35–112, 147–152 (props `message`, `isLast` only), 173–180, 189 (`const content = formatContent(message.content)`), 271–283, 285–311, 327–338 (render `{content}` on 333), 340–349, 393–401 | Leave out 8–12, 14–22, 27–32, 114–145, 153–171, 182–188, 190–269, 312–326, 351–391. |

---

### #18 — SessionSidebar: list sessions, open one, start a new chat, search
**Labels:** feature
**Depends on:** #6, #7, #15

**Description**
> Left column (`w-72`) listing the user's sessions under a "Recents" heading, newest first, with the open one highlighted (`bg-selected`). Clicking navigates to `/chat/<id>`. A "New" button navigates to `/chat/new` and tells the page to reset. A Search button swaps itself for an input that filters by title with a 150 ms debounce; it collapses back when blurred empty. Empty and "no results" states, and an error line when the list cannot be loaded. The list is reloaded every 5 s.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/components/chat/session-sidebar.tsx` | 1–6, 8–10, 12, 31–32, 35–36, 41, 64–68 + 71–72, 74–77 + 79–80, 82–86, 89, 109–130, 143–148, 170–177, 192–194 + 196, 287–295 (use `"px-2 pt-2 pb-4"` and `"justify-between mb-4"`), 345–381 (drop the `!isCollapsed &&` guards), 383–387, 409–431, 435–438 + 441–449 (no `isRenaming`), 450–451, 470–480, 535–546, 596–597, 599–603, 608–610, 629–631 | Leave out 7, 11, 13–30, 33–34, 37–40, 43–62, 69–70, 78, 81, 87–88, 90–108, 132–141, 150–168, 176, 178–190, 195, 198–285, 296–344, 388–408, 432–434, 439–440, 452–469, 482–534, 548–595, 604–607, 612–628. |

**Notes:** `isLoading` (83, 122) is never rendered; #80 uses it for a skeleton.

---

### #19 — ChatView: send a message, show the reply, Thinking… spinner
**Labels:** feature
**Depends on:** #7, #10, #14, #15, #17, #18

**Description**
> The page body. Layout: sidebar | (header with theme toggle, scrolling message pane, composer). Sending: trims input, creates a session on the first message (`SessionStorage.createSession`), rewrites the URL to `/chat/<id>` with `history.replaceState`, posts to `/api/chat`, appends the reply. While waiting the textarea is disabled and a spinner row says "Thinking…". Enter sends, Shift+Enter inserts a newline. The textarea grows with its content up to 15 rows. Opening `/chat/<id>` loads the session from the backend. Empty state shows the greeting centred in the pane (Radix wraps children in a `display:table` div, hence the `[&>div>div]:!h-full` selector).

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/components/chat/chat-view.tsx` | 1–3, 4, 5, 6 (`Send, LoaderCircle` only), 7–12, 14, 49–56, 66–71, 73 (`useState("")`), 75, 77–78, 107, 153–161, 305, 307–319, 336–337 + 339–340, 342, 347–349, 353–359 (use `setInput("")` instead of `restoreDraft`), 415–421, 424 (`setInput("")`), 428–462, 464, 466, 472–480, 481–484, 496–513 (skip 512), 514–516, 524–529, 531–537, 541–550, 553, 563–564, 574–577, 579–603, 626–631, 646–649, 652–653, 655–672, 686–689, 691–693, 703 + 707 (plain `<div className="rounded-2xl bg-input dark:bg-zinc-800 p-2 transition-shadow focus-within:shadow-md">`) + 710, 711–719 (`setInput` + `fitToText`), 720–729, 731–732, 773–786 (776: `disabled={isSending \|\| !input.trim()}`), 794–806 | Leave out everything claimed by #22, #31, #32, #35, #36, #37, #38, #40, #42, #43, #46, #49, #52. |

**Notes:** In the `messages.map` keep only `key`, `<MessageItem message isLast />`. `sidebarOpen` (76, 214–218, 318, 354, 552, 555–561) is never set to `true` anywhere; do not port it (see #52).

---

### #20 — Routes: `/chat/new`, `/chat/[sessionId]`, and `/` redirect
**Labels:** feature
**Depends on:** #19

**Description**
> Two App Router pages that render `ChatView`, the dynamic one awaiting `params` (Next 16 promise params) and passing `initialSessionId`. `/` redirects to `/chat/new` (non-permanent) from `next.config.mjs`.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/app/chat/new/page.tsx` | 3, 8–14 | metadata lines 1, 4, 6 come with #31 |
| `src/app/chat/[sessionId]/page.tsx` | 1–14 | |
| `next.config.mjs` | 13–21 | `redirects()` |

---

### #21 — Logout always lands on `/chat/new`
**Labels:** bug
**Depends on:** #12, #20

**Description**
> A logout (button or expiry) on `/chat/<id>` left that URL behind, so the next person to log in on the same browser opened someone else's session. `UserGate` now `router.replace("/chat/new")` whenever it is showing the login form on any other path. Source: `changes_20260922.md`, Change A.

**Code to include**

| File | Lines |
|---|---|
| `src/components/user-gate.tsx` | 4, 12–14, 16–18 |

---

### #22 — Suggested questions on the empty state
**Labels:** feature
**Depends on:** #19

**Description**
> Under the greeting, show up to four tiles loaded at runtime from `public/suggested-questions.json` (`title`, `question`, `icon`). Clicking a tile puts the question into the composer and focuses it. Editing the JSON changes the tiles without a rebuild.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `public/suggested-questions.json` | 1–22 | |
| `src/components/chat/chat-view.tsx` | 4 (Card), 6 (`ChevronRight`), 19–23, 95–97, 171–182 (inside the existing mount effect), 604–625 | On 610–611 use `setInput(sq.question); inputRef.current?.focus();` until #35 introduces `applyInput`/`focusInputEnd`. |

**Notes:** `icon` is in the JSON but never rendered; decide whether to render Lucide icons by name or remove the field.

---

### #23 — Copy a message as plain text (works over plain HTTP)
**Labels:** feature
**Depends on:** #9, #17

**Description**
> A copy button under every message. Assistant Markdown is converted to what the reader *sees*: headings/emphasis/inline code/link syntax dropped (link keeps its label), fenced code kept verbatim, table rows become tab-separated cells so they paste into Excel as columns. `navigator.clipboard` only exists in secure contexts and the app is served over LAN HTTP, so `copyText` falls back to a hidden textarea + `execCommand("copy")`. Shows a check mark and "Copied!" for 2 s.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/clipboard.ts` | 1–46 |
| `src/lib/markdown-text.ts` | 1–126 |
| `src/components/chat/message-item.tsx` | 8, 10, 15 (`Check, Copy`), 17–22, 153, 157–171, 351–371 |

---

## Milestone 5 — Sidebar features

### #24 — Collapsible sidebar, remembered across navigations and reloads
**Labels:** feature
**Depends on:** #9, #18

**Description**
> A `PanelLeft` button collapses the sidebar to a 56 px icon rail (new-chat icon with a tooltip) and back. The state is written to `localStorage["sidebar_collapsed"]` and mirrored in a module-level variable, because `/chat/new` and `/chat/[id]` each mount their own sidebar and would otherwise reset it on every navigation.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 19–24, 38, 43–62, 87, 179–190, 290–295 (conditional classes), 322–342, 345/356 (`!isCollapsed &&` guards), 388–408, 604–607 |

**Notes:** 331–335 render the same icon in both branches; collapse to one `<PanelLeft />` (or use `PanelLeftOpen`/`PanelLeftClose`).

---

### #25 — Mobile sidebar in a Sheet
**Labels:** feature
**Depends on:** #7, #18

**Description**
> Below `md`, hide the column and show a fixed top-left button that opens the same sidebar content in a left `Sheet`. Selecting a session, New, or Log out closes it.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 13, 88, 176, 195, 612–628 (and `setIsMobileOpen(false)` on 272 once #29 lands) |

---

### #26 — Per-session menu: delete with confirmation
**Labels:** feature
**Depends on:** #8, #18

**Description**
> A `⋮` button on hover (kept visible while its menu is open) with a Delete item. Deleting asks `confirm()`, calls `SessionStorage.deleteSession`, and if the deleted chat was the open one navigates to `/chat/new`; then the list reloads.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/components/chat/session-sidebar.tsx` | 25–30, 33, 37, 90, 198–208, 211–225, 482–503, 509, 524–534 | 209–210 (draft cleanup) come with #35. The `onCloseAutoFocus` handler 504–508 comes with #28. |

---

### #27 — Per-session menu: copy title
**Labels:** feature
**Depends on:** #23, #26

**Description**
> "Copy" menu item puts the session title on the clipboard via `copyText`.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 7, 34, 278–285, 510–516 |

---

### #28 — Per-session menu: inline rename
**Labels:** feature
**Depends on:** #16, #26

**Description**
> "Rename" turns the title into an input with the whole title pre-selected (Windows-style). Enter saves, Escape abandons, blur saves; a ref distinguishes the two since both leave through blur, so the save fires exactly once. The optimistic title is shown immediately; the 5 s list reload is the source of truth, so a rejected rename reverts on its own. Radix returns focus to the menu trigger when the menu closes, which would steal it from the new input; `onCloseAutoFocus` is prevented only for Rename. The select is done one frame late because the closing dropdown is still moving focus.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 39, 91–107, 150–168, 227–269, 432–434, 439, 446–448, 452–469, 504–508, 517–523 |

---

### #29 — Account row with user initial and Log out
**Labels:** feature
**Depends on:** #8, #11, #18

**Description**
> Bottom of the sidebar: a 32 px circle with the user's initial, the user ID (hidden when collapsed), and a dropdown with "Log out" that calls `clearUserId()`. Fixed `w-[17rem]` menu so the collapsed rail opens the same menu.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 40, 81, 271–276, 548–595 |

---

### #30 — Wordmark and logo button (home affordance)
**Labels:** feature
**Depends on:** #18
**Blocked by:** missing `src/app/dice_icon.png`

**Description**
> Replace the header text with the DICE icon + "Data Agent" SVG wordmark. The pair is a `<button>` that runs the same handler as "New", so a click resets the open chat and closes the mobile sheet. It is a plain `<button>`, not `Button`, because `Button` forces every child `svg` to 16 px. In dark theme the button keeps a light background so the dark icon stays legible (`changes_20260922.md`, Change C).

**Code to include**

| File | Lines |
|---|---|
| `src/components/data-agent-wordmark.tsx` | 1–51 |
| `src/app/dice_icon.png` | **must be added — not on disk** |
| `src/components/chat/session-sidebar.tsx` | 14–17, 296–320 |

---

### #31 — Sidebar polling keeps the browser tab title in sync
**Labels:** feature
**Depends on:** #5, #18, #19

**Description**
> Tab title is "New Chat - Data Agent" on `/chat/new` and "<session title> - Data Agent" on a session. Route metadata cannot cover the second case (the title is fetched client-side), so `ChatView` writes `document.title`. The backend generates a title after the first reply and renames can come from another tab, and the sidebar's 5 s poll is the only place those show up, so the sidebar reports the open session's title upward through `onCurrentSessionTitleChange`. An unknown title renders just the app name, matching what the server sent, so there is no placeholder flash.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/app-title.ts` | 13–22 |
| `src/app/chat/new/page.tsx` | 1, 4, 6 |
| `src/components/chat/session-sidebar.tsx` | 69–70, 78, 132–141 |
| `src/components/chat/chat-view.tsx` | 16 (`documentTitle`), 91–93, 234–239, 317, 353, 551 |

---

## Milestone 6 — Image attachments

### #32 — Attach one image in the composer (picker, drag-and-drop, chip)
**Labels:** feature
**Depends on:** #14, #19

**Description**
> Paperclip button opens a hidden `<input type="file">` restricted to `.jpg .jpeg .bmp .png .tiff .tif`; the composer is also a drop target (ring while dragging, placeholder changes). Wrong types show a red line for 5 s. The chosen file appears as a removable chip in place of the paperclip. On send it goes in the multipart form as `file`; `/api/chat` forwards it to the backend as `image_file` multipart. A sent message carries the image as a data URL.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/types.ts` | 16–18 (`image?: string`) |
| `src/app/api/chat/route.ts` | 18, 52, 61–72 (re-introduce the `let` + image branch; 73–83 becomes the `else`) |
| `src/components/chat/chat-view.tsx` | 6 (`Paperclip, X`), 35–47, 58–64, 99–101, 108, 220–226, 351–352, 361–413, 422, 425–426, 463, 492–494, 694–710, 733–771, 776 (`\|\| (!input.trim() && !attachedFile)`), 788–792 |

---

### #33 — Show the attached image inside the user bubble
**Labels:** feature
**Depends on:** #17, #32

**Description**
> Decode the data URL to a Blob object URL (tolerates URL-safe base64 and missing padding, logs and shows "Preview unavailable" on bad input), render it under the text with `max-h-80`, revoke the object URL on unmount.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/message-item.tsx` | 114–145, 154–155, 182–183, 201–204, 208–228 (+ closing of the effect, dependency `[message.image]`), 312–326 |

---

### #34 — Restore attachments when a session is reopened
**Labels:** feature
**Depends on:** #15, #33

**Description**
> A user turn that carried a file comes back as two text parts: an "uploaded artifact:" header (`filename:`, `data_uri:`, `content_type:`) and the typed message. The header is lifted out and turned into a `MessageArtifact { url, filename, mimeType }` pointing at `/backend/apps/users/{u}/sessions/{s}/artifact?data_uri=…&filename=…&media_type=…`; only `image/*` is kept. Inline `inline_data` blobs are also recognised. `MessageItem` fetches the artifact as a Blob (`SessionStorage.loadArtifact`), shows a pulsing placeholder meanwhile, and keys the effect on the URL (the message object is rebuilt on every load).

**Code to include**

| File | Lines |
|---|---|
| `src/lib/types.ts` | 1–10, 19 |
| `src/lib/session-api.ts` | 1 (`MessageArtifact`), 16–29, 40–48, 52–53, 86–142, 165–195, 204 (`!text && !image && !artifact`), 216–217, 398–415 |
| `src/components/chat/message-item.tsx` | 9, 206, 230–269 |

---

## Milestone 7 — Reply and composer experience

### #35 — Drafts: unsent text survives reload and switching chats
**Labels:** feature
**Depends on:** #19, #26

**Description**
> Every change to the composer is written to `localStorage["chat_draft:<sessionId|new>"]`; empty drafts delete the key. On load, on opening another chat from the sidebar, and on New, the right draft is restored with the caret at the end and the textarea re-fitted. Deleting a session clears its draft.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/draft-storage.ts` | 1–39 |
| `src/components/chat/chat-view.tsx` | 15, 73 (`readDraft(initialSessionId ?? "")`), 118–151, 228–232, 335, 350, 424 (`applyInput("")`), 610–611, 716 (`applyInput`) |
| `src/components/chat/session-sidebar.tsx` | 11, 209–210 |

---

### #36 — Pin the sent question to the top of the pane
**Labels:** feature
**Depends on:** #19

**Description**
> After sending, the pane scrolls so the user's question sits at the top (0.5 rem margin) and the reply grows beneath it, instead of the question sitting at the bottom. A 60 vh spacer under the list guarantees the last question can reach the top even with a short reply.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 103, 110, 185–198, 468, 539, 630–645 (ref + `scrollMarginTop`), 679–685 |

---

### #37 — Jump to the end when opening an existing session
**Labels:** feature
**Depends on:** #19

**Description**
> Opening `/chat/<id>` scrolls straight to the last message (no smooth animation). The sentinel sits *under* the spinner so a session opened mid-reply (#46) lands on the "Thinking…" row.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 104, 111, 200–212, 313, 674–677 |

---

### #38 — Reveal a new reply word by word
**Labels:** feature
**Depends on:** #17, #19

**Description**
> The reply arrives complete; only the slice on screen grows. `useWordReveal` advances a cursor one word per frame budget at 20 words/s, faster for long replies so nothing takes more than 5 s. Only the reply that just came back animates (`revealIndex`); history read from a session renders instantly, and a new send cancels any reveal in progress. `prefers-reduced-motion: reduce` shows the whole reply at once.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/components/chat/use-word-reveal.ts` | 1–60 | |
| `src/lib/markdown-stream.ts` | 1–31 | `nextWordEnd`, `countWords` (file header comment 1–9 can come now) |
| `src/components/chat/message-item.tsx` | 12, 29–32 (`reveal` prop), 151, 185–190, 196–199 (as `const markdown = revealed;` until #39), 333 | |
| `src/components/chat/chat-view.tsx` | 81–84, 112, 315, 348, 471, 512, 632–638, 650 | |

---

### #39 — Keep partially revealed Markdown well-formed (incl. last table row bug)
**Labels:** feature, bug
**Depends on:** #38

**Description**
> A prefix of Markdown is not Markdown: cut mid-table the renderer shows a stray one-cell row; cut inside a fence it swallows the rest of the answer into a code block; cut inside `**` or `` ` `` it shows literal punctuation. `guardPartialMarkdown` drops the trailing unfinished table row, closes an odd fence, and balances `**`/`` ` `` (ignoring markers inside fenced code). Bug fixed on the way: the guard must only run while the text is actually partial, otherwise a reply that *ends* with a table loses its last row permanently (`BUGFIX_TABLE_LAST_ROW.md`).

**Code to include**

| File | Lines |
|---|---|
| `src/lib/markdown-stream.ts` | 33–104 |
| `src/components/chat/message-item.tsx` | 11, 192–199 |

---

### #40 — Follow the reply as it reveals, without fighting the reader
**Labels:** feature
**Depends on:** #38

**Description**
> While a reply types itself out and runs past the bottom of the pane, scroll down by exactly the overflow (24 px padding). Never scroll up. If the reader scrolls up, stop following; if they come back within 48 px of the bottom, resume. Implemented with a `ResizeObserver` on the revealing message and a scroll listener on the Radix viewport. Disabled under `prefers-reduced-motion`.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/use-follow-reveal.ts` | 1–92 |
| `src/components/chat/chat-view.tsx` | 13, 109, 114–116, 589 |

---

### #41 — Per-word fade-in (rehype plugin) — wire it or drop it
**Labels:** feature, decision
**Depends on:** #38

**Description**
> `rehype-reveal-words.ts` wraps every word in `<span class="reveal-word">` with a negative `animation-delay` so each word fades in once and never re-animates on re-render. It exists in the codebase but is **not imported anywhere and there is no `.reveal-word` keyframe in `globals.css`**, so it currently does nothing. Decide: (a) wire it (`rehypePlugins={[rehypeRevealWords]}` in `MessageItem`, a `@keyframes` + `.reveal-word { animation: … both }` rule, `@media (prefers-reduced-motion)` off-switch) or (b) delete the file. Do not merge it unwired.

**Code to include (option a)**

| File | Lines |
|---|---|
| `src/lib/rehype-reveal-words.ts` | 1–103 |
| `src/components/chat/message-item.tsx` | new `rehypePlugins` prop on 329–334 |
| `src/app/globals.css` | new keyframes |

---

## Milestone 8 — Waiting state and error handling

### #42 — Error bubble when a send fails
**Labels:** feature
**Depends on:** #19

**Description**
> A failed `/api/chat` call appends an assistant message with the fixed line "Sorry, I encountered an error. Please try again." instead of leaving the question unanswered. The string lives in one module because #44 reuses it.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/error-reply.ts` | 1–4 |
| `src/components/chat/chat-view.tsx` | 17, 517–523 |

---

### #43 — "Could not connect to the backend" banner
**Labels:** feature
**Depends on:** #19

**Description**
> A red banner above the header when a session cannot be created or loaded. It never clears today; #66 fixes that.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 79, 338, 451–452, 565–572 |

---

### #44 — Error events in history render as the same error line
**Labels:** bug
**Depends on:** #15, #42

**Description**
> An event that ended in an error carries `error_code`/`error_message` (snake or camel case) and no text. Previously it was dropped, so reopening the session showed a user turn with no reply and (after #46) waited forever. It now maps to an assistant message with `ERROR_REPLY`, keeping the timestamp.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/session-api.ts` | 2, 56–58, 63–66, 69–75, 201–210 |

---

### #45 — A loaded session shows only the final reply of each turn
**Labels:** bug
**Depends on:** #15

**Description**
> Text the agent emits before a tool call is narration, not the answer. A run of consecutive assistant events now collapses to the last one, so history matches what the user saw live. Source: `changes_20260922.md`, Change B.

**Code to include**

| File | Lines |
|---|---|
| `src/lib/session-api.ts` | 222–227, 242 (`messages: collapsed`) |

---

### #46 — Waiting state when a session is opened mid-reply
**Labels:** feature
**Depends on:** #37, #38, #44

**Description**
> If a session's last message is the user's and it is younger than 10 min, the reply is still on its way (sent from another page or tab). The view shows the same spinner and disabled composer as after a send and polls `getSession` every 3 s until an assistant message appears, then lands it with the normal reveal. Gives up after 10 min. New chat cancels the wait. Full write-up: `WAITING_STATE.md`.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 24–33, 86–90, 241–248, 250–303, 320–331, 345 |

---

### #47 — Follow-up: use the backend `run_state` instead of the timestamp heuristic
**Labels:** feature, decision
**Depends on:** #46, backend change

**Description**
> The 10-minute age heuristic cannot tell "still running" from "died silently". `update_waiting.md` specifies reading `run_state` from the session detail (and a `getRunState` method) and polling on that. Needs the backend to expose it first. No code exists yet; the md file is the spec.

---

### #48 — Keep the login alive while a reply is pending
**Labels:** bug, decision
**Depends on:** #19, #51

**Description**
> With idle logout (#51) a long-running agent reply can log the user out mid-wait because waiting is not "activity". `UserProvider.keepAlive()` exists for this; `ChatView` was calling it on an interval while `isSending` but that block was reverted locally (`git diff src/components/chat/chat-view.tsx` shows it removed). Decide whether to re-add it. Spec and snippet: `fix_keep_alive.md`.

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | the removed block from `git diff` (constant `PENDING_REPLY_KEEP_ALIVE_MS = 60_000`, `const { userId, keepAlive } = useUser()`, and an effect: `if (!isSending) return; keepAlive(); const t = setInterval(keepAlive, …); return () => clearInterval(t)`) |

---

### #49 — Enforce `NEXT_PUBLIC_MAX_INPUT_LENGTH` end to end
**Labels:** bug
**Depends on:** #14, #19

**Description**
> The server returns 413 above the limit, and `ChatView` reads the env into `maxLength` state, **but never applies it**: the state is unused and the textarea has no `maxLength`. Add `maxLength={maxLength}` to the textarea, a `n / max` counter near the hint, and drop the dead `useState(1000)` initial value in favour of a constant.

**Code to include**

| File | Lines |
|---|---|
| `.env.example` | 30–34 |
| `src/app/api/chat/route.ts` | 6–9, 27–31 |
| `src/components/chat/chat-view.tsx` | 74, 163–169, plus the new `maxLength` attribute on 712–729 |

---

### #50 — Surface the server's error text instead of a generic failure
**Labels:** bug
**Depends on:** #42, #49

**Description**
> `handleSend` calls `response.json()` without checking `response.ok`. A 413 or a backend 4xx returns plain text, so `json()` throws and the user sees the generic error line. Check `ok`, read `text()` on failure, and show that (e.g. "Input exceeds maximum length").

**Code to include**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 496–507 (restructure) |
| `src/app/api/chat/route.ts` | 85–96 (already passes text through; reference) |

---

### #51 — Idle-timeout logout with activity tracking and cross-tab sync
**Labels:** feature
**Depends on:** #11

**Description**
> Replace the fixed 2-hour session with a 30-minute idle timeout. Activity = pointer/keyboard/wheel/scroll/touch events (captured, passive), the tab becoming visible, or an explicit `keepAlive()`. Writes are throttled to one per 15 s. A `storage` listener makes one active tab keep every tab logged in and one logout log every tab out. A background tab whose timer was throttled logs out on the next activity if the window already passed.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `src/providers/user-provider.tsx` | 86–289 | Replaces 1–84 from #11. Delete the commented block; do not carry it over. |

---

## Milestone 9 — Hardening and cleanup

### #52 — Remove dead mobile-overlay state and the unused `messages` form field in ChatView
**Labels:** cleanup
**Depends on:** #19, #25

**Description**
> `sidebarOpen` is never set to `true` (the sidebar owns its own Sheet), so the overlay, the focus effect and the `className` toggle are dead. The form also sends `messages` (whole history as JSON) which `/api/chat` never reads.

**Code to remove (do not port if not yet ported)**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 76, 214–218, 318, 354, 485–490, 552, 555–561 |

---

### #53 — Remove unused components, props and helpers
**Labels:** cleanup
**Depends on:** #10, #17, #18

**Code to remove**

| File | Lines | Why |
|---|---|---|
| `src/components/theme-toggle.tsx` | 60–73 | `SimpleThemeToggle` unused (then `switch.tsx` is unused too; keep or drop) |
| `src/components/chat/message-item.tsx` | 27, 373–391 | `onRegenerate` is never passed |
| `src/components/chat/message-item.tsx` | 173–178 | `formatContent` only guards a `string`-typed field |
| `src/components/chat/session-sidebar.tsx` | 331–335 | identical branches |

---

### #54 — Remove undefined CSS tokens (`--chart-*`, `--font-geist-mono`)
**Labels:** cleanup
**Depends on:** #4

**Description**
> `--color-chart-1..5` and `--font-mono` map to variables that are never defined anywhere.

**Code to remove**

| File | Lines |
|---|---|
| `src/app/globals.css` | 182–186, 188 |

---

### #55 — De-duplicate the three colour blocks in `globals.css`
**Labels:** cleanup
**Depends on:** #4

**Description**
> Lines 45–80 (`@media dark`), 83–116 (`[data-theme=dark]`) and 119–155 (`[data-theme=light]`) repeat the same values. The pre-paint script always sets `data-theme`, so collapse to `:root` (light) + `[data-theme="dark"]`, and if the media query must stay, scope it as `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` so each value exists once.

---

### #56 — Enter during Korean IME composition sends the message early
**Labels:** bug
**Depends on:** #19

**Description**
> The composer uses the deprecated `onKeyPress`. With a Hangul IME, pressing Enter to commit a composition fires a key event and the half-typed message is sent. Switch to `onKeyDown`, ignore the event when `e.nativeEvent.isComposing` (or `e.keyCode === 229`), keep Shift+Enter for newline.

**Code to change**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 531–537, 720 |

---

### #57 — Make `npm run lint` clean: effect deps, list keys, `<img>` rule
**Labels:** cleanup
**Depends on:** #19, #33

**Description**
> (1) The session-load effect (153–161) calls `loadSessionFromBackend`, declared after an early return at 305 and missing from the dependency list; move it into a `useCallback` above the effects. (2) `key={index}` on 631 — use a stable key (timestamp + role + index). (3) The attachment `<img>` on `message-item.tsx:320` must stay a plain `<img>` (object URLs cannot go through `next/image`); add the one-line eslint disable with the reason.

---

### #58 — Remove hard-coded internal hosts from config
**Labels:** infra
**Depends on:** #1

**Description**
> `allowedDevOrigins` carries a LAN IP. Read it from an env var so the public repo has no site-specific addresses.

**Code to change**

| File | Lines | Change |
|---|---|---|
| `next.config.mjs` | 8 | `allowedDevOrigins: process.env.DEV_ORIGINS?.split(",") ?? []` |
| `.env.example` | add `DEV_ORIGINS` | |

---

### #59 — Restrict the proxy to the session API paths
**Labels:** security
**Depends on:** #13

**Description**
> `/backend/[...path]` forwards any path and method to the backend. Allow only `apps/users/<id>/sessions…` (and the artifact sub-path), reject the rest with 404, and consider dropping `PUT`.

**Code to change**

| File | Lines |
|---|---|
| `src/app/backend/[...path]/route.ts` | 26–30 (path check), 70–74 (exports) |

---

### #60 — Show "Untitled chat" instead of the raw session id
**Labels:** feature
**Depends on:** #15

**Description**
> Until the backend generates a title, the sidebar shows a UUID. Use a placeholder and keep the id for search by id if needed.

**Code to change**

| File | Lines |
|---|---|
| `src/lib/session-api.ts` | 233–237, 294–299 |

---

### #61 — Replace the native `confirm()` for delete with a dialog
**Labels:** feature
**Depends on:** #26

**Description**
> `@radix-ui/react-dialog` is already a dependency (Sheet). Add an `AlertDialog`-style confirmation that matches the theme and is keyboard-accessible.

**Code to change**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 204 |

---

### #62 — Pause polling while the tab is hidden
**Labels:** cleanup
**Depends on:** #18, #46

**Description**
> The 5 s session-list poll and the 3 s reply poll keep running in background tabs. Skip ticks while `document.visibilityState !== "visible"` and refresh once on return.

**Code to change**

| File | Lines |
|---|---|
| `src/components/chat/session-sidebar.tsx` | 126–130 |
| `src/components/chat/chat-view.tsx` | 250–303 |

---

### #63 — Centralise user-facing strings (greeting is Korean, rest is English)
**Labels:** cleanup
**Depends on:** #19, #22

**Description**
> The empty-state greeting (`chat-view.tsx:600–602`) and the suggested questions are Korean; buttons, placeholders, hints and errors are English. Move strings to `src/lib/strings.ts` (or make the greeting part of `suggested-questions.json`) so the language can be switched in one place.

---

### #64 — Use the shared Tooltip for the attach button
**Labels:** cleanup
**Depends on:** #9, #32

**Description**
> The attach button has a hand-rolled CSS tooltip while every other icon uses `Tooltip`. Unify.

**Code to change**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 752–770 |

---

### #65 — Accessibility pass on the chat screen
**Labels:** cleanup
**Depends on:** #19, #25, #32

**Description**
> Add `aria-label` to the mobile sidebar trigger (`session-sidebar.tsx:616–622`) and the textarea (`chat-view.tsx:712`), `role="alert"` on the file error (788–792) and the backend banner (565–572), `aria-live="polite"` on the Thinking… row (655–672), and make the hover-only action row reachable by keyboard (`message-item.tsx:341–345` uses `opacity-0 group-hover:opacity-100`; add `group-focus-within:opacity-100`).

---

### #66 — Clear the backend-error banner on the next success
**Labels:** bug
**Depends on:** #43

**Description**
> Once shown, the red banner stays for the life of the page even after the backend is back. Reset it after a successful load or session creation.

**Code to change**

| File | Lines |
|---|---|
| `src/components/chat/chat-view.tsx` | 309–311, 439–445 (`setIsBackendError(false)` after success) |

---

## Milestone 10 — Tests, CI, Docker, docs

### #67 — Husky: add a real pre-commit hook or remove Husky
**Labels:** infra
**Depends on:** #1

**Description**
> `package.json:11` runs `husky` on `prepare`, but `.husky/` contains only the generated `_` directory and no hooks, so it does nothing. Either add `.husky/pre-commit` running `npm run lint && npx tsc --noEmit`, or remove the dependency and the script.

---

### #68 — Test runner: Vitest
**Labels:** tests
**Depends on:** #1

**Description**
> `npm test` is a stub (`package.json:10`). Add Vitest (`environment: node` default, `jsdom` for hooks later), a `vitest.config.ts` with the `@/` alias, and `"test": "vitest run"`.

---

### #69 — Unit tests for `markdownToPlainText`
**Labels:** tests
**Depends on:** #23, #68

**Description**
> Cover: headings stripped, `**bold**`/`_em_` stripped but `snake_case` kept, inline code and escapes preserved, link keeps label, fenced block verbatim (both ``` and ~~~), table → tab-separated with separator row dropped, horizontal rule → blank, CRLF input.

---

### #70 — Unit tests for `guardPartialMarkdown`, `nextWordEnd`, `countWords`
**Labels:** tests
**Depends on:** #39, #68

**Description**
> Cover: trailing unfinished table row dropped, odd fence closed, `**` closed / trailing lone `**` dropped, markers inside fences ignored, and the regression from `BUGFIX_TABLE_LAST_ROW.md` (complete text ending in a table is untouched when not partial).

---

### #71 — Unit tests for session mapping
**Labels:** tests
**Depends on:** #34, #44, #45, #68

**Description**
> Export the pure helpers (`parseListSessionsResponse`, `mapApiSessionDetail`, `parseUploadedArtifact`) or test through a mocked `fetch`. Cover the three list shapes, title fallback, last-text-part selection, thought parts skipped, artifact header lifted out, non-image artifact left as text, error event → `ERROR_REPLY`, consecutive assistant events collapsed.

---

### #72 — GitHub Actions: lint, typecheck, test, build on every PR
**Labels:** infra
**Depends on:** #68

**Description**
> `.github/workflows/ci.yml`: Node 22, `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` (with `NEXT_TELEMETRY_DISABLED=1`, `HUSKY=0`). Cache `~/.npm` and `.next/cache`.

---

### #73 — Issue and PR templates
**Labels:** infra
**Depends on:** —

**Description**
> `.github/PULL_REQUEST_TEMPLATE.md` (Closes #, what/why, how verified) and `ISSUE_TEMPLATE/bug.md`, `feature.md`.

---

### #74 — Docker image (multi-stage, standalone output) with a parametrised base image
**Labels:** infra
**Depends on:** #1, #2

**Description**
> Three-stage build (deps → builder → runner) on `node:22-alpine`, `HUSKY=0`, `NEXT_PUBLIC_*` as build args, standalone output copied into the runner, `USER node`, port 13080. Make the registry a build arg (`ARG BASE_IMAGE=node:22-alpine`) and **remove the default `BACKEND_ORIGIN` IP** (require it at `docker run -e`). `.dockerignore` keeps the context small and excludes every `.env*` but the example.

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `Dockerfile` | 1–50 | Prefer the commented version in `git show HEAD:Dockerfile` (the local diff only stripped comments and renamed the work dir). Replace lines 1, 10, 29 with `FROM ${BASE_IMAGE}` and drop line 39. |
| `.dockerignore` | 1–29 | |
| `run_da_frontend.sh` | 1–2 | Rename the network/host to placeholders. |

---

### #75 — `DEPLOY.md`: server deployment guide
**Labels:** docs
**Depends on:** #74

**Code to include**

| File | Lines |
|---|---|
| `DEPLOY.md` | 1–139 (scrub internal hostnames/IPs) |

---

### #76 — `README.md` (currently empty)
**Labels:** docs
**Depends on:** #1, #2

**Description**
> What the app is (UI for the DICE Data Agent on ADK), prerequisites, `cp .env.example .env`, `npm ci`, `npm run dev`, scripts, env table, link to `STRUCTURE.md` and `DEPLOY.md`.

---

### #77 — `STRUCTURE.md` and `UI_SIZING.md` with the stale env name fixed
**Labels:** docs
**Depends on:** #13

**Code to include**

| File | Lines | Notes |
|---|---|---|
| `STRUCTURE.md` | 1–472 | Lines 59 and 78 still say `NEXT_PUBLIC_API_BASE_URL`; the app uses `BACKEND_ORIGIN` (server-side). Fix and re-check the "Path A: browser → backend directly" section, which predates the proxy. |
| `UI_SIZING.md` | 1–66 | |

---

### #78 — Decide the fate of the working notes
**Labels:** docs, decision
**Depends on:** —

**Description**
> `WAITING_STATE.md`, `BUGFIX_TABLE_LAST_ROW.md`, `changes_20260922.md`, `fix_keep_alive.md`, `update_waiting.md`, `MIGRATION_GUIDE.md` are session notes whose content is now in the issues above. Either move them to `docs/notes/` with a one-line index, or drop them from the new repo. Do not commit `AGENTS.md` / `CLAUDE.md` unless the team uses them (`next dev` re-creates the block anyway).

---

### #79 — Dependabot for npm and GitHub Actions
**Labels:** infra
**Depends on:** #72

**Description**
> `.github/dependabot.yml`, weekly, grouped minor/patch updates.

---

### #80 — Loading skeleton for the session list
**Labels:** feature
**Depends on:** #18

**Description**
> First paint of the sidebar shows "No conversations yet" for a moment before the list arrives. Use the existing `isLoading` state (`session-sidebar.tsx:83`) to show three grey rows instead.

---

## Quick index

| # | Title | Type |
|---|---|---|
| 1 | Project scaffold | setup |
| 2 | Env template + gitignore fix | setup |
| 3 | Inter font | setup |
| 4 | Design tokens | setup |
| 5 | Icon + static metadata | setup |
| 6 | Button / Card / Input | setup |
| 7 | ScrollArea / Sheet | setup |
| 8 | DropdownMenu / Switch | setup |
| 9 | Tooltip + focus fix | setup/bug |
| 10 | Theme provider + toggle | feature |
| 11 | UserProvider (2 h) | feature |
| 12 | UserGate login screen | feature |
| 13 | Backend proxy route | feature |
| 14 | /api/chat text | feature |
| 15 | Session API core | feature |
| 16 | Session API rename | feature |
| 17 | MessageItem core | feature |
| 18 | Sidebar core | feature |
| 19 | ChatView core | feature |
| 20 | Routes + redirect | feature |
| 21 | Logout → /chat/new | bug |
| 22 | Suggested questions | feature |
| 23 | Copy as plain text | feature |
| 24 | Collapsible sidebar | feature |
| 25 | Mobile sheet | feature |
| 26 | Delete session | feature |
| 27 | Copy title | feature |
| 28 | Inline rename | feature |
| 29 | Account row + logout | feature |
| 30 | Wordmark + logo (blocked: PNG) | feature |
| 31 | Tab title sync | feature |
| 32 | Attach image | feature |
| 33 | Image in bubble | feature |
| 34 | Restore attachments | feature |
| 35 | Drafts | feature |
| 36 | Pin question to top | feature |
| 37 | Jump to end on open | feature |
| 38 | Word reveal | feature |
| 39 | Partial Markdown guard + table bug | feature/bug |
| 40 | Follow reveal scroll | feature |
| 41 | Rehype fade-in (decision) | decision |
| 42 | Error bubble | feature |
| 43 | Backend banner | feature |
| 44 | Error events in history | bug |
| 45 | Collapse turn to final reply | bug |
| 46 | Waiting state mid-reply | feature |
| 47 | run_state follow-up | decision |
| 48 | Keep-alive while pending (decision) | decision |
| 49 | Max input length enforced | bug |
| 50 | Surface server error text | bug |
| 51 | Idle logout + cross-tab | feature |
| 52 | Dead overlay state + messages field | cleanup |
| 53 | Unused components/props | cleanup |
| 54 | Undefined CSS tokens | cleanup |
| 55 | Dedupe colour blocks | cleanup |
| 56 | IME Enter bug | bug |
| 57 | Lint clean | cleanup |
| 58 | Internal hosts out of config | infra |
| 59 | Restrict proxy paths | security |
| 60 | Untitled chat placeholder | feature |
| 61 | Delete dialog | feature |
| 62 | Pause polling when hidden | cleanup |
| 63 | Centralise strings | cleanup |
| 64 | Shared tooltip for attach | cleanup |
| 65 | Accessibility pass | cleanup |
| 66 | Clear banner on success | bug |
| 67 | Husky hook or removal | infra |
| 68 | Vitest | tests |
| 69 | Tests: markdown-text | tests |
| 70 | Tests: markdown-stream | tests |
| 71 | Tests: session mapping | tests |
| 72 | CI workflow | infra |
| 73 | Issue/PR templates | infra |
| 74 | Docker image | infra |
| 75 | DEPLOY.md | docs |
| 76 | README.md | docs |
| 77 | STRUCTURE.md / UI_SIZING.md | docs |
| 78 | Working notes decision | docs |
| 79 | Dependabot | infra |
| 80 | Sidebar loading skeleton | feature |





Written for: you, as the person who will register the issues and open the PRs.

Done. issues_prs.md holds 80 issues in dependency order, grouped into 10 milestones, each with a paste-ready description and a table of files and line ranges to copy into that PR. A quick index at the bottom lists all 80 on one screen.

How the file is organised

Milestones 0 to 3 are bootstrap: scaffold, env template, fonts, design tokens, shadcn primitives, theme, login stand-in, proxy route, chat API, session API.
Milestones 4 to 8 split the four big files into feature PRs. The "core" issue for each file lists what to copy and what to leave out, and every later issue lists the exact lines it adds back. The line numbers point at your local files as they are today, including your uncommitted changes, so they stay valid as long as you copy from the local tree instead of editing it.
Milestones 9 and 10 are real problems I found while reading, plus tests, CI, Docker and docs.
Three things to handle before you start. They are at the top of the file as well.

The sidebar imports src/app/dice_icon.png, but that file is neither on disk nor in git history. Typecheck passes only because Next declares all PNG imports globally. The build will fail at issue 30 until you add the image.
Your .env holds an internal IP, and the current .gitignore has the .env rules commented out. Issue 2 fixes the ignore rules. Never commit the .env itself.
The Dockerfile pulls from an internal registry and bakes in an internal IP, and the Next config has another LAN IP. Issues 58 and 74 parametrize them.
Bugs I found that were not in your notes. Each is its own issue so you get a clean PR for it.