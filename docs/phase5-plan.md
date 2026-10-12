# Phase 5 — Frontend implementation plan

Scope: PROJECT_SPEC §8, §9, §13, §14 (+ §7 "never store tokens in localStorage"). Contract: `docs/API.md` (authoritative). Architecture: `docs/ARCHITECTURE.md` D1 (same-origin proxy), §9, D6 (TanStack Query).
Base: `22750d8` (Phase 4), tree clean. Work on the current branch, **do not commit** (the orchestrator commits). Do **not** edit `PROJECT_SPEC.md`. Do **not** change backend behaviour (see "Backend rule" below).

All paths below are relative to `/Users/tarunchauhan/Documents/projects/task-approval-system`. Web code lives in `apps/web` (Next.js 16.4.0 App Router under `src/`, React 19.3, Tailwind 4.3.3, shadcn new-york, `@/*` → `apps/web/src/*`).

---

## 0. Decisions (made here, not left to the implementer)

| # | Decision | Rationale |
|---|---|---|
| P1 | Routes: `/login`; admin `/admin`, `/admin/tasks`, `/admin/tasks/new`, `/admin/tasks/[id]`, `/admin/tasks/[id]/edit`, `/admin/employees`; employee `/employee` (counts + filterable assigned list), `/employee/tasks/[id]`. `/` redirects by role. Route groups `src/app/(auth)` and `src/app/(app)`. | Separate URL spaces make the role guard a per-section layout and give each role its own navigation (§14). Create/edit as pages (not dialogs) keep forms deep-linkable and simpler to test. |
| P2 | Guards: `src/proxy.ts` only checks **presence** of `tas_token` (no cookie → `/login?next=<path>`), never redirects away from `/login`. `(app)/layout.tsx` calls `GET /auth/me` server-side (401 → `/login?next=`); `admin/layout.tsx` / `employee/layout.tsx` redirect a wrong role to its own home; `/login` page calls `/auth/me` server-side and redirects a valid session home. | A stale/expired cookie would otherwise loop `/login` ↔ home. Cookie presence is only a fast pre-check; the API stays the authority. |
| P3 | Proxy passes the requested path to layouts in an `x-pathname` request header (`NextResponse.next({ request: { headers } })`). | Layouts don't receive the pathname; the header gives the 401 redirect its return path. |
| P4 | Return paths go through `safeReturnPath()` (must start with `/`, not `//` or `/\`, no scheme, not `/login`). | Prevents open redirects through `?next=`. |
| P5 | `getCurrentUser()` in `src/lib/api/server.ts` is wrapped in React `cache()` and starts with `import 'server-only'`. It uses `process.env.API_URL` (same resolution rules as `next.config.ts`: required in production, `http://localhost:4000` fallback in development only), `cache: 'no-store'`, and forwards only `tas_token` as `Cookie`. | Layout + section layout share one `/me` call per request. `server-only` makes a client import a build error. |
| P6 | Data is fetched **client-side only** with TanStack Query (no server prefetch/hydration). The only server fetch is `/auth/me`. | Avoids hydration mismatches for local-time timestamps and "overdue" (server TZ ≠ browser TZ) and keeps one data path. |
| P7 | API client: `createApiClient({ fetchImpl, onUnauthenticated })` + default `api` instance. Requests go to relative `/api/v1${path}`, `credentials: 'same-origin'`, `cache: 'no-store'`, `Accept: application/json`; `Content-Type: application/json` + `JSON.stringify` **only when a body is passed**. Bodyless POSTs (start/submit/approve/logout) send no body (API accepts "none or {}"; CSRF middleware's 415 check only triggers when a body exists). 204 → `undefined`. | Matches API.md and `apps/api/src/middleware/csrf.ts`. Injectable fetch makes it unit-testable. |
| P8 | `ApiError { status, code, message, details? }`. Non-JSON / unexpected error bodies → `code: 'HTTP_ERROR'` with a generic message; fetch rejection → `status: 0, code: 'NETWORK_ERROR'`. Redirect to `/login?next=` happens only for `status 401 && code === 'UNAUTHENTICATED'` and only when not already on `/login` (login's `INVALID_CREDENTIALS` 401 stays an inline form error). | API down behind the Next rewrite yields a non-JSON 500; login 401 must not redirect. |
| P9 | Query defaults: `staleTime 30_000`; queries retry ≤ 2 times only for `status 0` or ≥ 500 (never 4xx); mutations never retry; lists use `placeholderData: keepPreviousData`. | 4xx are deterministic; keeps pagination from flashing. |
| P10 | Query-key factory `src/lib/query-keys.ts`: `auth.me`, `dashboard.summary`, `users.list`, `tasks.all`, `tasks.lists()`, `tasks.list(params)`, `tasks.detail(id)`, `tasks.comments(id)`, `tasks.history(id)`. Invalidation: transition/reject → `setQueryData(detail)` + invalidate `tasks.lists()`, `dashboard.summary`, `tasks.history(id)`; create → lists + summary; edit → `setQueryData(detail)` + lists + summary (a `dueDate` change moves `overdue`); delete → `removeQueries(detail)` + lists + summary then navigate to `/admin/tasks`; comment → `tasks.comments(id)`; create employee → `users.list`. On 409 `INVALID_TRANSITION`/`TASK_COMPLETED` or 404: toast the API message and invalidate detail, lists, summary, history (refetch). | One place for keys; every mutation's cache effect is explicit. |
| P11 | Forms: React Hook Form + `zodResolver(sharedSchema)` typed `useForm<z.input<S>, unknown, z.output<S>>`; submit the parsed output. Schemas reused from `@workspace/shared`: `loginSchema`, `createUserSchema`, `createTaskSchema` (create **and** edit form validation), `updateTaskSchema` is not used client-side for the form — edit sends only `dirtyFields` (Save disabled until `isDirty`) so the strict PATCH whitelist and "≥ 1 field" rule are met; `rejectTaskSchema`, `createCommentSchema`. `applyApiErrorToForm(error, setError, fieldNames)` maps `VALIDATION_ERROR` `details[{path,message}]` to fields (unknown paths → `root`), `EMAIL_TAKEN` → `email`, `INVALID_ASSIGNEE` → `assignedToId`; anything else → toast. Use `useWatch` (not `watch`) to satisfy the React Compiler lint rules. | No duplicated validation; server errors land inline. |
| P12 | URL list state: `src/features/tasks/lib/list-params.ts` picks only `page, pageSize, status, priority, assignedToId, q, sort, order` from `URLSearchParams`, validates **each key** with `taskListQuerySchema.shape[key].safeParse` (invalid values dropped → default), and `toApiQuery()` omits defaults/empties. Filter/search/sort changes `router.replace` with `page` reset to 1; pagination uses `router.push`. Search input is debounced 300 ms (`src/hooks/use-debounced-value.ts`). Radix Select uses sentinel value `all` for "no filter". Sort is a single select (Newest, Oldest, Due soonest, Due latest, Priority high→low, Recently updated) mapped to `sort`+`order`. | API query schema is strict (unknown key → 400); never forward raw URL params. |
| P13 | Dates `src/lib/dates.ts`: `formatDueDate('YYYY-MM-DD')` splits the string and formats `Date.UTC(y, m-1, d)` with `Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })`; `todayLocalIso()` from local `getFullYear/getMonth/getDate`; `isOverdue(task, today = todayLocalIso())` = `status !== 'COMPLETED' && dueDate < today` (string compare); `formatDateTime(iso)` local medium date + short time. `dueDate` is never passed to `new Date(string)`. `<input type="date">` value is used as-is. | Calendar dates never shift; overdue uses the viewer's local date (ARCHITECTURE §4). |
| P14 | Workflow buttons: `src/lib/workflow.ts` `availableActions(task: TaskDto, user)` → `getAvailableActions({ status: task.status, assignedToId: task.assignedTo.id }, user)` from shared. Buttons render only for returned actions. | `TaskDto` has `assignedTo.id`, the shared helper expects `assignedToId`. |
| P15 | Pagination is a custom `PaginationControls` (Prev/Next buttons + "Page X of Y", `<nav aria-label="Pagination">`) using the router, **not** shadcn `pagination`. | shadcn pagination renders plain `<a>` (full reloads); "or equivalent" is allowed by the brief. |
| P16 | App shell uses shadcn `sidebar` (desktop collapsible `offcanvas`; on mobile it renders a Radix `Sheet` automatically). `SidebarInset` (a `<main>`) gets `id="main-content" tabIndex={-1}`; a skip link is the first focusable element. Initial open state from the `sidebar_state` cookie in `(app)/layout.tsx`. Mobile nav links call `setOpenMobile(false)`. Light theme only. | Off-the-shelf accessible, responsive sidebar; no theme switcher needed. |
| P17 | Toasts: sonner `<Toaster>` via the shadcn wrapper with `next-themes` removed (fixed `theme="light"`), `closeButton`, `position="top-right"`. sonner renders an `aria-live` region. | Avoids an extra dependency for a feature we don't ship. |
| P18 | Detail 404 **and** 400 (malformed id) → `TaskNotFound` state ("Task not found" + link home). | API returns 400 for a non-cuid id (see conflicts). Employee opening another employee's task gets 404 → same state. |
| P19 | Playwright harness + an auth smoke spec are set up in chunk A (not only D); chunks B and C add their own specs; D adds a11y/screenshot/mobile specs and runs the full suite. | Coders and reviewers can't click a browser; per-chunk browser tests are the real verification for UI work. Grep checks are not verification. |
| P20 | E2E runs on **non-default ports** (web 3100, API 4100) against the guarded **test DB** from `apps/api/.env.test` (must be `NODE_ENV=test`, DB name ends `_test`), migrated + seeded by `apps/web/e2e/prepare-db.mjs`. E2E-created data uses unique titles (`E2E <timestamp> …`); assertions never depend on absolute counts. The e2e web build uses `distDir` `.next-e2e` (via `NEXT_DIST_DIR`) because rewrites are baked in at build time. | Proves no hardcoded localhost:4000/3000 in client code; never pollutes the dev DB; doesn't clobber the normal `.next`. |
| P21 | Login budget in e2e: log in once per role in `auth.setup.ts` and reuse `storageState`; ≤ 6 UI logins per run; Playwright starts a fresh API process each run (`reuseExistingServer: false`). | Behind the proxy with `TRUST_PROXY=0` all logins share one IP bucket (50 / 15 min; 10 / 15 min per email). |
| P22 | Web unit tests: Vitest (node env) for pure modules only (`src/**/*.test.ts`), `TZ=Pacific/Honolulu` set in `vitest.config.ts` `test.env` to catch date shifts. | Fast checks for the error parser, redirects, URL params and dates. Components are covered by Playwright. |

### Backend rule
If the API behaves differently from `docs/API.md`, or a backend bug blocks the UI: **stop and report** with `send_message` severity `warning` (endpoint, request, expected per API.md, actual). Do not work around it silently. A small backend fix is allowed only if it is clearly a bug, comes with an API test, and is recorded in `docs/phase5-verification.md`.

---

## 1. Dependencies (exact pins, checked with `npm view` on 2026-10-11)

Install with `pnpm --filter web add -E …` / `pnpm --filter web add -D -E …` from the repo root.

| Package | Version | Kind | Chunk | Why |
|---|---|---|---|---|
| `@tanstack/react-query` | 5.104.1 | dep | A | server state (D6); peer react ^18 \|\| ^19 |
| `react-hook-form` | 7.89.0 | dep | A | forms |
| `@hookform/resolvers` | 5.9.1 | dep | A | `zodResolver`; peers `react-hook-form ^7.55`, `zod ^3.25 \|\| ^4` |
| `zod` | 4.6.5 | dep | A | same version as shared/api; resolver peer and `z.input`/`z.output` types (pnpm is strict, the transitive copy isn't importable) |
| `sonner` | 2.0.8 | dep | A | toasts (also added by the shadcn CLI; re-pin exactly) |
| `server-only` | 0.0.1 | dep | A | build-time guard for `src/lib/api/server.ts` (TS needs the module to resolve) |
| `vitest` | 5.0.3 | dev | A | unit tests (same as api) |
| `vite` | 8.3.4 | dev | A | vitest peer (same as api) |
| `@playwright/test` | 1.64.0 | dev | A | e2e |
| `@axe-core/playwright` | 4.13.0 | dev | D | automated WCAG checks; peer `playwright-core` — confirm `pnpm why playwright-core` resolves to 1.64.0 only |

Already present and reused: `lucide-react` 1.55.0, `radix-ui` 1.7.0, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`.
Must **not** remain after the shadcn CLI: `cn` (CLI adds it; imports must use `@/lib/utils`), `next-themes`. Any range the CLI writes (`^x`) is replaced with the exact version.
Playwright browser: `pnpm --filter web exec playwright install chromium`. If the download is blocked on this network, set `PLAYWRIGHT_CHANNEL=chrome` (config reads it) to use the installed Google Chrome, and record that in the verification doc.

## 2. shadcn components (CLI 4.21.4, chunk A)

From `apps/web`: `CI=1 pnpm dlx shadcn@4.21.4 add input label textarea select dialog alert-dialog alert badge card table skeleton dropdown-menu sonner separator tooltip sheet sidebar field --yes < /dev/null` (stdin closed so a prompt fails fast instead of hanging).
Post-processing (all required):
1. Every generated file importing `cn` from `"cn"` → `import { cn } from '@/lib/utils'` (verified: registry `field.json`/`sidebar.json` import from `"cn"`).
2. `button.tsx` must be byte-identical to HEAD (`git diff --exit-code apps/web/src/components/ui/button.tsx`); if the CLI touched it, restore with `git checkout -- apps/web/src/components/ui/button.tsx`.
3. `sonner.tsx`: drop `next-themes`/`useTheme`, fixed `theme="light"`.
4. `pnpm --filter web remove cn next-themes` (if added); exact-pin anything else the CLI added.
5. `globals.css`: keep existing tokens; accept only additions the CLI needs.
6. If `eslint-config-next`'s React Compiler rules flag generated code (e.g. `Math.random` in `SidebarMenuSkeleton`, `setState` in `use-mobile`'s effect), make the minimal fix (fixed skeleton width; `useSyncExternalStore` over `matchMedia`) rather than disabling rules; note it in `docs/phase5-verification.md`.
7. `pnpm exec prettier --write apps/web/src/components/ui apps/web/src/hooks`.

## 3. Conflicts / gaps between API.md and the brief (and how the plan handles them)

1. **Malformed task id → 400**, not 404 (API.md "Ids are cuids"). The detail view treats 400 and 404 alike → "Task not found" (P18).
2. **Dashboard `overdue` uses the UTC date**; per-task badges use the viewer's local date (brief). Near midnight the card and the badges can differ by one day. Accepted; noted in the Phase 5 notes. The card shows the API number; it is not recomputed.
3. **`q` searches titles only.** The input is labelled "Search by title".
4. **`GET /users` returns employees only, unpaginated** — used for the employee filter, the assignee select and the Employees page (admins are not listed; matches §8 "employee list").
5. **Strict list query** (unknown param → 400): the UI never forwards arbitrary URL params (P12).
6. **`TaskDto.assignedTo.id` vs shared `WorkflowTask.assignedToId`**: adapter (P14). No shared-package change.
7. **Edit is allowed on any non-COMPLETED status** (incl. PENDING_APPROVAL) per API; UI matches. COMPLETED: Edit hidden, edit page shows a read-only notice; a racing 409 `TASK_COMPLETED` → toast + back to detail.
8. **Delete is allowed for any status** (incl. COMPLETED) per API; UI offers it with confirmation.
9. **Rejection reason lives only in history**; `latestRejectionReason` is `null` after resubmission, so the "Admin feedback" alert disappears then while history still shows the reason. Matches API.md.
10. **CSRF origin must equal the web origin incl. port**: e2e API runs with `FRONTEND_URL=http://localhost:3100`.
11. **Login rate limit is effectively global behind the proxy** (`TRUST_PROXY=0`, Phase 7 item): e2e login budget (P21).
12. **Login 401 (`INVALID_CREDENTIALS`) vs session 401 (`UNAUTHENTICATED`)**: only the latter redirects (P8).
13. No conflict found requiring a backend change.

---

## 4. Conventions for every chunk

- Toolchain: `nvm use 22.19.0`; pnpm 10.12.4. Shared must be built before web typecheck/build: `pnpm --filter @workspace/shared build`.
- Base verification (run at the end of every chunk, all must exit 0):
  `pnpm --filter web typecheck` · `pnpm --filter web lint` (0 errors, 0 warnings) · `pnpm --filter web test` · `pnpm --filter web build` · `pnpm format:check`.
- E2E (from chunk A on): Docker MySQL up (`pnpm db:up`), then `pnpm test:e2e` (root script) — must exit 0.
- Shell quirk in this environment: commands with pipes or long output sometimes hang the tool. Redirect output to `/tmp/p5-*.log`, append `; echo exit=$?`, then read the log. Run long servers with `run_in_background`. Stop every server you start and confirm the port is free.
- Record every command and its result in `docs/phase5-verification.md` (one section per chunk, trimmed real output, never invented). Tick `docs/IMPLEMENTATION_CHECKLIST.md` Phase 5 items only after verification, with the evidence inline.
- Security invariants (check in every review): no token handling in client code (cookie is httpOnly), nothing in `localStorage`/`sessionStorage`, no `dangerouslySetInnerHTML`, no absolute API URL or `localhost` in `src/` except the development fallback in `src/lib/api/server.ts`, `@/lib/api/server` imported only from server components/layouts.
- Accessibility invariants for every new component: every input has a `<Label htmlFor>` (Radix Select trigger gets the `id`), `aria-invalid` + `FieldError` (`role="alert"`) on errors, icon+text badges, icon-only buttons have `aria-label`/sr-only text, one `<h1>` per page, tables have a caption or `aria-label`.

---

## Chunk A — FOUNDATION

- [ ] A1. Add dependencies, Vitest config and scripts.
      Install the chunk-A rows of §1. Add `apps/web/vitest.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']`, alias `@` → `src`, `test.env: { TZ: 'Pacific/Honolulu' }`). Scripts in `apps/web/package.json`: `"test": "vitest run"`, `"test:e2e": "node e2e/prepare-db.mjs && NEXT_DIST_DIR=.next-e2e API_URL=http://localhost:4100 next build && playwright test"`. Root `package.json`: `"test:e2e": "pnpm --filter @workspace/shared build && pnpm --filter api build && pnpm --filter web test:e2e"`. `next.config.ts`: `distDir: process.env.NEXT_DIST_DIR || '.next'`. Add `.next-e2e/`, `test-results/`, `playwright-report/`, `apps/web/e2e/.auth/` to `.gitignore`, `.prettierignore` and the web ESLint `globalIgnores`.
      Files: `apps/web/package.json`, `apps/web/vitest.config.ts`, `apps/web/next.config.ts`, `apps/web/eslint.config.mjs`, `package.json`, `.gitignore`, `.prettierignore`, `pnpm-lock.yaml`.
      Verify: `pnpm install --frozen-lockfile` exit 0; `pnpm --filter web typecheck` and `lint` exit 0; `apps/web/package.json` has no `^`/`~` ranges.

- [ ] A2. Add the shadcn components (§2) with all post-processing steps.
      Files: `apps/web/src/components/ui/{input,label,textarea,select,dialog,alert-dialog,alert,badge,card,table,skeleton,dropdown-menu,sonner,separator,tooltip,sheet,sidebar,field}.tsx`, `apps/web/src/hooks/use-mobile.ts`, possibly `apps/web/src/app/globals.css`, `apps/web/package.json`.
      Verify: `git diff --exit-code apps/web/src/components/ui/button.tsx` exit 0; no `cn`/`next-themes` in `apps/web/package.json`; base verification (typecheck, lint, build, format:check) exit 0.

- [ ] A3. Pure foundation modules + unit tests.
      - `src/lib/api/errors.ts`: `ApiError` class, `isApiError`, `parseApiError(response)` (P8).
      - `src/lib/api/client.ts`: `createApiClient`, default `api` with `get/post/patch/delete<T>(path, body?)` (P7); default `onUnauthenticated` → `window.location.assign(loginPath(currentPath))` unless on `/login`.
      - `src/lib/routes.ts`: `homeFor(role)` (`ADMIN → /admin`, `EMPLOYEE → /employee`), `safeReturnPath(value)` (P4), `loginPath(returnPath?)`, `isAdminPath`, `isEmployeePath`.
      - `src/lib/dates.ts` (P13). `src/lib/labels.ts`: `STATUS_LABEL`, `PRIORITY_LABEL`, `ROLE_LABEL`.
      - `src/lib/workflow.ts`: `availableActions` (P14).
      - `src/lib/form-errors.ts`: `applyApiErrorToForm` (P11), `apiErrorMessage(error, fallback)`.
      - `src/lib/query-client.ts`: `makeQueryClient()` (P9). `src/lib/query-keys.ts` (P10).
      - `src/hooks/use-debounced-value.ts`.
      Tests: `src/lib/api/client.test.ts` (relative URL, `credentials: 'same-origin'`, JSON header only with a body, 204, error shape → ApiError with details, non-JSON 500 → `HTTP_ERROR`, network → `NETWORK_ERROR`, `onUnauthenticated` called for `UNAUTHENTICATED` only, not for `INVALID_CREDENTIALS`); `src/lib/routes.test.ts` (`//evil.com`, `/\evil`, `https://x`, `/login`, `javascript:` rejected; `/admin/tasks?status=PENDING` kept); `src/lib/dates.test.ts` (`2026-01-01` → "Jan 1, 2026" under Honolulu TZ, month/year boundaries, overdue rules incl. due today not overdue and COMPLETED never overdue); `src/lib/form-errors.test.ts` (details → fields, unknown path → root, `EMAIL_TAKEN` → email, `INVALID_ASSIGNEE` → assignedToId).
      Files: as listed under `apps/web/src/lib`, `apps/web/src/hooks`.
      Verify: `pnpm --filter web test` all pass; typecheck/lint exit 0.

- [ ] A4. Server-side session helpers and request proxy.
      - `src/lib/api/server.ts` (`import 'server-only'`): `getApiBaseUrl()`, `getCurrentUser = cache(async () => UserDto | null)` (200 → user, 401 → null, other/network → throw), `requireUser()` (null → `redirect(loginPath(x-pathname))`), `requireRole(role)` (wrong role → `redirect(homeFor(user.role))`). Reads the cookie with `await cookies()` and the path with `await headers()`.
      - `src/lib/auth-redirect.ts`: pure `proxyDecision({ pathname, search, hasToken })` → `{ type: 'next' } | { type: 'redirect', location }`; `/login` always `next`.
      - `src/proxy.ts`: named export `proxy(request)`; uses `proxyDecision`, sets `x-pathname` on `next`; `config.matcher = ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']` (Next 16 convention verified in `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`; `middleware.ts` is deprecated).
      Tests: `src/lib/auth-redirect.test.ts` (no token on `/admin/tasks?x=1` → `/login?next=%2Fadmin%2Ftasks%3Fx%3D1`; `/` without token → `/login`; token present → next; `/login` → next).
      Files: `apps/web/src/lib/api/server.ts`, `apps/web/src/lib/auth-redirect.ts`, `apps/web/src/lib/auth-redirect.test.ts`, `apps/web/src/proxy.ts`.
      Verify: unit tests pass; `pnpm --filter web build` exit 0 and its output lists `Proxy`; typecheck/lint exit 0.

- [ ] A5. Providers, root layout, root redirect and error surfaces.
      - `src/components/providers.tsx` (client): `QueryClientProvider` (`useState(makeQueryClient)`), `<Toaster />` (P17).
      - `src/app/layout.tsx`: wraps children in `Providers`; metadata `title: { default: 'Task & Approval Management', template: '%s · Task & Approval' }`.
      - `src/app/page.tsx`: replace the placeholder with a server redirect (`getCurrentUser` → `homeFor(role)` or `/login`).
      - `src/app/not-found.tsx`, `src/app/(app)/error.tsx` (client, "Something went wrong" + Retry `reset()`).
      - `src/components/common/{error-state,empty-state,page-header,loading-button}.tsx` (`ErrorState` shows the ApiError message + Retry; `LoadingButton` = `Button` + `Loader2` + `disabled`/`aria-busy` while pending).
      Files: as listed.
      Verify: typecheck/lint/build exit 0.

- [ ] A6. Auth feature and login page.
      - `src/features/auth/api/auth-api.ts`: `login(input) → UserDto`, `logout()`.
      - `src/features/auth/hooks/use-login.ts`, `use-logout.ts` (logout: POST, `queryClient.clear()`, `window.location.assign('/login')`; toast on failure).
      - `src/features/auth/components/login-form.tsx` (client): RHF + `loginSchema`; email (`autoComplete="email"`), password (`autoComplete="current-password"`); inline field errors; `INVALID_CREDENTIALS`/`RATE_LIMITED` → root error alert (`role="alert"`); success → `router.replace(safeReturnPath(next) ?? homeFor(user.role))` + `router.refresh()`; reads `next` with `useSearchParams` inside `<Suspense>`.
      - `src/app/(auth)/login/page.tsx` (server): valid session → `redirect(homeFor(role))`; else render the form in a centered card with app name, `<h1>Sign in</h1>` and a skip link to the form.
      Files: as listed.
      Verify: typecheck/lint/build exit 0 (browser behaviour verified in A8).

- [ ] A7. Protected layouts and app shell.
      - `src/features/auth/components/current-user-provider.tsx`: context + `useCurrentUser()`.
      - `src/app/(app)/layout.tsx` (server): `requireUser()`, read `sidebar_state` cookie, render `<CurrentUserProvider user><AppShell defaultOpen>{children}</AppShell></CurrentUserProvider>`.
      - `src/app/(app)/admin/layout.tsx` → `requireRole('ADMIN')`; `src/app/(app)/employee/layout.tsx` → `requireRole('EMPLOYEE')`.
      - `src/app/(app)/admin/page.tsx`, `src/app/(app)/employee/page.tsx`: minimal headed placeholders (`<h1>Dashboard</h1>` / `<h1>My tasks</h1>`), replaced in B3 / C5.
      - `src/components/layout/nav-config.ts` (admin: Dashboard `/admin` LayoutDashboard, Tasks `/admin/tasks` ListChecks, Employees `/admin/employees` Users; employee: My tasks `/employee` ListTodo), `app-shell.tsx` (SidebarProvider + AppSidebar + SidebarInset `id="main-content"`), `app-sidebar.tsx` (brand, role-specific menu, active item `isActive` + `aria-current="page"` via `usePathname`, closes the mobile sheet on click), `app-header.tsx` (SidebarTrigger, user name + role badge, `UserMenu`), `user-menu.tsx` (DropdownMenu: name, email, role, "Sign out"), `skip-link.tsx` (`sr-only focus:not-sr-only`, first focusable).
      Files: as listed.
      Verify: typecheck/lint/build exit 0.

- [ ] A8. Playwright harness and auth e2e.
      - `apps/web/playwright.config.ts`: `testDir: 'e2e'`, `workers: 1`, `fullyParallel: false`, `baseURL: 'http://localhost:3100'`, `trace: 'retain-on-failure'`, reporters `list` + `html` (`open: 'never'`); projects `setup` (`auth.setup.ts`) and `chromium` (depends on setup; `channel: process.env.PLAYWRIGHT_CHANNEL`); `webServer`: (1) API `node --env-file=.env.test dist/server.js`, `cwd: '../api'`, `url: 'http://localhost:4100/health'`, `env: { NODE_ENV: 'test', PORT: '4100', FRONTEND_URL: 'http://localhost:3100' }`; (2) web `next start --port 3100`, `env: { NEXT_DIST_DIR: '.next-e2e', API_URL: 'http://localhost:4100' }`, `url: 'http://localhost:3100/login'`; both `reuseExistingServer: false`, `timeout: 120_000`.
      - `apps/web/e2e/prepare-db.mjs`: read `apps/api/.env.test` with `node:util` `parseEnv`; refuse unless `NODE_ENV === 'test'` and the DB name ends `_test` (same rule as `apps/api/test/helpers/db-guard.ts`); run `apps/api/node_modules/.bin/prisma migrate deploy` then `prisma db seed` with `cwd: apps/api` and the test env merged over `process.env`.
      - `apps/web/e2e/fixtures.ts`: demo credentials (`admin@demo.com`/`Admin@12345`, `employee1@demo.com`/`Employee1@12345`, `employee2@demo.com`/`Employee2@12345`), storage-state paths, `uniqueTitle()`.
      - `apps/web/e2e/auth.setup.ts`: UI login for the 3 users → `e2e/.auth/{admin,employee1,employee2}.json`.
      - `apps/web/e2e/auth.spec.ts`: unauthenticated `/admin/tasks` → `/login?next=%2Fadmin%2Ftasks`; wrong password → inline "Invalid email or password", URL unchanged; empty submit → field errors; admin state at `/login` → `/admin`; employee1 state at `/admin` → `/employee`, admin at `/employee` → `/admin`; header shows name + role; login with `?next=/admin/tasks` lands there; logout → `/login` and revisiting `/admin` redirects to `/login` (logout test uses a fresh context + its own login); mobile viewport (390×844): menu button opens the sheet, a nav link navigates and closes it.
      Files: as listed.
      Verify: `pnpm --filter web exec playwright install chromium` (or `PLAYWRIGHT_CHANNEL=chrome`), `pnpm db:up`, `pnpm test:e2e` exit 0 with all auth tests passing; servers stopped afterwards (ports 3100/4100 free).

- [ ] A9. Evidence and checklist.
      Create `docs/phase5-verification.md` (versions, deps added with pins, shadcn post-processing, commands + results for A). Tick Phase 5 checklist items "Login page…", "Route protection…", "App shell…" only if A8 passed.
      Files: `docs/phase5-verification.md`, `docs/IMPLEMENTATION_CHECKLIST.md`.
      Verify: base verification + `pnpm test:e2e` re-run exit 0.

**Chunk A exit:** base verification exit 0; `pnpm test:e2e` (setup + auth.spec) exit 0; `pnpm --filter api test` still passes (no backend change).

---

## Chunk B — ADMIN screens

Depends on A. Reuses shared `createTaskSchema`, `rejectTaskSchema`, `createUserSchema`, `taskListQuerySchema` (+ `TASK_STATUSES`, `PRIORITIES`, `TASK_SORT_FIELDS`, `SORT_ORDERS`, `MAX_PAGE_SIZE`), `canPerformAction`/`getAvailableActions`, DTO types.

- [ ] B1. Data layer for tasks, users and dashboard.
      - `src/features/tasks/api/tasks-api.ts`: `listTasks(query)`, `getTask(id)`, `createTask`, `updateTask(id, patch)`, `deleteTask`, `startTask`, `submitTask`, `approveTask`, `rejectTask(id, reason)`, `listComments`, `addComment`, `listHistory` (typed with shared DTOs; ids `encodeURIComponent`-ed).
      - `src/features/tasks/lib/list-params.ts` (P12) + `list-params.test.ts` (invalid status/priority/page/pageSize/sort dropped; `pageSize=101` dropped; defaults omitted from `toApiQuery`; unknown keys ignored; `q` trimmed, blank omitted).
      - `src/features/tasks/hooks/use-task-queries.ts` (`useTaskList(query)`, `useTask(id)`, `useTaskComments(id)`, `useTaskHistory(id)`), `use-task-mutations.ts` (`useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useTaskTransition` for start/submit/approve, `useRejectTask`, `useAddComment`) with P10 cache effects and success/error toasts ("Task created", "Task updated", "Task deleted", "Task started", "Submitted for approval", "Task approved", "Task returned to the employee").
      - `src/features/tasks/hooks/use-task-list-params.ts`: reads `useSearchParams`, exposes `params`, `setParams(partial)`, `setPage(n)`, `clear()`.
      - `src/features/users/api/users-api.ts` (`listEmployees`, `createEmployee`), `src/features/users/hooks/{use-employees,use-create-employee}.ts`.
      - `src/features/dashboard/api/dashboard-api.ts`, `src/features/dashboard/hooks/use-dashboard-summary.ts`.
      Verify: `pnpm --filter web test` (list-params tests pass); typecheck/lint exit 0.

- [ ] B2. Shared display components.
      `src/components/common/status-badge.tsx` (PENDING Clock "Pending", IN_PROGRESS PlayCircle "In progress", PENDING_APPROVAL Hourglass "Pending approval", COMPLETED CheckCircle2 "Completed"; e.g. `bg-amber-100 text-amber-900`, `bg-blue-100 text-blue-900`, `bg-violet-100 text-violet-900`, `bg-emerald-100 text-emerald-900` — all ≥ 4.5:1), `priority-badge.tsx` (ArrowDown/ArrowRight/ArrowUp + "Low/Medium/High priority"; HIGH `bg-red-100 text-red-900`), `overdue-badge.tsx` (AlertTriangle + "Overdue"), `due-date.tsx` (`formatDueDate` + `OverdueBadge` when `isOverdue`; `<time dateTime=…>`), `stat-card.tsx`, `table-skeleton.tsx`, `cards-skeleton.tsx`, `pagination-controls.tsx` (P15). `src/features/tasks/components/task-table.tsx` (props: `tasks`, `showAssignee`, `detailHref(id)`, optional `rowActions`; caption/`aria-label`; title links to detail), `task-filters.tsx` (status, priority, optional employee select from `useEmployees`, optional debounced search, sort select, "Clear filters"; every control labelled), `task-list-section.tsx` (filters + table + loading skeleton + `ErrorState` with retry + empty states: "No tasks yet" vs "No tasks match these filters" with Clear button + pagination from `meta`).
      Verify: typecheck/lint/build exit 0.

- [ ] B3. Admin dashboard `/admin`.
      `src/features/dashboard/components/summary-cards.tsx` (Total, Pending, In progress, Pending approval, Completed, Overdue; each links to the filtered list, e.g. `/admin/tasks?status=PENDING`; overdue card links nowhere and its description says it's based on today's date in UTC), `src/features/tasks/components/approval-queue.tsx` (`useTaskList({ status: 'PENDING_APPROVAL', sort: 'updatedAt', order: 'asc', pageSize: 10 })`; each row: title link, assignee, due date, Approve (`LoadingButton`) and Reject (opens `RejectTaskDialog`); empty state "No tasks are waiting for approval"), `src/features/tasks/components/reject-task-dialog.tsx` (Dialog, RHF + `rejectTaskSchema`, labelled textarea "Reason for rejection", `maxLength 1000` + live char count, inline required error, submit disabled while pending, closes + resets on success), recent tasks (`useTaskList({ pageSize: 5 })` in `TaskTable` with assignee, link "View all tasks"). Page `src/app/(app)/admin/page.tsx` (`metadata.title 'Admin dashboard'`).
      Verify: typecheck/lint/build exit 0.

- [ ] B4. Admin tasks list `/admin/tasks`.
      `src/app/(app)/admin/tasks/page.tsx`: `PageHeader` "Tasks" + "New task" button (`/admin/tasks/new`), `<Suspense>` around `TaskListSection` with search, status, priority, employee and sort filters synced to URL, `showAssignee`, row actions via `src/features/tasks/components/task-row-actions.tsx` (DropdownMenu: View, Edit — hidden when COMPLETED, Delete → `DeleteTaskDialog`).
      Verify: typecheck/lint/build exit 0.

- [ ] B5. Task form, create and edit pages.
      `src/features/tasks/components/task-form.tsx` (title Input, description Textarea, priority Select, due date `Input type="date"`, assignee Select of employees with loading/empty state "Create an employee first" → `/admin/employees`; RHF + `createTaskSchema`; P11 error mapping; `mode: 'create' | 'edit'`; edit submits `dirtyFields` only, Save disabled until dirty), `src/app/(app)/admin/tasks/new/page.tsx` (success → toast + `/admin/tasks/<id>`), `src/app/(app)/admin/tasks/[id]/edit/page.tsx` (server page awaits `params` → client `EditTaskView`; loads task; 400/404 → `TaskNotFound`; COMPLETED → read-only notice + back link, no form; 409 `TASK_COMPLETED` on save → toast + refetch + back to detail).
      Verify: typecheck/lint/build exit 0.

- [ ] B6. Shared task detail shell + admin detail `/admin/tasks/[id]`.
      `src/features/tasks/components/task-detail-view.tsx` (props `taskId`; `useTask`; skeleton; `TaskNotFound` on 400/404 (`task-not-found.tsx`); `ErrorState` otherwise; header: back link, `<h1>` title, StatusBadge, PriorityBadge, overdue badge; `TaskActions`; details card: description `whitespace-pre-wrap`, due date, assignee, created by, reviewer + reviewed at, created/updated; **slots** for the feedback alert, comments and history that chunk C fills), `task-actions.tsx` (renders buttons from `availableActions(task, user)`: admin Approve + Reject dialog; plus admin-only Edit (not COMPLETED) and Delete; all disabled while any task mutation is pending; 409 → toast + refetch), `delete-task-dialog.tsx` (AlertDialog "Delete this task?", explains it disappears from lists while history is kept; confirm → toast + invalidate + `router.push('/admin/tasks')`). Page `src/app/(app)/admin/tasks/[id]/page.tsx` awaits `params` and renders `TaskDetailView`.
      Verify: typecheck/lint/build exit 0.

- [ ] B7. Employees page `/admin/employees`.
      `src/features/users/components/employees-table.tsx` (name, email; caption; skeleton/error/empty "No employees yet"), `create-employee-dialog.tsx` (Dialog with RHF + `createUserSchema`: name, email, password `type="password" autoComplete="new-password"` with hint "At least 8 characters"; 409 `EMAIL_TAKEN` → email field error; success → toast, invalidate, close, reset). Page `src/app/(app)/admin/employees/page.tsx`.
      Verify: typecheck/lint/build exit 0.

- [ ] B8. Admin e2e and evidence.
      `apps/web/e2e/admin.spec.ts` (admin storage state): dashboard shows the 6 cards with numbers and the approval queue heading; create task (empty submit → inline "Title is required"; valid submit → detail page with Pending badge, due date shown exactly as entered, no timezone shift); list: search by the unique title narrows rows and puts `q=` in the URL; status filter puts `status=PENDING` in the URL and survives reload; employee filter sets `assignedToId`; pagination control present when `totalPages > 1` (skip assertion otherwise); edit title → toast + new title on detail; delete via row menu → AlertDialog → confirm → toast, row gone, `/admin/tasks/<id>` shows "Task not found"; approve from the queue: create a task, then use the API through `request` with employee1's storage state to start+submit it (`APIRequestContext` against `http://localhost:3100/api/v1/...` with the `Origin` header), approve in the queue → toast, row leaves the queue; reject dialog: empty reason → inline error, valid → status In progress; employees: create `e2e-<ts>@demo.com` → appears in the table; same email again → inline "email" field error. Append chunk B evidence to `docs/phase5-verification.md`; tick the admin checklist items that passed.
      Files: `apps/web/e2e/admin.spec.ts`, `docs/phase5-verification.md`, `docs/IMPLEMENTATION_CHECKLIST.md`.
      Verify: base verification exit 0; `pnpm test:e2e` exit 0 (auth + admin specs).

**Chunk B exit:** base verification + `pnpm test:e2e` exit 0. Admin detail intentionally has no comments/history yet (chunk C).

---

## Chunk C — EMPLOYEE screens + shared task detail components

Depends on B (TaskDetailView, TaskActions, list components). Reuses shared `createCommentSchema`, `getAvailableActions`, `TaskAction`.

- [ ] C1. Employee workflow actions.
      Extend `task-actions.tsx`: employee Start (PENDING) and "Submit for approval" (IN_PROGRESS) shown only when `availableActions` returns them; no Edit/Delete/Reassign/Create controls render for EMPLOYEE (guard on `user.role === 'ADMIN'` in addition to the helper). Toasts and 409/404 handling per P10.
      Files: `apps/web/src/features/tasks/components/task-actions.tsx`.
      Verify: typecheck/lint exit 0.

- [ ] C2. Feedback alert.
      `src/features/tasks/components/task-feedback-alert.tsx`: when `task.latestRejectionReason` is set, shadcn `Alert` with MessageSquareWarning icon, title "Admin feedback" (employee) / "Returned with feedback" (admin), the reason (`whitespace-pre-wrap`), reviewer name and `formatDateTime(reviewedAt)`; placed directly under the detail header.
      Verify: typecheck/lint exit 0.

- [ ] C3. Comments thread.
      `src/features/tasks/components/task-comments.tsx`: `useTaskComments`; `<ol>` oldest first with author name, role label, `<time>`; skeleton/error with retry/empty "No comments yet — start the conversation"; add form (RHF + `createCommentSchema`, labelled textarea, `maxLength 2000`, char count, inline error, button disabled while pending, reset on success, toast "Comment added"). Shown for both roles (API scope decides access).
      Verify: typecheck/lint exit 0.

- [ ] C4. History timeline.
      `src/features/tasks/components/task-history.tsx`: `useTaskHistory`; `<ol>` timeline; each entry: "Created" (fromStatus null) or `StatusBadge(from) → StatusBadge(to)` with an sr-only "changed from … to …" sentence, actor name + role, `<time>`; a reason renders in a highlighted block labelled "Rejection reason"; skeleton/error states.
      Verify: typecheck/lint exit 0.

- [ ] C5. Plug shared components in; employee pages.
      Fill the `TaskDetailView` slots with C2–C4 for both roles. `src/app/(app)/employee/page.tsx`: `PageHeader` "My tasks", `SummaryCards` (employee variant, "assigned to you" wording, cards link to `/employee?status=…`), `<Suspense>` `TaskListSection` with status + priority + sort filters synced to URL (no search/employee filter, no assignee column), overdue badges, detail links to `/employee/tasks/<id>`, empty states. `src/app/(app)/employee/tasks/[id]/page.tsx` renders `TaskDetailView`.
      Files: `apps/web/src/features/tasks/components/task-detail-view.tsx`, `apps/web/src/features/dashboard/components/summary-cards.tsx`, `apps/web/src/app/(app)/employee/page.tsx`, `apps/web/src/app/(app)/employee/tasks/[id]/page.tsx`.
      Verify: typecheck/lint/build exit 0.

- [ ] C6. Employee + workflow e2e and evidence.
      `apps/web/e2e/workflow.spec.ts` (serial; switches storage states via `browser.newContext({ storageState })`): admin creates a uniquely-titled task for Jordan Lee (employee1) → employee1 sees it on `/employee` with Pending badge; detail shows Start only (no Submit/Edit/Delete); Start → toast + In progress; Submit → Pending approval, no action buttons; admin rejects (empty reason → inline error; then a reason) → employee1 sees the "Admin feedback" alert with the exact reason; employee1 comments → admin sees the comment with author name; employee1 submits again → alert gone; admin approves → Completed, Edit hidden; history shows 6 entries in order with the rejection reason highlighted. `apps/web/e2e/employee.spec.ts`: status filter puts `status=` in the URL and survives reload; priority filter; seeded overdue task shows the "Overdue" badge (seed has a past-due IN_PROGRESS task for employee2); employee2 opening employee1's task id → "Task not found"; `/employee/tasks/not-a-cuid` → "Task not found"; no "New task"/Edit/Delete/Employees controls anywhere for employees; stale action: two pages of the same PENDING task, Start in one, Start in the other → error toast with the API's 409 message and the page refetches to In progress. Append chunk C evidence; tick the employee checklist items that passed.
      Files: `apps/web/e2e/workflow.spec.ts`, `apps/web/e2e/employee.spec.ts`, `docs/phase5-verification.md`, `docs/IMPLEMENTATION_CHECKLIST.md`.
      Verify: base verification exit 0; `pnpm test:e2e` exit 0 (auth + admin + workflow + employee).

**Chunk C exit:** base verification + `pnpm test:e2e` exit 0; admin detail now includes comments, history and the feedback alert.

---

## Chunk D — POLISH, accessibility, screenshots, full e2e

Depends on A–C.

- [ ] D1. Automated accessibility checks.
      Add `@axe-core/playwright` 4.13.0 (dev, exact). `apps/web/e2e/a11y.spec.ts`: run `AxeBuilder().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` on `/login`, `/admin`, `/admin/tasks`, `/admin/tasks/new`, an admin task detail with the reject dialog open, `/admin/employees` with the dialog open, `/employee`, an employee task detail; assert **zero** violations (fix the UI, don't exclude rules; if a violation comes from a third-party internal, exclude only that selector with a comment and record it). Keyboard tests: first Tab focuses "Skip to main content" and Enter moves focus to `#main-content`; reject dialog opens with keyboard, Esc closes it and focus returns to the trigger; status Select operable with arrow keys + Enter; user menu opens with Enter and "Sign out" is reachable.
      Files: `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/e2e/a11y.spec.ts`, any components fixed.
      Verify: `pnpm test:e2e` exit 0 with a11y.spec passing.

- [ ] D2. UI polish pass.
      Per-page `metadata.title` on every route; one `<h1>` per page and logical `h2`s for cards/sections; consistent `PageHeader` spacing; every loading state is a skeleton matching its layout; every list/empty state has guidance + action; every mutation button shows pending state; error toasts show the API message (`apiErrorMessage`); tables scroll horizontally on small screens without page overflow; focus rings visible on all custom interactive elements (`focus-visible:ring-[3px] ring-ring/50`); confirm no `localStorage`/`sessionStorage`/`dangerouslySetInnerHTML` and no absolute API URL in `apps/web/src` (except the server dev fallback). Add a mobile e2e in `apps/web/e2e/responsive.spec.ts` (390×844): admin tasks page has no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`), sheet nav works, detail page readable.
      Files: `apps/web/src/**` as needed, `apps/web/e2e/responsive.spec.ts`.
      Verify: base verification exit 0; `pnpm test:e2e` exit 0.

- [ ] D3. Screenshots.
      `apps/web/e2e/screenshots.spec.ts` writes full-page PNGs at 1280×800 to `docs/screenshots/`: `login.png`, `admin-dashboard.png`, `admin-tasks.png`, `admin-task-detail.png` (with history), `admin-reject-dialog.png`, `admin-employees.png`, `employee-dashboard.png`, `employee-task-feedback.png` (feedback alert visible), and `mobile-nav.png` at 390×844 with the sheet open. Use the seeded/e2e data (no real personal data).
      Files: `apps/web/e2e/screenshots.spec.ts`, `docs/screenshots/*.png`.
      Verify: `pnpm test:e2e` exit 0 and the 9 files exist and open as images (read one with the image viewer).

- [ ] D4. Full verification and documentation.
      From the repo root: `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test` (api 201/201 still + web unit tests), `pnpm format:check`, `pnpm test:e2e` — all exit 0. Manual dev walkthrough against the dev DB (`pnpm db:up`, API `node dist/server.js` on :4000, web `pnpm --filter web start` on :3000) for both roles: login, dashboard, create → start → submit → reject → resubmit → approve, comment, delete; stop both servers. Finalise `docs/phase5-verification.md` (all commands, test counts per spec, deps added, shadcn edits, any third-party a11y exclusions, known limitations: UTC vs local overdue, login limiter behind the proxy). Add a "Phase 5 notes" subsection to `docs/ARCHITECTURE.md` §14 (routes, guards P2/P3, query keys, e2e ports/DB, decisions P1–P22 in short form) and update its status line. Tick remaining Phase 5 checklist items with evidence; leave any unverified item unticked with the reason.
      Files: `docs/phase5-verification.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_CHECKLIST.md`.
      Verify: the command list above, all exit 0, recorded with real output.

**Chunk D exit:** every command in D4 exits 0; all Phase 5 checklist items ticked with evidence or explicitly left open with a reason.

---

## 5. File map (end state, `apps/web`)

```
playwright.config.ts  vitest.config.ts  next.config.ts (distDir)
e2e/  prepare-db.mjs fixtures.ts auth.setup.ts auth.spec.ts admin.spec.ts workflow.spec.ts
      employee.spec.ts a11y.spec.ts responsive.spec.ts screenshots.spec.ts  (.auth/ gitignored)
src/proxy.ts
src/app/  layout.tsx page.tsx not-found.tsx
  (auth)/login/page.tsx
  (app)/layout.tsx error.tsx
  (app)/admin/  layout.tsx page.tsx employees/page.tsx
                tasks/page.tsx tasks/new/page.tsx tasks/[id]/page.tsx tasks/[id]/edit/page.tsx
  (app)/employee/ layout.tsx page.tsx tasks/[id]/page.tsx
src/components/ui/      shadcn (button + §2 list)
src/components/layout/  app-shell app-sidebar app-header user-menu nav-config skip-link
src/components/common/  status-badge priority-badge overdue-badge due-date stat-card
                        table-skeleton cards-skeleton pagination-controls error-state
                        empty-state page-header loading-button
src/components/providers.tsx
src/features/auth/      api/auth-api hooks/use-login hooks/use-logout
                        components/login-form components/current-user-provider
src/features/tasks/     api/tasks-api lib/list-params(.test)
                        hooks/use-task-queries hooks/use-task-mutations hooks/use-task-list-params
                        components/task-table task-filters task-list-section task-row-actions
                        task-form task-detail-view task-not-found task-actions reject-task-dialog
                        delete-task-dialog approval-queue task-feedback-alert task-comments task-history
src/features/users/     api/users-api hooks/use-employees hooks/use-create-employee
                        components/employees-table components/create-employee-dialog
src/features/dashboard/ api/dashboard-api hooks/use-dashboard-summary components/summary-cards
src/hooks/              use-debounced-value use-mobile
src/lib/                utils api/client(.test) api/errors api/server routes(.test) auth-redirect(.test)
                        dates(.test) labels workflow form-errors(.test) query-client query-keys
```
