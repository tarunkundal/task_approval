# Phase 6 testing and hardening: evidence, retaken screenshots and re-verification

This pass reviews the coder's verification iteration for Phase 6. The previous review (CHANGES_REQUESTED, 6 findings) found the code work done but the evidence missing. This iteration adds `docs/phase6-verification.md`, ticks all 10 Phase 6 checklist items with pointers into it, retakes the 10 doc screenshots from a reset test DB, and updates the `ARCHITECTURE.md` status line. I re-ran typecheck, both unit suites and the e2e suite (twice), checked that the e2e run leaves `docs/screenshots` untouched, and opened all 10 PNGs. Every count matches the recorded evidence, and all 6 prior findings are resolved.

Watch for: on my first of two e2e runs, `error-boundary.spec.ts` failed in its `afterAll` teardown because port 3101 was still answering 15 s after SIGTERM (81 passed, 1 failed). The second run passed 82/82 (confirmed). The spec is unchanged since Phase 5, so the flake predates this phase, but the evidence doesn't mention it.

**Verdict**: APPROVED

## High-level view

The re-run counts match the evidence file. `pnpm -r typecheck` exits 0. API tests pass 207/207 (16 files) and web unit tests 61/61 (6 files). `CI=1 pnpm --filter web test:e2e` ran 82 tests: 3 setup and 79 chromium, with no screenshot project. Checksums of `docs/screenshots` before and after each e2e run are byte-identical, so the gating holds against the retaken PNGs too.

All 10 screenshots now show only demo data: the 3 demo accounts, the 5 seed tasks and the 5 Northwind tasks the spec creates. The admin dashboard shows Total 10 and the employees page has exactly 2 rows. `mobile-admin-dashboard.png` shows the stacked card layout, with priority badges and Approve/Reject fully on screen.

The evidence file records real output for each checklist item: the build, a fresh-DB reset → deploy → seed ×2 sequence with row counts, 12 walkthrough PASS lines plus ALL CHECKS PASSED, the leak-check patterns, and a table mapping each finding to its fix and test. Each tick points to a numbered section of that file. The status line says Phase 6 is "implemented and verified… awaiting re-review", which is accurate. The walkthrough is a scripted Playwright run against the dev stack, not a hand click-through, and both the checklist and evidence say so.

<details>
<summary>Issues (1)</summary>

1. **Error-boundary teardown flake** (non-blocking, confirmed once) — `e2e/error-boundary.spec.ts` `afterAll` timed out waiting for port 3101 to close on 1 of 2 runs. Track it for Phase 7 CI: raise the poll timeout, or SIGKILL after a grace period, and note the flake in the evidence file.

</details>

<details>
<summary>Details</summary>

### Re-run results

All commands ran with Node 22.19.0 against `task-approval-mysql` (mysql:8.4, healthy, host port 3307), in the background with logs under `/tmp`.

| Command | Observed | Recorded by coder |
| --- | --- | --- |
| `pnpm -r typecheck` | exit 0 (shared, api + `prisma generate`, web + `next typegen`) | exit 0 |
| `pnpm --filter api test` | 16 files, 207/207, 22.4 s, exit 0 | 207/207 |
| `pnpm --filter web test` | 6 files, 61/61, exit 0 | 61/61 |
| `CI=1 pnpm --filter web test:e2e` run 1 | 81 passed, 1 failed (error-boundary `afterAll`), exit 1 | 82/82 |
| `CI=1 pnpm --filter web test:e2e` run 2 | 82 passed (1.2 m), exit 0 | 82/82 |

Neither run included a `[screenshots]` test.

### Screenshot gating against the retaken PNGs

Before run 1, `git diff --stat -- docs/screenshots` listed 8 modified PNGs (the retake), followed by `shasum` of all 10. The same capture after run 1, before run 2 and after run 2 matched byte for byte (`cmp` → IDENTICAL both times). For example, `mobile-admin-dashboard.png` is `d9428d5d…` and `admin-dashboard.png` is `29ec8fad…`.

The checksums in evidence §3 (`f94db9f1…`, `d7162594…`) are the HEAD copies: I hashed `git show HEAD:…` and they match. So the coder's §3 check ran before the §4 retake, and the file doesn't say so. My run repeats the check on the retaken images.

### Screenshot content (all 10 opened)

`login.png` shows an empty sign-in form. `admin-dashboard.png` shows Total 10 / Pending 2 / In progress 4 / Pending approval 2 / Completed 2 / Overdue 2, a 2-item approval queue ("Reconcile September expense reports", "Northwind onboarding checklist") and the 5 Northwind recent tasks. `admin-tasks.png` is `q=Northwind` with 5 rows. `admin-task-detail.png` is "Northwind vendor contract review" with 2 comments and 6 history entries. `admin-reject-dialog.png` shows the reason at 64/1000. `admin-employees.png` has exactly Jordan Lee `employee1@demo.com` and Priya Patel `employee2@demo.com`. `employee-dashboard.png` shows Jordan Lee's 6 tasks (3 seed, 3 Northwind). `employee-task-feedback.png` shows the Admin feedback alert. `mobile-nav.png` shows the open sheet with the card list behind it.

`mobile-admin-dashboard.png` (390 px) shows stacked stat cards, approval-queue cards with title, High/Medium priority badge, assignee, due date, last updated and on-screen Approve/Reject buttons, and recent-task cards with priority and status badges. No table is clipped. No image contains an "E2E…" task or an `e2e-…@demo.com` account.

### Evidence file and checklist ticks

`docs/phase6-verification.md` covers each checklist item with real output. §1 has `pnpm install --frozen-lockfile`, `-r typecheck`, `-r lint`, `API_URL=… pnpm -r build` (Next 16.4.0, 9/9 static pages, 11 routes) and `format:check`, each exit 0. §2 is the fresh-DB sequence on the dev DB with row counts at each step: `migrate reset --force` → 0 rows, `migrate deploy` "No pending migrations", first seed `created` ×3 + 5 tasks/14 history, second seed `kept` ×3 + "skipped sample tasks" with unchanged counts. The test DB went through `prepare-db.mjs --reset`, followed by the three suites. §5 has the 12 PASS lines and ALL CHECKS PASSED. Those cover the full create → start → submit → reject → resubmit → approve cycle, employee approve 403, cross-employee 404, the role and signed-out redirects, CSRF 403 and unauthenticated 401. It also records that the servers were stopped and the dev DB reseeded afterwards. §6 lists the leak-check patterns, which I compared against `test/log-leak.test.ts` lines 145-163: `passwordHash`, `/\$2[aby]\$\d\d\$/`, the real hashes, the `tas_token` value, `eyJ`, `JWT_SECRET`, the DB password, `DATABASE_URL`, `/\bat .+:\d+:\d+/`, `/\.(ts|js):\d+/` and `"stack"`, plus the sanity assertions. §7 maps Phase 5 #1-#5, admin #1-#6, employee #1-#2, Phase 2 #5/#7 and Phase 4 #1, each to a fix and a named test. Every named e2e test appears in my 82-test run.

All 10 Phase 6 ticks in `IMPLEMENTATION_CHECKLIST.md` cite one of these sections. The `ARCHITECTURE.md` status line and Phase 6 notes match the diff. The notes cover the `{ name, message }`-only logging in `error-handler.ts`, the name-only Prisma disconnect log in `server.ts`, and the `SELECT … FOR UPDATE` at READ COMMITTED in `demo-seed.ts`. Phase 2 #5 is marked done, with the user-create race documented as an accepted limitation.

### Prior findings

| # | Finding | Status |
| --- | --- | --- |
| 1 | Missing evidence file | Resolved: `docs/phase6-verification.md` exists with real output for every item |
| 2 | Screenshots not retaken | Resolved: all 10 rewritten from a reset test DB (8 differ from HEAD; `login.png` and `admin-tasks.png` came out byte-identical); all opened and clean; mobile shows cards |
| 3 | Checklist not updated | Resolved: 10/10 ticked, each with a pointer to evidence |
| 4 | Fresh-DB and build evidence missing | Resolved: §1 build exit 0; §2 reset/deploy/seed ×2 with row counts, then 207/207 |
| 5 | Walkthrough not evidenced | Resolved: §5 PASS lines, labelled as scripted |
| 6 | Findings mapping and leak-check result | Resolved: §7 mapping table; §6 patterns and 6/6 targeted run |

### Error-boundary teardown flake

On run 1, the error-boundary test body passed. Its `afterAll` then failed at line 59: after SIGTERM to the spawned `next start` process group, port 3101 still answered `/login` when the 15 s `expect.poll` ran out. Afterwards nothing was listening on 3100/3101/4100/4101, and run 2 passed, so this is slow shutdown, not a leaked server (likely). The file is unchanged in this diff and the prior review's run passed. It is a Phase 5 test, not a Phase 6 regression. It matters once e2e runs in CI (Phase 7), where an intermittent red would be noise.

</details>

<details>
<summary>File map</summary>

- `docs/phase6-verification.md`: new evidence file (§1-§7 plus limits).
- `docs/IMPLEMENTATION_CHECKLIST.md`: Phase 6 items ticked with evidence pointers.
- `docs/ARCHITECTURE.md`: status line, Phase 6 notes, Phase 2 #5/#7 marked done.
- `docs/screenshots/phase5/*.png`: retaken (8 changed bytes, 2 identical).
- `apps/api/prisma/demo-seed.ts`, `seed.ts`: seed logic made importable, admin-row lock.
- `apps/api/src/middleware/error-handler.ts`, `src/server.ts`: no stacks or driver messages in logs.
- `apps/api/test/log-leak.test.ts`, `seed.test.ts`, `helpers/locks.ts`, `tasks.test.ts`, `workflow.test.ts`: leak, seed and deterministic race tests.
- `apps/web/playwright.config.mts`, `package.json` (root and web), `e2e/prepare-db.mjs`: screenshot gating and `--reset`.
- `apps/web/src/features/tasks/components/*`, `hooks/use-task-list-params.ts`: mobile cards, form-level error, employee URL-param ignore.
- `apps/web/e2e/*.spec.ts`, `dev-walkthrough.mjs`: new and updated e2e tests and the dev-stack walkthrough.

Full diff: `git diff 6427196` (uncommitted working tree).

</details>
