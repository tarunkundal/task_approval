# Phase 5 verification — Frontend

Plan: `docs/phase5-plan.md`. Toolchain for every command: `source ~/.nvm/nvm.sh && nvm use 22.19.0` (Node 22.19.0, pnpm 10.12.4). Outputs below are trimmed copies of the real logs; nothing is paraphrased as a result that didn't run.

## Chunk A — Foundation (2026-10-11)

Not committed (orchestrator commits). No backend file changed (`git status` shows changes only under `apps/web`, root config files and `pnpm-lock.yaml`).

### Dependencies (exact pins)

`npm view <pkg> version` on 2026-10-11 returned exactly the plan's versions:

```
@tanstack/react-query 5.104.1   react-hook-form 7.89.0   @hookform/resolvers 5.9.1
zod 4.6.5   sonner 2.0.8   server-only 0.0.1   vitest 5.0.3   vite 8.3.4
@playwright/test 1.64.0   shadcn 4.21.4
```

Installed with `pnpm --filter web add -E …` (deps) and `pnpm --filter web add -D -E vitest@5.0.3 vite@8.3.4 @playwright/test@1.64.0`. `lucide-react` 1.55.0 was already present.
- `grep -nE '"(\^|~)' apps/web/package.json` → no matches (exit 1): no ranges.
- `grep -nE '"(cn|next-themes)"' apps/web/package.json` → no matches (exit 1).
- `pnpm install --frozen-lockfile` → `install-frozen-exit=0`.
- Playwright browser: `pnpm exec playwright install chromium` → downloaded Chrome for Testing 156.0.8078.4 (chromium v1248), `pwinstall-exit=0`. `PLAYWRIGHT_CHANNEL` not needed.

### shadcn components (CLI 4.21.4)

`CI=1 pnpm dlx shadcn@4.21.4 add input label textarea select dialog alert-dialog alert badge card table skeleton dropdown-menu sonner separator tooltip sheet sidebar field --yes < /dev/null` stopped at an overwrite prompt for `button.tsx` (stdin closed, so it exited instead of hanging) after writing 15 components. Re-ran `add alert-dialog sidebar field --yes --overwrite` → created `alert-dialog`, `sidebar`, `field`, `hooks/use-mobile.ts`; it also rewrote `button.tsx` and reported "Updating src/app/globals.css".

Post-processing:
1. `button.tsx` restored with `git checkout --`; `git diff --exit-code apps/web/src/components/ui/button.tsx` → `button-diff-exit=0` (re-checked in the final run).
2. Every generated `import { cn } from "cn"` → `import { cn } from "@/lib/utils"` (18 files); `grep -l 'from "cn"'` afterwards → no files.
3. `sonner.tsx`: `next-themes`/`useTheme` removed, fixed `theme="light"`.
4. `pnpm --filter web remove cn next-themes` → exit 0.
5. `globals.css`: unchanged (`git status` doesn't list it; the CLI update was a no-op).
6. React Compiler lint fixes: `sidebar.tsx` `SidebarMenuSkeleton` used `Math.random()` (`react-hooks/purity` error) → fixed width `"70%"`. `use-mobile.ts` rewritten with `useSyncExternalStore` over `matchMedia` (generated version called `setState` inside an effect).
7. Prettier applied to the generated files (`format:check` clean, below).

### What was built

- `src/lib/api/client.ts` — `createApiClient({ fetchImpl, onUnauthenticated })` + default `api`; relative `/api/v1${path}`, `credentials: 'same-origin'`, `cache: 'no-store'`, `Accept: application/json`; `Content-Type: application/json` only when a body is passed; 204 → `undefined`; 401 `UNAUTHENTICATED` → `window.location.assign('/login?next=<current path>')` unless already on `/login` (`INVALID_CREDENTIALS` never redirects).
- `src/lib/api/errors.ts` — `ApiError { status, code, message, details }`, `parseApiError` (standard shape, else `HTTP_ERROR`), `networkError` (`status 0`, `NETWORK_ERROR`), `validationIssues`.
- `src/lib/api/server.ts` — `import 'server-only'`; `getApiBaseUrl()` (`process.env.API_URL`, dev-only `localhost:4000` fallback, throws in production); `getCurrentUser` (React `cache`, forwards only `tas_token`, `no-store`; 401 → `null`, other failures throw); `requireUser()`, `requireRole(role)`. Imported only by server files: `app/page.tsx`, `(auth)/login/page.tsx`, `(app)/layout.tsx`, `(app)/admin/layout.tsx`, `(app)/employee/layout.tsx`.
- `src/proxy.ts` — Next 16 Proxy convention (checked in `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`: "The `middleware` file convention is deprecated and has been renamed to `proxy`", named `export function proxy`). Cookie-presence check via pure `proxyDecision()` (`src/lib/auth-redirect.ts`); sets `x-pathname` for return paths; never redirects `/login`.
- `src/lib/routes.ts` — `homeFor`, `safeReturnPath` (open-redirect guard), `loginPath`, section matchers.
- TanStack Query: `src/lib/query-client.ts` (`staleTime 30s`, retry ≤ 2 only for status 0 / ≥ 500, mutations never retry), `src/lib/query-keys.ts` (factory per P10), `src/lib/query-invalidation.ts` (cache effects for transition / create / update / delete / stale-task refetch), `src/components/providers.tsx` (`QueryClientProvider`, `TooltipProvider`, sonner `<Toaster position="top-right" closeButton />`).
- Forms: `src/lib/form-errors.ts` — `applyApiErrorToForm` (VALIDATION_ERROR details → fields, unknown paths → `root.server`, `EMAIL_TAKEN` → `email`, `INVALID_ASSIGNEE` → `assignedToId`), `apiErrorMessage`.
- Other pure modules: `dates.ts`, `labels.ts`, `workflow.ts` (`availableActions` adapter over shared `getAvailableActions`), `hooks/use-debounced-value.ts`.
- UI primitives: `components/common/{error-state (message + Retry), empty-state, loading-skeleton, loading-button, page-header}.tsx`; `app/error.tsx`, `app/(app)/error.tsx`, `app/not-found.tsx`.
- Auth feature: `features/auth/api/auth-api.ts`, `hooks/use-login.ts`, `hooks/use-logout.ts` (POST, `queryClient.clear()`, full navigation to `/login`, toast on failure), `components/login-form.tsx` (RHF + `zodResolver(loginSchema)` from `@workspace/shared`, inline field errors, `INVALID_CREDENTIALS`/`RATE_LIMITED` in a form-level alert, safe `?next=`), `components/current-user-provider.tsx`.
- Routes: `app/page.tsx` (redirect by role or to `/login`), `(auth)/login/page.tsx` (valid session → home), `(app)/layout.tsx` (`requireUser`), `(app)/admin/layout.tsx` / `(app)/employee/layout.tsx` (`requireRole`), placeholder `(app)/admin/page.tsx` ("Dashboard") and `(app)/employee/page.tsx` ("My tasks").
- App shell: `components/layout/{app-shell, app-sidebar, app-header, user-menu, nav-config, skip-link}`. shadcn sidebar (offcanvas on desktop, Sheet on mobile), `SidebarInset` = `<main id="main-content" tabIndex={-1}>`, skip link first, active link `aria-current="page"`, mobile links close the sheet, header shows name + role badge + account menu with "Sign out".
- Config: `vitest.config.mts` (node env, `TZ=Pacific/Honolulu`); `playwright.config.mts`; `next.config.ts` `distDir: process.env.NEXT_DIST_DIR || '.next'`; scripts `web test`, `web test:e2e`, root `test:e2e`; `.next-e2e/`, `test-results/`, `playwright-report/`, `apps/web/e2e/.auth/` in `.gitignore`, `.prettierignore` and web ESLint ignores; `tsconfig.json` includes `**/*.mts`.
  - Deviation from the plan: both configs use `.mts` instead of `.ts`. `apps/web/package.json` has no `"type": "module"`, so Vite warned about ESM in a CJS file, and Playwright loaded `playwright.config.ts` as CJS and failed on `import.meta` in the shared `e2e/test-env.mjs` helper ("Cannot use 'import.meta' outside a module").
- E2E harness: `e2e/test-env.mjs` (reads `apps/api/.env.test` with `node:util` `parseEnv`; refuses unless `NODE_ENV=test` and the DB name ends `_test`), `e2e/prepare-db.mjs` (`prisma migrate deploy` + `prisma db seed` against the test DB; api `node_modules/.bin` added to PATH so the seed's `tsx` resolves — first run failed with `spawn tsx ENOENT`), `e2e/fixtures.ts`, `e2e/auth.setup.ts` (one UI login per role → storage state), `e2e/auth.spec.ts`. API e2e server env = `.env.test` values + `NODE_ENV=test`, `PORT=4100`, `FRONTEND_URL=http://localhost:3100` (overrides the shell); web on 3100 with `API_URL=http://localhost:4100`; `reuseExistingServer: false`.

### Commands and results (final run)

```
pnpm install --frozen-lockfile                         install-frozen-exit=0
pnpm --filter web typecheck                            typecheck-exit=0   (next typegen && tsc --noEmit)
pnpm --filter web lint                                 lint-exit=0        (no errors, no warnings printed)
pnpm --filter web test                                 Test Files 5 passed (5) · Tests 50 passed (50) · test-exit=0
API_URL=http://localhost:4000 pnpm --filter web build  ✓ Compiled successfully · build-exit=0
    Route (app): ƒ /  ○ /_not-found  ƒ /admin  ƒ /employee  ƒ /login
    ƒ Proxy (Middleware)
pnpm format:check                                      All matched files use Prettier code style! · format-exit=0
pnpm --filter api test                                 Test Files 14 passed (14) · Tests 201 passed (201) · api-test-exit=0
```

Unit test files: `src/lib/api/client.test.ts` (relative URL, `same-origin`, JSON header only with a body, PATCH/DELETE, 204, error shape with array and object details, non-JSON 500 → `HTTP_ERROR`, JSON without the shape → `HTTP_ERROR`, fetch rejection → `NETWORK_ERROR`/0, `onUnauthenticated` for `UNAUTHENTICATED` only, not `INVALID_CREDENTIALS`; `shouldRetry`), `routes.test.ts` (`//evil.com`, `/\evil.com`, `https://…`, `javascript:`, `/login`, `/admin/../login`, control chars rejected; query/hash kept; `loginPath` encoding), `dates.test.ts` (asserts the Honolulu offset; `2026-01-01` → "Jan 1, 2026"; month/year/leap boundaries; local "today"; due today not overdue; COMPLETED never overdue), `form-errors.test.ts`, `auth-redirect.test.ts`.

### E2E (`CI=1 pnpm test:e2e`, Docker MySQL `task-approval-mysql` healthy)

Chain: shared build → api build → `prepare-db.mjs` ("MySQL database "task_approval_test" at "localhost:3307" … No pending migrations to apply"; seed "created admin@demo.com (ADMIN) … created 5 sample tasks") → `NEXT_DIST_DIR=.next-e2e API_URL=http://localhost:4100 next build` (lists `ƒ Proxy (Middleware)`) → `playwright test`.

```
Running 17 tests using 1 worker
  ✓  [setup] sign in as admin / employee1 / employee2
  ✓  signed out › an app route redirects to /login with the return path      (/admin/tasks → /login?next=%2Fadmin%2Ftasks)
  ✓  signed out › / redirects to /login
  ✓  signed out › an invalid session cookie lands on the login form without a loop   (bogus tas_token → /login?next=%2Fadmin, form shown)
  ✓  signed out › empty submit shows inline field errors                     (aria-invalid, "Password is required")
  ✓  signed out › wrong password shows an inline error and stays on /login   ("Invalid email or password")
  ✓  signed out › login with ?next= lands on the requested page              (/employee?status=PENDING)
  ✓  signed out › logout clears the session                                  (Sign out → /login; /admin → /login?next=%2Fadmin)
  ✓  admin session › /login and / redirect to the admin home
  ✓  admin session › the employee section redirects to /admin
  ✓  admin session › header shows name and role; admin navigation is shown   (Alex Admin, Admin, aria-current on Dashboard)
  ✓  admin session › user menu shows the account details
  ✓  employee session › the admin section redirects to /employee
  ✓  employee session › header shows name and role; only employee navigation is shown
  ✓  mobile navigation › the menu button opens the sheet; a link navigates and closes it   (390×844)
  17 passed (13.8s)
e2e-exit=0
ports-after-exit=1   (lsof: nothing listening on 3100/4100 afterwards)
```

The first full run had 16/17 passing: the employee test also visited `/admin/tasks`, which doesn't exist yet, so Next rendered the root 404 page (outside the admin layout) and no role redirect happened. That assertion was removed; chunk B's specs cover the deeper admin routes once they exist. A later `prettier --write` pass only reformatted files (no logic change).

Login budget per run: 3 setup logins + wrong password + `?next=` + logout = 6 UI logins (under the 10 per IP + email and 50 per IP limits; a fresh API process each run resets the in-memory limiters).

### Security invariants checked

- `grep -rnE 'localhost|https?://' apps/web/src` (non-test files): only `src/lib/api/server.ts:25` (dev fallback) and the `http://return.invalid` dummy base in `routes.ts` (used to detect paths that escape the origin).
- `grep -rnE 'localStorage|sessionStorage|dangerouslySetInnerHTML' apps/web/src` → no matches.
- No token handling in client code; the session is only the httpOnly cookie.

### Not covered yet / known limitations

- Toasts: the sonner region is mounted, and login / logout use it only for unexpected errors (network, 5xx). No e2e test triggers a toast yet; the mutation toasts arrive with chunk B.
- `/admin/tasks` and `/admin/employees` are 404 until chunk B (the mobile test only asserts the URL change for the Employees link).
- `query-invalidation.ts` helpers are plumbing for chunk B mutations; they aren't called yet.

### Review fixes (`docs/phase5-foundation-review.json`, iteration 2)

1. Error-boundary Retry (blocking): `src/app/error.tsx` and `src/app/(app)/error.tsx` now take Next's `retry` prop instead of `reset` and pass it to `ErrorState onRetry`. Checked against the bundled docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` says `retry()` "will try to re-fetch and re-render" (line 121), `reset()` re-renders "without re-fetching" (line 157), and the version table lists "`v16.3.0` | `retry` prop became stable" (line 331). `next/dist/client/components/error-boundary.d.ts` declares `retry: () => void`. The installed Next is 16.4.0.
2. `afterTaskUpdated` in `src/lib/query-invalidation.ts` now invalidates `queryKeys.dashboard.summary` as well as `tasks.lists()` (a `dueDate` edit changes `overdue`); the wrong comment is fixed, and the P10 edit line in `docs/phase5-plan.md` now reads "edit → `setQueryData(detail)` + lists + summary".
3. `src/app/(app)/error.tsx` renders `<h1 className="sr-only">Error</h1>`, matching the root boundary.

Commands (Node 22.19.0), each logged to `/tmp/p5-fix-*.log`:

```
pnpm --filter @workspace/shared build              shared-exit=0
pnpm --filter web typecheck                        typecheck-exit=0   ("✓ Types generated successfully", tsc no output)
pnpm --filter web lint                             lint-exit=0        (eslint . — no output, 0 errors / 0 warnings)
pnpm --filter web test                             test-exit=0        (Test Files 5 passed (5), Tests 50 passed (50))
API_URL=http://localhost:4000 pnpm --filter web build   build-exit=0  (Next.js 16.4.0 "✓ Compiled successfully";
                                                   routes ƒ /, ○ /_not-found, ƒ /admin, ƒ /employee, ƒ /login; "ƒ Proxy (Middleware)")
pnpm format:check                                  format-exit=0      ("All matched files use Prettier code style!")
```

Not re-run: `pnpm test:e2e`. The e2e paths don't reach either error boundary, and the invalidation helpers aren't called yet. Retry recovering from an API-down server render was not checked in a browser (the harness can't take the API down mid-test); chunk D or a manual check should cover it.

## Chunk B — Admin screens (2026-10-11)

Not committed (orchestrator commits). No backend or shared-package change: `git status --porcelain apps/api packages` → empty. No new dependency.

### Continuation note

The first chunk-B coder iteration failed on an infrastructure error and left untracked, unreviewed files. They were read in full and completed rather than rewritten. Changes made to that partial work:
- Removed an unplanned `/admin/approvals` page and its "Approvals" nav item (not in plan P1 or the spec's admin pages). `ApprovalQueue` is now the dashboard queue only (10 rows, `PENDING_APPROVAL`, `updatedAt asc`); when more are waiting, its "View all tasks awaiting approval" link opens `/admin/tasks?status=PENDING_APPROVAL&sort=updatedAt&order=asc`. Its timestamp column is labelled "Last updated" (it shows `updatedAt`, which an edit after submission also changes).
- `TaskDetailView` no longer renders comments and history (chunk C). It takes `slots` (`feedback` under the header, `main` under the details card, `aside` side column) that chunk C fills. The Overdue badge now sits with the status and priority badges in the header; the details card shows the due date as `<time data-testid="task-due-date">`.
- `task-comments.tsx` and `task-history.tsx` (written early by the failed iteration) are kept but not imported anywhere yet. They typecheck and lint, but they're unreviewed and unverified in a browser; chunk C plugs them in and tests them.

### What was built (plan B1–B8)

- Data layer: `features/tasks/api/tasks-api.ts` (ids `encodeURIComponent`-ed; start/submit/approve sent without a body), `lib/list-params.ts` (P12; each key validated with `taskListQuerySchema.shape[key]`, defaults omitted) + `list-params.test.ts` (11 tests), `lib/paths.ts` (admin hrefs, `isTaskNotFoundError` = 404 or 400 `VALIDATION_ERROR`), `hooks/use-task-queries.ts`, `use-task-mutations.ts` (P10 cache effects via `lib/query-invalidation.ts`, the plan's toast texts, stale 409/404 → toast + `refreshStaleTask`), `use-task-list-params.ts` (filters/search/sort `router.replace` + page 1; page `router.push`); `features/users/{api,hooks}`; `features/dashboard/{api,hooks}`.
- Shared display: `components/common/{status-badge,priority-badge,overdue-badge,due-date,stat-card,table-skeleton,pagination-controls}.tsx`; `features/tasks/components/{task-table,task-filters,task-list-section}.tsx` (debounced 300 ms title search, `all` sentinel for Radix Select, labelled controls, "No tasks yet" vs "No tasks match these filters" + Clear filters, empty-page recovery).
- `/admin`: `SummaryCards` (6 cards; status cards link to the filtered list; Overdue card has no link and says "Due before today (UTC) and not completed"), `ApprovalQueue` (Approve `LoadingButton` + `RejectTaskDialog`), `RecentTasks` (5 newest, assignee column, "View all tasks").
- `/admin/tasks`: `AdminTaskList` (search, status, priority, employee, sort, assignee column) + `TaskRowActions` (View, Edit unless COMPLETED, Delete → `DeleteTaskDialog`).
- `/admin/tasks/new`, `/admin/tasks/[id]/edit`: `TaskForm` (RHF + shared `createTaskSchema`, inline errors, API errors via `applyApiErrorToForm`, `<input type="date">` value sent as-is, assignee select with loading/error/"Create an employee first"; edit sends only dirty fields, Save disabled until dirty), `CreateTaskView`, `EditTaskView` (400/404 → `TaskNotFound`; COMPLETED → read-only notice; 409 `TASK_COMPLETED` on save → toast + refetch + back to detail).
- `/admin/tasks/[id]`: `TaskDetailView` + `TaskActions` (buttons from `availableActions`; admin Edit/Delete; all disabled while a transition is pending) + `DeleteTaskDialog` (navigates to `/admin/tasks` after delete) + `TaskNotFound`.
- `/admin/employees`: `EmployeesTable` + `CreateEmployeeDialog` (shared `createUserSchema`, `autoComplete="new-password"`, "At least 8 characters." hint, 409 `EMAIL_TAKEN` → Email field error, dialog stays open).

### Commands and results (Node 22.19.0, logs in `/tmp/p5-b-*.log`)

```
pnpm --filter @workspace/shared build                    shared-exit=0
pnpm --filter web typecheck                              typecheck-exit=0   ("✓ Types generated successfully"; re-run after the last e2e edit: exit 0)
pnpm --filter web lint                                   lint-exit=0        (eslint . — no output; re-run after the last e2e edit: exit 0)
pnpm --filter web test                                   test-exit=0        (Test Files 6 passed (6), Tests 61 passed (61))
API_URL=http://localhost:4000 pnpm --filter web build    build-exit=0       (Next.js 16.4.0 "✓ Compiled successfully";
    routes ƒ /, ○ /_not-found, ƒ /admin, ƒ /admin/employees, ƒ /admin/tasks, ƒ /admin/tasks/[id],
    ƒ /admin/tasks/[id]/edit, ƒ /admin/tasks/new, ƒ /employee, ƒ /login; "ƒ Proxy (Middleware)")
grep -rlE "localhost:4000|localhost:4100" apps/web/.next/static    no matches (grep-exit=1)
pnpm format:check                                        format-exit=0      ("All matched files use Prettier code style!")
```

`pnpm --filter api test` was not re-run: no file under `apps/api` or `packages` changed (chunk A's run: 201/201).

### E2E (`CI=1 pnpm test:e2e`, Docker `task-approval-mysql` "Up 11 hours (healthy)")

Chain as in chunk A (prepare-db: "No pending migrations to apply", seed ran; e2e build lists all admin routes and `ƒ Proxy (Middleware)`). Final run, after adding the employee → admin sub-route redirects to auth.spec:

```
Running 31 tests using 1 worker
  ✓  [setup] sign in as admin / employee1 / employee2
  ✓  admin.spec › dashboard › shows the six counts, the approval queue and recent tasks
  ✓  admin.spec › dashboard › a new task shows up in the counts
  ✓  admin.spec › create task › validates inline, then creates the task with the date as entered   (timezoneId Pacific/Honolulu)
  ✓  admin.spec › task list › search, status and employee filters live in the URL
  ✓  admin.spec › task list › sort and pagination
  ✓  admin.spec › task list › invalid URL parameters fall back to defaults instead of failing
  ✓  admin.spec › edit and delete › edit the title from the detail page
  ✓  admin.spec › edit and delete › delete from the row menu after confirming
  ✓  admin.spec › edit and delete › a malformed task id shows "Task not found"
  ✓  admin.spec › review › approve from the dashboard queue
  ✓  admin.spec › review › reject requires a reason and returns the task to In progress
  ✓  admin.spec › review › a stale approve shows the API error and refetches the task
  ✓  admin.spec › employees › create an employee; a duplicate email is a field error
  ✓  admin.spec › employees › a new employee is offered as an assignee
  ✓  auth.spec › 14 tests (as in chunk A; the employee test now also checks /admin/tasks, /admin/tasks/new, /admin/employees → /employee)
  31 passed (32.3s)
e2e-exit=0
lsof -iTCP:3100 -iTCP:4100 -sTCP:LISTEN → nothing (ports-exit=1)
```

The previous run (before the auth.spec addition) was also 31/31 passed (31.0s), e2e-exit=0.

What admin.spec asserts (setup goes through `APIRequestContext` against `http://localhost:3100/api/v1` with the saved storage state and `Origin: http://localhost:3100`; titles are `E2E <timestamp> …`; no absolute counts):
- Dashboard: each of the 6 `stat-*` values matches `^\d+$`; the Pending approval card links to `/admin/tasks?status=PENDING_APPROVAL`; "Approval queue" h2; "Recent tasks" table with an Assignee column; Total goes up by exactly one after an API create and reload.
- Create: empty submit → "Title is required" (+ `aria-invalid`), "Enter a valid due date", "Select an employee"; valid submit → toast "Task created", detail URL, h1 = title, Pending + High badges, due date "Mar 1, 2027" with `datetime="2027-03-01"` under Honolulu, assignee email shown.
- List: search → `q=` in the URL and exactly the 2 run-specific rows; Status Pending → `status=PENDING`, reload keeps the URL, the Status control and the search text; Employee → `assignedToId=<employee1 id>`, 1 row with that assignee; Completed → "No tasks match these filters"; Clear filters → `/admin/tasks` with an empty search box. `?pageSize=2` → "Page 1 of N", Next → `page=2`, Back → page 1; "Due date: soonest" → `sort=dueDate&order=asc` with no `page`. `?status=DONE&page=-1&foo=bar` → "All statuses" and rows render (no 400).
- Edit: Save disabled until a change; toast "Task updated"; detail h1 shows the new title; due date unchanged.
- Delete: row menu → "Delete this task?" alertdialog; Cancel keeps the row; confirm → toast "Task deleted", empty state; detail URL → "Task not found". `/admin/tasks/not-a-cuid` → "Task not found".
- Review: employee1 starts + submits via API; Approve in the dashboard queue → toast "Task approved", row leaves the queue; detail shows Completed, no Edit/Approve; edit page shows "This task is completed" with no Save button. Reject dialog: empty → "A rejection reason is required" + `aria-invalid`; "27/1000 characters"; valid → toast "Task returned to the employee", dialog closes, badge In progress, no Approve/Reject. Stale: approved via API while the page shows Pending approval, then Approve → toast "Task cannot be approved while its status is COMPLETED" (the API's 409 message) and the page refetches to Completed.
- Employees: seeded employee1 listed; empty submit → "Name is required", "Password must be at least 8 characters"; create → toast "Employee account created for E2E Employee", dialog closes, row with the new email; reopen → empty form; same email → "A user with this email already exists" on Email (`aria-invalid`), dialog stays open. A user created via API is offered in the new-task assignee select.

`beforeAll` approves any `E2E…` task left in PENDING_APPROVAL by an interrupted run, so leftovers can't push this run's task off the dashboard queue's first 10 rows. Login budget is unchanged (3 setup + 3 auth.spec UI logins).

### Security invariants checked

- `apps/web/src`: no `localStorage`, `sessionStorage` or `dangerouslySetInnerHTML`. The only `localhost`/absolute URLs are the dev fallback in `src/lib/api/server.ts` and the `http://return.invalid` dummy base in `routes.ts` (plus test fixtures in `routes.test.ts`).
- `@/lib/api/server` is imported only by `app/page.tsx`, `(auth)/login/page.tsx`, `(app)/layout.tsx`, `(app)/admin/layout.tsx`, `(app)/employee/layout.tsx` (server files).
- Every client call uses relative `/api/v1` paths through `src/lib/api/client.ts`; `.next/static` has no `localhost:4000`/`4100`.

### Not covered yet / known limitations

- The Priority filter shares the Status filter's code path but has no dedicated e2e assertion.
- The API's 400 `VALIDATION_ERROR` → field mapping on the task form is only unit-tested (`form-errors.test.ts`): the client schema matches the API's, so no e2e path reaches it. The 409 `TASK_COMPLETED` race on edit save is not exercised in e2e (the stale-approve 409 path is).
- The dashboard Overdue card uses the API's UTC count while row badges use the viewer's local date (plan §3 item 2).
- Comments, history and the feedback alert aren't on the admin detail page yet (chunk C slots).
- Keyboard-only and axe checks are chunk D.

## Chunk C — Employee screens + shared task-detail components (2026-10-11)

Not committed (orchestrator commits). No backend or shared-package change, no new dependency. No API.md mismatch found.

### What was built (plan C1–C6)

- C1 `task-actions.tsx`: workflow buttons still come from `availableActions`, then are filtered to `start`/`submit` unless `user.role === 'ADMIN'` (a second guard besides the shared helper). Edit/Delete stay behind `isAdmin`. Start "Start task" (PENDING) and "Submit for approval" (IN_PROGRESS) use `useTaskTransition` (disabled while pending, toasts, 409/404 → toast + `refreshStaleTask`, invalidation incl. `dashboard.summary` and history).
- C2 `task-feedback-alert.tsx` (new): renders only when `latestRejectionReason` is set; amber `Alert` with MessageSquareWarning, title "Admin feedback" (employee) / "Returned with feedback" (admin), reason `whitespace-pre-wrap`, "From <reviewer> · <reviewedAt>", and for employees "Address the feedback, then submit the task for approval again."
- C3 `task-comments.tsx` (written by the failed chunk-B iteration, now reviewed and wired): `<ol aria-label="Comments">` oldest first with author, role badge, `<time>`; skeleton / error + Retry / empty "No comments yet"; RHF + shared `createCommentSchema`, labelled textarea, `maxLength 2000`, live count, inline error, button pending state, reset on success, toast "Comment added". Change: non-field errors now go through `reportTaskError` (toast + refetch on 404/409) instead of a plain toast.
- C4 `task-history.tsx` (same origin, unchanged): `<ol aria-label="Status history">`, "Created" or from → to badges with an sr-only "Changed from … to …" sentence, actor + role, `<time>`, reasons in a highlighted "Rejection reason" block.
- C5 `task-detail-view.tsx`: default slots now render `TaskFeedbackAlert` (under the header), `TaskComments` (under the details card) and `TaskHistory` (side column) for both roles. `summary-cards.tsx`: `scope="own"` variant ("Assigned to you", own-tasks overdue wording; cards link to `/employee?status=…`). New `features/tasks/components/employee-task-list.tsx` (`TaskListSection` with status/priority/sort only, no search, no employee filter, no assignee column, no row actions; links to `/employee/tasks/<id>`). `lib/paths.ts`: `EMPLOYEE_HOME_PATH`, `employeeTaskHref`. Pages: `(app)/employee/page.tsx` (PageHeader "My tasks", own `SummaryCards`, "Assigned tasks" h2 + `<Suspense>` list), `(app)/employee/tasks/[id]/page.tsx` (`TaskDetailView`, back link "Back to my tasks").
- C6 e2e: `e2e/workflow.spec.ts`, `e2e/employee.spec.ts`, plus `e2e/helpers.ts` (API-context, toast, select and "no admin controls" helpers shared by the two new specs; `admin.spec.ts` keeps its own copies, untouched).

### Commands and results (Node 22.19.0, logs in `/tmp/p5-c-*.log`)

```
pnpm --filter @workspace/shared build                    shared-exit=0
pnpm --filter web typecheck                              typecheck-exit=0   ("✓ Types generated successfully"; re-run after the last e2e edit: exit 0)
pnpm --filter web lint                                   lint-exit=0        (eslint . — no output; re-run after the last e2e edit: exit 0)
pnpm --filter web test                                   test-exit=0        (Test Files 6 passed (6), Tests 61 passed (61))
API_URL=http://localhost:4000 pnpm --filter web build    build-exit=0       (Next.js 16.4.0; routes now include ƒ /employee/tasks/[id];
                                                                              "ƒ Proxy (Middleware)")
pnpm format:check                                        format-exit=0      ("All matched files use Prettier code style!"; re-run: exit 0)
```

### E2E (`CI=1 pnpm test:e2e`, Docker `task-approval-mysql` "Up About an hour (healthy)")

prepare-db: "No pending migrations to apply"; seed kept the 3 users, "skipped sample tasks (23 task(s) already exist)". First run: 39/40 — `employee.spec` "no admin controls" matched `getByRole('link', { name: 'Edit' })` against task titles from admin.spec ("E2E … edit (renamed)", substring match). Fixed by matching `Edit`/`Delete`/`Employees` with `exact: true`. Final run:

```
Running 40 tests using 1 worker
  ✓  [setup] sign in as admin / employee1 / employee2
  ✓  admin.spec › 14 tests (unchanged)
  ✓  auth.spec › 14 tests (unchanged)
  ✓  employee.spec › dashboard › shows the own counts and the assigned list without admin controls
  ✓  employee.spec › dashboard › status and priority filters live in the URL and survive reload
  ✓  employee.spec › dashboard › a summary card opens the filtered list
  ✓  employee.spec › overdue › past-due open tasks show an Overdue badge; future and completed ones do not
  ✓  employee.spec › scope › another employee's task id shows Task not found
  ✓  employee.spec › scope › a malformed task id shows Task not found
  ✓  employee.spec › task detail › in progress: Submit only, comments and history, no admin controls
  ✓  employee.spec › task detail › a stale Start shows the API error and refetches the task
  ✓  workflow.spec › create → start → submit → reject → comment → resubmit → approve
  40 passed (58.8s)
e2e-exit=0
lsof -iTCP:3100 -iTCP:4100 -sTCP:LISTEN → nothing (ports-exit=1)
```

What the new specs assert (no absolute counts; titles `E2E <timestamp> …`; setup via `APIRequestContext` with saved sessions and `Origin: http://localhost:3100`):
- workflow.spec (admin + employee1 contexts): admin creates the task in the UI (High, due 2030-01-15, Jordan Lee); employee1's `/employee` row shows Pending + High, the table has no Assignee column; detail shows "Start task" only, no Submit, no Edit/Delete/Approve/Reject/New task/Employees/row menu; Start → toast "Task started", In progress; Submit → toast "Submitted for approval", Pending approval, no workflow buttons; admin Reject empty → "A rejection reason is required", then a two-line reason → toast, In progress, admin sees "Returned with feedback"; employee1 sees "Admin feedback", "From Alex Admin" and `task-feedback-reason` with exactly the two-line reason; empty comment → "Comment cannot be empty" + `aria-invalid`; comment → live count, toast "Comment added", item with "Jordan Lee", textarea cleared; admin sees the comment with "Jordan Lee" and "Employee"; resubmit → feedback alert gone; admin Approve → toast, Completed, no Edit/Approve; both roles see 6 history entries in order (Created by Alex Admin; Pending→In progress, In progress→Pending approval by Jordan Lee; Pending approval→In progress by Alex Admin; In progress→Pending approval; Pending approval→Completed), exactly one "Rejection reason" block, on entry 4.
- employee.spec: stat Total/Pending equal `GET /dashboard/summary` as employee1; the other four are numbers; the Pending approval card links to `/employee?status=PENDING_APPROVAL`; employee1's new task is listed with href `/employee/tasks/<id>`, employee2's isn't; no search box or Employee filter. Status Pending → `status=PENDING`, survives reload with the control restored; Priority High → `priority=HIGH` (status kept), LOW row hidden, survives reload; Completed + Clear filters → `/employee`. In-progress card → `/employee?status=IN_PROGRESS` with the control set. Overdue under `Pacific/Honolulu` as employee2: IN_PROGRESS task due 2020-01-15 shows "Overdue" and "Jan 15, 2020" in the row and the detail header; a 2031 task and a COMPLETED past-due task show no badge. employee2 opening employee1's task → "Task not found" (title not shown, back link `/employee`); `/employee/tasks/not-a-cuid` → "Task not found". IN_PROGRESS detail: Submit only, "No comments yet", History with 2 entries, no feedback alert, no admin controls. Stale Start: two tabs on the same PENDING task, Start in one → toast "Task started"; Start in the other → toast "Task cannot be started while its status is IN_PROGRESS" (API 409 message), page refetches to In progress with Submit offered.

Login budget unchanged: the new specs reuse the setup storage states (no extra UI logins).

### Security invariants checked

- `grep -rnE 'localStorage|sessionStorage|dangerouslySetInnerHTML' apps/web/src` → no matches (exit 1).
- `grep -rlE 'localhost:4000|localhost:4100' apps/web/.next/static` → no matches (exit 1).
- `lib/api/server` imported only by `app/page.tsx`, `(auth)/login/page.tsx`, `(app)/layout.tsx`, `(app)/admin/layout.tsx`, `(app)/employee/layout.tsx`.
- Client calls still go through relative `/api/v1` paths (`tasks-api.ts`, unchanged).

### Not covered yet / known limitations

- The seeded past-due task ("Draft security awareness newsletter") isn't asserted directly; the overdue test creates its own past-due task so it doesn't depend on seed age or leftover data.
- Comment add errors other than validation (404 after a delete/reassign) are toasted + refetched but not exercised in e2e.
- The employee Overdue card uses the API's UTC count while row badges use the viewer's local date (plan §3 item 2).
- Keyboard-only and axe checks are chunk D.

## Chunk D — Accessibility, polish, screenshots, full verification (2026-10-12)

Not committed (orchestrator commits). No backend, shared-package or `PROJECT_SPEC.md` change: `git status --porcelain apps/api packages PROJECT_SPEC.md` → empty. No API.md mismatch found.

### Dependency

- `@axe-core/playwright` **4.13.0** (dev, exact). `npm view @axe-core/playwright@4.13.0` reports peer `playwright-core >= 1.0.0` and dep `axe-core ~4.13.0`. Installed with `pnpm --filter web add -D -E @axe-core/playwright@4.13.0` (exit 0). `pnpm-lock.yaml` resolves it as `4.13.0(playwright-core@1.64.0)`, and `playwright-core@1.64.0` is the only `playwright-core` in the lockfile. (`axe-core@4.14.0` also appears; it belongs to `eslint-plugin-jsx-a11y`.)

### What was built / changed

- **`e2e/a11y.spec.ts` (19 tests).**
  - **Pages.** `AxeBuilder().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` finds zero violations, with **no rule or selector exclusions**, on:
    - login, empty and with field errors
    - `/admin`, `/admin/tasks`, and `/admin/tasks/new` (empty and with errors)
    - an admin task detail: closed, with the reject dialog open, and with the dialog's inline error
    - an admin detail with feedback, comments and history
    - the delete confirmation alertdialog
    - `/admin/tasks/not-a-cuid`
    - `/admin/employees`, closed and with the "New employee" dialog open
    - `/employee`
    - an employee task detail with the feedback alert
    - the 390 px dashboard with the navigation sheet open
  - **Page structure.** Every page scanned by axe also asserts exactly one `<h1>` and a page-specific `<title>` (`… · Task & Approval`).
  - **Harness check.** One test plants an unlabelled `<input>` and asserts that axe reports `label`, so a broken setup can't pass silently.
  - **Waiting.** Before each scan, `settle()` (`e2e/helpers.ts`) waits for skeletons to disappear and for finite CSS animations to finish.
  - **Keyboard.**
    - Login form: the first Tab is "Skip to sign-in form", then Email → Password → Sign in, each `:focus-visible`. Enter in the password field submits and shows "Invalid email or password".
    - Skip link: the first Tab on `/admin` is "Skip to main content" (visible, `:focus-visible`). Enter focuses `#main-content`, and the next Tab stays inside it.
    - Reject dialog: opens with Enter and focus moves inside. The reason field is reachable with Tab and has a visible focus ring. Escape closes the dialog, focus returns to the Reject trigger, and the status stays "Pending approval".
    - Status select: ArrowDown opens it on "All statuses", ArrowDown again moves to "Pending", and Enter sets `status=PENDING` with focus back on the trigger.
    - Account menu: Enter opens it with "Sign out" focused. Escape closes it and focus returns.
- **`e2e/responsive.spec.ts` (5 tests, 390×844).**
  - No horizontal page overflow (`document.documentElement.scrollWidth <= innerWidth`) on `/admin`, `/admin/tasks`, `/admin/tasks/new`, `/admin/employees`, `/employee` and both task detail pages.
  - On `/admin/tasks`, the table's `[data-slot="table-container"]` is `overflow-x: auto` and wider than its box, so the table scrolls and the page doesn't.
  - The sheet navigates to Tasks and closes.
  - A long task title wraps within 390 px, and Edit/Delete stay in the viewport.
- **`e2e/error-boundary.spec.ts` (1 test).** This is the chunk A follow-up from `docs/phase5-foundation-review.md`.
  - **Setup.** The spec starts a second `next start` of the `.next-e2e` build on port 3101. Its runtime `API_URL` points at 4101, where nothing is listening yet.
  - **API down.** Loading `/admin` with the admin session renders the root boundary: "Something went wrong", "The application could not reach the server." and a Retry button, with no app header.
  - **API back.** The spec starts the API on 4101 through `e2e/start-api.mjs`, which applies the same `.env.test` guard and settings as the shared e2e API. After Retry, the header shows "Alex Admin", the "Dashboard" h1 and a numeric Total card render, the error text is gone and the URL is still `/admin`. This confirms that Next 16.4's `retry` re-runs the failed server render.
  - **Cleanup.** Both extra processes are stopped with a process-group SIGTERM, and the spec asserts both ports are free afterwards.
  - `start-api.mjs` exists because Playwright's CJS spec loader can't import `test-env.mjs` ("Cannot use import statement outside a module").
- **`e2e/screenshots.spec.ts` (10 tests).** Writes PNGs to `docs/screenshots/phase5/`.
  - Its demo tasks use the fictional "Northwind" prefix. Earlier copies are deleted through the API first, so reruns don't pile up.
  - Each capture grows the viewport to the page height before the shot. In the first set of images, a plain `fullPage` capture cut the fixed sidebar and the dialog overlay off at 800 px.
- **Smoke-test additions.**
  - `auth.spec.ts`: login error toasts, both mocked with `page.route` so they never reach the API. A non-JSON 500 shows "The server could not complete the request. Please try again." with no inline alert; the URL stays `/login` and Sign in is enabled again. An aborted request shows "Could not reach the server…".
  - `employee.spec.ts`: employee1 opening employee2's task sees "Task not found", with no title and no workflow buttons. Commenting on a task the admin deleted in the meantime shows an error toast and then "Task not found" (employee review follow-up).
  - `admin.spec.ts`: deleting from the detail page shows the toast and goes to `/admin/tasks`. The row is gone, and Back shows "Task not found" rather than a cached copy (admin review #5).
  - `workflow.spec.ts`: after creating the task in the UI, the admin finds it at `/admin/tasks?q=<title>&status=PENDING`. The Status control shows "Pending", and picking the employee adds `assignedToId`, leaving exactly one row with the title and "Jordan Lee".
- **UI polish from the screenshots.** In `summary-cards.tsx`, the grid changed from `xl:grid-cols-6` to `2xl:grid-cols-6`. At 1280 px next to the sidebar, the six cards had wrapped labels ("Total / tasks", "Pending / approval") and the counts sat at different heights. The cards now use 3 columns × 2 rows up to 1536 px. No other visual defect was found (see the image review below).
- **`e2e/helpers.ts`.** New `startAndSubmit()` and `settle()`.

D2 polish checklist, re-checked in the code and by the specs above:
- Every route exports `metadata.title`, and the axe pages assert it.
- One `<h1>` per page (asserted).
- Loading states are skeletons, in place since chunks A–C. `settle()` waits for them to disappear, so each skeleton rendered and then resolved.
- Empty states give guidance and an action ("No tasks match these filters" + Clear filters, "No comments yet", "No employees yet").
- Mutation buttons use `LoadingButton` (disabled, `aria-busy` and a spinner while pending).
- Error toasts carry the API message, for example the 409 messages in the admin and employee specs and the login toasts above.
- Tables scroll inside their container (responsive spec).
- Focus rings show on custom links, the skip link, inputs and the select trigger (`:focus-visible` assertions).

### Security invariants

- `apps/web/src`: no `localStorage`, `sessionStorage` or `dangerouslySetInnerHTML`. The only `localhost` or absolute URLs are the dev fallback `http://localhost:4000` in `src/lib/api/server.ts`, the `http://return.invalid` dummy base in `routes.ts`, and fixtures in `routes.test.ts`. The only `document.cookie` write is shadcn's non-sensitive `sidebar_state`.
- `@/lib/api/server` is imported only by `app/page.tsx`, `(auth)/login/page.tsx`, `(app)/layout.tsx`, `(app)/admin/layout.tsx` and `(app)/employee/layout.tsx`.
- `grep -rlE 'localhost:4000|localhost:4100' apps/web/.next/static` → no matches (`staticgrep-exit=1`).

### Commands and results (Node 22.19.0; each step logged to `/tmp/p5-d-v-*.log`)

Environment note: whenever `prisma generate` (and so `pnpm --filter api build`) ran from a `nohup` background job with an inherited stdin, it hung indefinitely after writing the client. With `< /dev/null` it finishes in about 50 ms ("✔ Generated Prisma Client (7.10.0)"). All verification steps now run with stdin closed. The hung processes were killed; no repo file was affected.

```
pnpm install --frozen-lockfile                          install-exit=0   ("Lockfile is up to date", "Done in 3.1s")
pnpm --filter @workspace/shared build                   shared-exit=0
pnpm --filter web typecheck                             webtypecheck-exit=0  ("✓ Types generated successfully")
pnpm --filter web lint                                  weblint-exit=0   (no output: 0 errors, 0 warnings)
pnpm --filter web test                                  webtest-exit=0   (Test Files 6 passed (6), Tests 61 passed (61))
API_URL=http://localhost:4000 pnpm --filter web build   webbuild-exit=0  ("✓ Compiled successfully"; ƒ /, ○ /_not-found, ƒ /admin,
    ƒ /admin/employees, ƒ /admin/tasks, ƒ /admin/tasks/[id], ƒ /admin/tasks/[id]/edit, ƒ /admin/tasks/new,
    ƒ /employee, ƒ /employee/tasks/[id], ƒ /login; "ƒ Proxy (Middleware)")
grep -rlE 'localhost:4000|localhost:4100' apps/web/.next/static   staticgrep-exit=1 (no matches)
pnpm format:check                                       format-exit=0    ("All matched files use Prettier code style!")
pnpm -r typecheck                                       rtypecheck-exit=0 (shared, web, api: Done)
pnpm -r lint                                            rlint-exit=0     (shared, api, web: Done)
API_URL=http://localhost:4000 pnpm -r build             rbuild-exit=0    (shared, api incl. prisma generate, web: Done)
pnpm --filter api test                                  apitest-exit=0   (Test Files 14 passed (14), Tests 201 passed (201))
```

### E2E (`CI=1 pnpm test:e2e`, Docker `task-approval-mysql` "Up 3 hours (healthy)")

Chain: shared build → api build → prepare-db ("No pending migrations to apply", seed executed) → `.next-e2e` build ("ƒ Proxy (Middleware)") → Playwright.

The first full run passed 79/80. My new workflow step left the admin page on the task list, and the next step reloads the detail page. The step now clicks back into the detail. Web typecheck, lint and `format:check` were re-run after the fix (all exit 0), then the suite again:

```
Running 80 tests using 1 worker
  setup                 3 passed   (admin, employee1, employee2 UI logins)
  a11y.spec.ts         19 passed
  admin.spec.ts        15 passed   (+1: delete from the detail page)
  auth.spec.ts         16 passed   (+2: login 500 toast, login network-failure toast)
  employee.spec.ts     10 passed   (+2: employee1 → employee2's task, comment on a deleted task)
  error-boundary.spec   1 passed
  responsive.spec.ts    5 passed
  screenshots.spec.ts  10 passed
  workflow.spec.ts      1 passed   (now includes the URL-filter list step)
  80 passed (1.1m)
e2e-exit=0
lsof -iTCP:3100 -iTCP:4100 -iTCP:3101 -iTCP:4101 -sTCP:LISTEN → nothing (ports-exit=1)
```

Login budget: 3 setup logins plus 4 real UI login attempts (wrong password, `?next=`, logout, keyboard wrong password). The two toast tests are intercepted by `page.route` and never reach the API. The admin email gets 3 attempts in total, under the limit of 10 per IP + email.

`pnpm --filter api test` clears the shared `task_approval_test` tables. E2E data, and the counts in the screenshots, therefore shrink after an API test run; prepare-db re-seeds. E2E assertions never depend on absolute counts.

### Screenshots (`docs/screenshots/phase5/`, all read with the image viewer)

| File | Content | Review |
|---|---|---|
| `login.png` | Sign-in card, 1280×800 | OK |
| `admin-dashboard.png` | 6 counts (3×2), approval queue (2), recent tasks | First version had wrapped card labels and a cut-off sidebar. Fixed (grid + capture). |
| `admin-tasks.png` | `?q=Northwind&sort=dueDate&order=asc`: search, filters, sort, Clear filters, 5 rows incl. an Overdue badge | OK |
| `admin-task-detail.png` | Completed task: details, 2 comments, 6-entry history with a highlighted rejection reason | First version had a cut-off sidebar. Fixed. |
| `admin-reject-dialog.png` | Reject dialog with a typed reason, 64/1000 count | First version's overlay ended at 800 px. Fixed. |
| `admin-employees.png` | Employees table (seeded + fake e2e-created accounts) | OK |
| `employee-dashboard.png` | Own counts, status/priority/sort filters, 10 rows, pagination | Same card fix |
| `employee-task-feedback.png` | "Admin feedback" alert, Submit for approval, history with the reason | OK |
| `mobile-admin-dashboard.png` | 390 px full page: stacked cards, tables scrolling inside their containers | OK |
| `mobile-nav.png` | 390 px with the navigation sheet open | OK |

All data comes from the seed and from e2e runs ("Northwind …" tasks, `@demo.com` accounts). No real personal data is shown.

### Not covered / known limitations

- The manual walkthrough against the **dev** DB (plan D4) was not done. Both roles' end-to-end flows run in real Chromium against the real API and the test DB (workflow.spec plus the admin and employee specs), but nobody has clicked through on port 3000.
- Two admin review findings are still open (non-blocking; unit coverage accepted): the API 400 `details` → field mapping on the task form (covered only by `form-errors.test.ts`), and the edit-save `TASK_COMPLETED`/404 race in `EditTaskView`.
- Employee review finding #1 is still open: hidden `q`/`assignedToId` URL keys narrow the employee list with no visible control. Fixing it changes behaviour, so it's left for a product decision.
- The dashboard Overdue card uses the API's UTC date, while badges use the viewer's local date (plan §3 item 2).
- axe checks only the WCAG A/AA rules it can automate. Full WCAG conformance still needs manual testing with assistive technology and an expert review.
