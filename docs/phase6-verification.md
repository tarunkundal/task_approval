# Phase 6 verification (testing and hardening)

All runs on 2026-10-12, macOS, Node 22.19.0 (`nvm use 22.19.0`), pnpm 10.12.4, Docker MySQL 8.4 container `task-approval-mysql` (healthy, host port 3307). Only the local Docker databases `task_approval` (dev) and `task_approval_test` were touched. Outputs below are summaries of the real logs; counts are copied from them.

## 1. Install, typecheck, lint, build, format

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | `exit=0`. "Lockfile is up to date… Already up to date"; shared `prepare` and api `postinstall` (`prisma generate`, Prisma Client 7.10.0) Done |
| `pnpm -r typecheck` | `exit=0` (shared `tsc --noEmit`; api `prisma generate && tsc`; web `next typegen && tsc`) |
| `pnpm -r lint` | `exit=0` (shared, api, web: Done) |
| `API_URL=http://localhost:4000 pnpm -r build` | `exit=0`. shared + api `tsc` Done; web `next build` (Next.js 16.4.0, Turbopack): compiled, TypeScript finished, 9/9 static pages, 11 routes + `ƒ Proxy (Middleware)` |
| `pnpm format:check` | `exit=0`, "All matched files use Prettier code style!" |

## 2. Fresh databases → migrate → seed → full test suites

Prisma 7's `migrate reset` has no `--skip-seed` flag and no longer runs the seed itself, so a reset leaves empty tables; the seed was run explicitly.

**Dev DB `task_approval`** (`apps/api/.env`), run from `apps/api`:

| Step | Result | Rows: users / tasks / history / comments |
| --- | --- | --- |
| before | (state left by earlier work) | 3 / 7 / 24 / 1 |
| `prisma migrate reset --force` | "Database reset successful", applied `20261010172057_init`, `reset_exit=0` | 0 / 0 / 0 / 0 |
| `prisma migrate deploy` | "No pending migrations to apply.", `deploy_exit=0` | 0 / 0 / 0 / 0 |
| `pnpm db:seed` (1st) | `created` admin@demo.com (ADMIN), employee1@demo.com, employee2@demo.com (EMPLOYEE); "created 5 sample tasks with status history", `seed1_exit=0` | 3 / 5 / 14 / 0 |
| `pnpm db:seed` (2nd) | `kept` ×3 users; "skipped sample tasks (5 task(s) already exist)", `seed2_exit=0` | 3 / 5 / 14 / 0 |

Users after both runs: exactly `admin@demo.com`, `employee1@demo.com`, `employee2@demo.com`.

**Test DB `task_approval_test`**: `node apps/web/e2e/prepare-db.mjs --reset` (guarded by `loadTestEnv`: `NODE_ENV=test`, DB name ends in `_test`) ran `prisma migrate reset --force` → `migrate deploy` ("No pending migrations") → `db seed` (created 3 users, 5 sample tasks), `prepare_exit=0`; rows 3 / 5 / 14 / 0.

**Suites**, run right after:

| Command | Result |
| --- | --- |
| `pnpm --filter api test` | Test Files 16 passed (16), **Tests 207 passed (207)**, 23.2 s, `exit=0` |
| `pnpm --filter web test` | Test Files 6 passed (6), **Tests 61 passed (61)**, `exit=0` |
| `CI=1 pnpm test:e2e` (in `apps/web`, test DB, ports 3100/4100) | **82 passed (1.2m)** = 3 `[setup]` + 79 `[chromium]`, 0 `[screenshots]`, `exit=0` |

## 3. Plain e2e does not touch the committed screenshots

Run as three separate commands (user-approved split):

1. Before: `git diff --stat -- docs/screenshots > /tmp/p6-shots-before.log; shasum docs/screenshots/phase5/*.png >> /tmp/p6-shots-before.log`. Git diff empty, 10 checksums.
2. `CI=1 pnpm test:e2e` in `apps/web`: 82 passed (above). `screenshots.spec` appears 0 times in the log.
3. After: same commands into `/tmp/p6-shots-after.log`, then `cmp` of the two files → **IDENTICAL** (git diff still empty, all 10 SHA-1s unchanged, e.g. `admin-dashboard.png f94db9f1…`, `mobile-admin-dashboard.png d7162594…`).

So the gating (`testIgnore: SCREENSHOT_SPEC` on `chromium`, `screenshots` project only with `SCREENSHOTS=1`) holds.

## 4. Screenshots retaken (`pnpm screenshots`)

`CI=1 pnpm screenshots` (root) built shared and api, then in `apps/web` ran `prepare-db.mjs --reset` (test DB: reset successful, migrate deploy, seed created 3 users + 5 sample tasks), `next build` into `.next-e2e`, and `SCREENSHOTS=1 playwright test --project=screenshots`: **13 passed (11.8s)** (3 setup + 10 screenshot tests), `exit=0`. All 10 PNGs in `docs/screenshots/phase5/` were rewritten (mtime 20:01). `git status` now shows 8 of them modified. `login.png` and `admin-tasks.png` came out byte-identical to the committed copies: neither shows timestamps or E2E data (the task list was already filtered to `q=Northwind`). The spec only uses the test DB, so the dev DB was not involved.

Each image was opened in the image viewer. Data visible = the 5 seed tasks + the 5 "Northwind" tasks the spec creates; people = Alex Admin, Jordan Lee (employee1), Priya Patel (employee2). No "E2E…" task and no `e2e-…@demo.com` account appears in any image.

| Image | What it shows |
| --- | --- |
| `login.png` | Sign-in card (Email, Password, Sign in), empty fields |
| `admin-dashboard.png` | Total 10, Pending 2, In progress 4, Pending approval 2, Completed 2, Overdue 2; approval queue (2 waiting): "Reconcile September expense reports" (Priya Patel, High) and "Northwind onboarding checklist" (Jordan Lee, Medium) with Approve/Reject; Recent tasks: the 5 Northwind tasks |
| `admin-tasks.png` | `q=Northwind`, sort Due date soonest: 5 rows, "Page 1 of 1 · 5 tasks", security training follow-up shows Overdue |
| `admin-task-detail.png` | "Northwind vendor contract review", Completed/High; 2 comments (Jordan Lee, Alex Admin); 6 history entries incl. the rejection reason |
| `admin-reject-dialog.png` | Reject dialog over "Northwind onboarding checklist", reason filled, "64/1000 characters" |
| `admin-employees.png` | Exactly 2 rows: Jordan Lee `employee1@demo.com`, Priya Patel `employee2@demo.com` |
| `employee-dashboard.png` | Jordan Lee: Total 6 (3 seed + 3 Northwind), Pending 1, In progress 2, Pending approval 1, Completed 2, Overdue 0; 6 rows, "Page 1 of 1 · 6 tasks" |
| `employee-task-feedback.png` | "Northwind budget forecast update", In progress/High, Admin feedback alert with the reason, 4 history entries |
| `mobile-admin-dashboard.png` | 390 px: stat cards stacked; approval queue as **cards** with title, priority badge (High / Medium), assignee, due date, last updated, and **Approve / Reject buttons fully on screen**; Recent tasks as cards with priority + status badges. No clipped table |
| `mobile-nav.png` | 390 px navigation sheet open over the task list cards (Dashboard, Tasks, Employees) |

No visual defects found, so no retake was needed.

## 5. Dev-stack walkthrough (`apps/web/e2e/dev-walkthrough.mjs`)

Stack: built API `node dist/server.js` in `apps/api` (`apps/api/.env`: `NODE_ENV=development`, `PORT=4000`, `FRONTEND_URL=http://localhost:3000`) and `API_URL=http://localhost:4000 next start --port 3000` in `apps/web` (build from step 1). Before: ports 3000/4000 free. Probe: API `/health` 200, web `/login` 200, proxied `/api/v1/health` 200. Dev DB = freshly seeded (step 2).

`node e2e/dev-walkthrough.mjs` (Playwright Chromium driving the real UI on :3000, plus API calls through the proxy):

```
PASS  admin creates a task in the UI (PENDING) (id cmv5d5a200000tvs4r69tgjd2)
PASS  employee1 sees it and starts it (IN_PROGRESS)
PASS  employee1 submits it (PENDING_APPROVAL)
PASS  admin rejects it with a reason (IN_PROGRESS)
PASS  employee1 sees the feedback, comments and resubmits (PENDING_APPROVAL)
PASS  admin approves it from the dashboard queue (COMPLETED, 6 history entries) (created → start → submit → reject → submit → approve)
PASS  employee1 approve through the proxy → 403, task still COMPLETED (403 FORBIDDEN)
PASS  employee2 opens employee1's task → Task not found (API 404) (404 NOT_FOUND)
PASS  employee1 at /admin → redirected to /employee
PASS  signed out at /admin → /login?next=%2Fadmin
PASS  foreign Origin POST with a valid session → 403 CSRF_REJECTED (403 CSRF_REJECTED)
PASS  unauthenticated API call through the proxy → 401 (401 UNAUTHENTICATED)
ALL CHECKS PASSED
exit=0
```

Both servers were then stopped with SIGTERM; `lsof -iTCP:3000 -iTCP:4000 -sTCP:LISTEN` → nothing listening (exit 1).

This is a scripted browser walkthrough against the dev stack, not a human click-through.

The walkthrough left one COMPLETED task in the dev DB (rows 3 / 6 / 20 / 1). The dev DB was reset again (`prisma migrate reset --force`, `reset_exit=0`) and seeded (`created` ×3 users, 5 sample tasks, `seed_exit=0`), so it ends in the clean demo state: 3 / 5 / 14 / 0, only the 3 demo users.

## 6. Logs and errors leak check

`pnpm exec vitest run test/log-leak.test.ts test/seed.test.ts` (in `apps/api`): Test Files 2 passed (2), Tests 6 passed (6), `exit=0`. Both files also passed inside the full 207-test run.

`test/log-leak.test.ts` spies on `console.log/info/warn/error/debug`. It drives:
- failed logins (wrong password, unknown email);
- 400 errors: body, `:id` param, `pageSize=1000`, malformed JSON, unknown assignee;
- 401 with no cookie and with a tampered cookie;
- 403: employee approve, and employee on `/users`;
- 404: unknown task, unknown route;
- 409: approve on a PENDING task;
- CSRF 403 (foreign Origin);
- a forced `PrismaClientValidationError` whose message would contain a password hash;
- a thrown `Error` through the central handler. Both 500s must return exactly `{ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }`.

Every other error body must have the `{ error: { code, message } }` shape.

Sanity checks: the log must contain `PrismaClientValidationError` and `Unexpected failure`, so the search below runs on real output. The captured logs and all response bodies must then contain none of:
- `passwordHash`;
- a bcrypt prefix `/\$2[aby]\$\d\d\$/`, or any real hash from the users table;
- the session `tas_token` value, or `eyJ` (any JWT);
- the `JWT_SECRET` value;
- the DB password, or the full `DATABASE_URL`;
- stack frames `/\bat .+:\d+:\d+/`, source paths `/\.(ts|js):\d+/`, or a `"stack"` key.

So error responses carry no stack.

Dev-server logs from the walkthrough (`api-dev.log` 1 line: `[api] listening on port 4000 (development)`; `web-dev.log` 5 lines of Next.js start-up) were searched for `$2a/$2b/$2y$`, `passwordHash`, `eyJ`, `tas_token=`, stack-frame lines and `Error:`: **0 matches** in both.

## 7. Review findings → fix / test

| Finding | Resolution | Evidence |
| --- | --- | --- |
| Phase 5 #1 screenshot spec in default e2e | `playwright.config.mts`: `testIgnore` on `chromium`, `screenshots` project only with `SCREENSHOTS=1`; `pnpm screenshots` script | §3: 82 tests, 0 screenshots, checksums IDENTICAL |
| Phase 5 #2 E2E noise in screenshots | `prepare-db.mjs --reset` before the screenshot run | §4: retaken, all 10 reviewed, demo data only |
| Phase 5 #3 mobile Approve/Reject off-screen | `task-table.tsx`, `approval-queue.tsx`: cards below `lg`, table from `lg` | responsive.spec "approval queue: Approve, Reject and priority are on screen without scrolling sideways", "recent tasks and the task list are cards…", "the tables are back from the lg breakpoint…"; a11y.spec axe on mobile cards (3 tests); `mobile-admin-dashboard.png` |
| Phase 5 #4 manual dev-DB walkthrough | `e2e/dev-walkthrough.mjs` | §5: ALL CHECKS PASSED (12) |
| Phase 5 #5 Status select via `.focus()` | Test focuses the search box, presses Tab, asserts Status is focused | a11y.spec "status filter: arrow keys and Enter choose an option" |
| Admin #1 silent detail-less `VALIDATION_ERROR` | `task-form.tsx` / `create-task-view.tsx`: form-level alert when no field was mapped | admin.spec "a 400 VALIDATION_ERROR without details shows a form-level error" |
| Admin #2 Assignee label without target | Assignee uses a non-`<label>` heading (`FieldTitle`) while loading, failed or empty | a11y.spec "new task form, empty and with errors" (axe 0 violations) |
| Admin #3 400 → field mapping untested in browser | Mocked 400 with `details` | admin.spec "a 400 with details puts each message on its field" |
| Admin #4 edit-save races untested | Approve or delete via API, then Save | admin.spec "saving after the task was approved meanwhile → toast, detail shows Completed", "saving after the task was deleted meanwhile → toast and Task not found" |
| Admin #5 detail-page delete untested | Test added | admin.spec "delete from the detail page returns to the list" |
| Admin #6 priority filter no e2e | Test added | admin.spec "the priority filter lives in the URL" |
| Employee #1 hidden URL filters | `use-task-list-params.ts` `ignore: ['q','assignedToId']` on the employee list; empty-state copy matches visible controls | employee.spec "search and employee URL params are ignored (no hidden filters)" |
| Employee #2 comment 404 path untested | Tests added | employee.spec "commenting on a task deleted meanwhile…", "commenting on a task reassigned meanwhile…" |
| Phase 2 #5 concurrent seeds double-insert | `prisma/demo-seed.ts`: sample-task transaction at READ COMMITTED locks the admin row (`SELECT … FOR UPDATE`) first | seed.test "two overlapping runs insert the sample tasks once". Accepted limitation: two runs racing to create the same user can make one fail on the unique email (no duplicate possible); the seed stays a single-run release step |
| Phase 2 #7 seed idempotency untested | `test/seed.test.ts` against the real test DB | 5 tests: "first run…", "a second run changes nothing…", "never resets an existing password, name or role…", "a missing demo user is recreated…", "two overlapping runs…"; §2 seed ×2 on dev DB |
| Phase 4 #1 race tests rely on timing | `test/helpers/locks.ts` (`holdLock`, `holdTaskRowLock`, `waitForBlockedStatements` on `information_schema.PROCESSLIST`) | workflow.test concurrency tests (`overlapping()`), tasks.test "PATCH racing a concurrent approve or delete"; in the 207/207 run |

Not in Phase 6 scope: Phase 2 #2/#3, Phase 3 #1 and Phase 4 #2 stay on the Phase 7 checklist.

## Not done / limits

- No real screen-reader testing (as in Phase 5).
- The end-to-end walkthrough is scripted (Playwright on the dev stack), not clicked by hand.
- Nothing committed (the orchestrator commits).

## Orchestrator re-check and teardown fix (Phase 6 review non-blocking #1)

Independent re-run with Node 22.19.0:
- `pnpm -r typecheck` exit 0, `pnpm -r lint` exit 0.
- API tests 207/207, web unit tests 61/61.
- First `CI=1 pnpm --filter web test:e2e`: **81 passed, 1 failed**. The failure was in `error-boundary.spec.ts` `afterAll` (line 59). Port 3101 still answered 15 s after SIGTERM, so the teardown poll timed out. The test itself passed. This is the same teardown flake the Phase 6 reviewer saw on 1 of 2 runs.

**Fix** in `apps/web/e2e/error-boundary.spec.ts`: teardown sends SIGTERM to each child's process group and waits up to 5 s for it to exit. It then sends SIGKILL to the group before polling the ports. `next start` can hold off a SIGTERM while keep-alive connections stay open, so the escalation guarantees the ports are freed.

After the fix:
- `pnpm --filter web typecheck` exit 0, `pnpm --filter web lint` exit 0, `pnpm format:check` exit 0.
- `CI=1 pnpm --filter web test:e2e` run twice in a row: **82 passed** both times, exit 0 both times.
- `shasum docs/screenshots/phase5/*.png` before and after the two runs: identical.

Screenshots opened by the orchestrator:
- `mobile-admin-dashboard.png`: stacked cards with Approve/Reject and priority visible; 10 tasks; no e2e data.
- `admin-employees.png`: only `employee1@demo.com` and `employee2@demo.com`.
