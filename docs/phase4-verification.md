# Phase 4 verification evidence

Run on 2026-10-11 (local time), macOS, Node 22.19.0 (`nvm use 22.19.0`), pnpm 10.12.4, Docker MySQL `task-approval-mysql` (8.4, host port 3307, `Up (healthy)`).
Each command ran from the repo root with output captured to a log file together with `exit=$?`. Outputs below are trimmed, not paraphrased.

No new dependencies. No schema change or migration (`No pending migrations to apply`).

## Commands

| # | Command | Result |
|---|---|---|
| 1 | `pnpm -r typecheck` | shared, api (incl. `test/enum-parity.types.ts`), web: `Done`, `exit=0` |
| 2 | `pnpm -r lint` | shared, api, web: `Done`, `exit=0` |
| 3 | `pnpm -r build` | shared `tsc`, api `prisma generate && tsc`, web `next build`: `exit=0` |
| 4 | `pnpm format:check` | `All matched files use Prettier code style!`, `exit=0` |
| 5 | `pnpm --filter api exec vitest run --reporter=verbose` | `Test Files 14 passed (14)`, `Tests 199 passed (199)`, `exit=0` (58 from Phases 2–3 + 141 new) |
| 6 | Negative enum-parity check: a temporary `test/zz-parity-negative.types.ts` asserting `Equal<TaskStatus, 'PENDING' \| 'IN_PROGRESS' \| 'COMPLETED'>`, then `tsc --noEmit` | `error TS2344: Type 'false' does not satisfy the constraint 'true'.`, `exit=2`; file deleted afterwards |
| 7 | `pnpm db:seed` twice (dev DB) | both runs: `kept` ×3 users, `skipped sample tasks (5 task(s) already exist)`, `exit=0` |

## Tests per file (199)

| File | Tests | Covers |
|---|---|---|
| `test/tasks.test.ts` (new) | 43 | spec #1 (401 on list, detail, create, start, dashboard); create (201 DTO, history `null→PENDING`, description default, date without shift, employee 403); spec #7 (15 invalid bodies incl. `2026-02-30`, `10/10/2026`, unknown key, `status`, `createdById`, missing / malformed / nonexistent / ADMIN assignee); detail scope; PATCH (whitelist edit, 8 forbidden bodies → 400 with the DB row unchanged, employee 403, COMPLETED 409, invalid reassignment 400, reassign keeps status and employee1 → 404, unknown 404); soft delete (204, hidden from detail and list, history kept, 404 on repeat, edit or approve of a deleted task → 404, employee 403) |
| `test/workflow.test.ts` (new) | 31 | spec #2 (employee approve/reject → 403, status and `reviewedBy` unchanged, no history row; service refuses a non-admin approve; admin start/submit → 403); #3 (approve → COMPLETED, `reviewedById`/`reviewedAt`, history row with actor); #4 (reject → IN_PROGRESS, trimmed reason in history and `latestRejectionReason`, no comment created; 6 invalid reject bodies → 400 with status unchanged); #5 (start/submit on another employee's task → 404); #6 (9 invalid transitions → 409 with `details`, status and history unchanged); #8 (start → submit with ordered history; full create → start → submit → reject → resubmit → approve cycle via HTTP, history order and actors, COMPLETED final); #9 (rollback, below); concurrency (double approve, approve vs reject, double start → exactly one 200 and one 409, one history row); malformed id → 400; extra body keys → 400 |
| `test/task-activity.test.ts` (new) | 12 | spec #5 (detail, comments, history, start, submit and POST comment as employee1 on employee2's tasks → 404 with no side effects; the owner still gets 200; `?assignedToId=<employee2>` → empty); comments (201 DTO, oldest first, author `{id,name,role}` with no email or hash; empty, whitespace, over 2000 chars, missing, unknown key → 400; exactly 2000 accepted; deleted or unknown task → 404; no PATCH/DELETE routes); history (order, actor DTO) |
| `test/task-list.test.ts` (new) | 23 | default order and meta; pagination (stable pages, `totalPages`, page beyond the end); status, priority, employee and `q` filters (case-insensitive; `%`, `_` and `\` literal); combined filters; priority sort; 11 invalid queries → 400 (incl. `pageSize=101`); `pageSize=100` accepted; employee sees only their own tasks and totals |
| `test/dashboard.test.ts` (new) | 4 | admin `{ total: 27, byStatus: {23,2,1,1}, overdue: 2 }` with 27 tasks while the list page holds 20 (`meta.total` agrees); per-employee counts; an employee with no tasks gets all four keys at 0; soft-deleted tasks are excluded; due today is not overdue, past-due COMPLETED is not overdue; 401 |
| `test/users.test.ts` | 13 (+10) | `POST /users`: 201 EMPLOYEE DTO, normalized email, `bcrypt.getRounds(hash) === BCRYPT_COST`, the new account can log in; `role` in the body → 400; duplicate (different case) → 409 `EMAIL_TAKEN`; employee → 403, anonymous → 401; short password, 25×`€` (75 bytes) → 400; 24×`€` (72 bytes) → 201; invalid email, blank name, unknown key → 400 |
| `test/prisma-errors.test.ts` (new) | 4 | real DB errors through the central handler: P2002 → 409 `CONFLICT`, P2003 → 400, P2025 → 404, `PrismaClientValidationError` → 500. A `console.error` spy shows the name and code are logged, with no email, title, id or `findMany` invocation text |
| `test/security.test.ts` | 16 (+2) | IP-only login limiter: limit 3, rotating emails → 4th attempt 429 `RATE_LIMITED`, correct password also 429; defaults `loginIp` 50 / 15 min and `login` 10 / 15 min |
| `test/unit.test.ts` (new) | 12 | `TASK_TRANSITIONS` exact table, `getAvailableActions`, `canPerformAction`; `parseMysqlUrl` (decoding, default port, bad scheme or database); date helpers (round trip, `2026-02-30` / `2027-02-29` / `10/10/2026` rejected, UTC formatting, `todayUtc`); shared `dueDate` schema; `utf8ByteLength` vs `Buffer.byteLength` |
| unchanged | 41 | `auth` 16, `app` 6, `task-access` 6, `env` 8, `db-guard` 5 |

`test/enum-parity.types.ts` isn't a runtime test. It is type-checked by command 1, and command 6 shows it fails on drift.

### Spec #9 rollback

`transitionTask({ id: 'cghostactor000000000000000', role: 'ADMIN' }, id, 'start')` on a PENDING task:
- The conditional update matches, because the admin scope covers the task.
- The history insert then fails its `actorId → users.id` foreign key, a real MySQL error.
- The promise rejects. The task is still `PENDING` and has only its creation history row.

## Manual smoke run (built API, dev DB)

Setup:
- Server: `node dist/server.js` from `apps/api`, with `apps/api/.env` (`PORT=4000`, `FRONTEND_URL=http://localhost:3000`) and the seeded dev DB.
- Client: curl with `Origin: http://localhost:3000` and cookie jars. The jars were deleted afterwards, and no token was printed.

| # | Request | Result |
|---|---|---|
| 1 | `GET /health` | 200 `{"status":"ok","checks":{"database":"ok"}}` |
| 2 | login admin, employee1, employee2 | 200 ×3, safe DTOs |
| 3 | `GET /users` (admin) | 200, Jordan Lee and Priya Patel, no hashes |
| 4 | `POST /tasks` (admin) "Phase 4 smoke task" → employee1, due `2026-12-01` | 201, `status: PENDING`, `dueDate: "2026-12-01"`, `reviewedBy: null` |
| 5 | `POST /tasks` as employee1 | 403 `FORBIDDEN` |
| 6 | `GET /tasks/:id` as employee2 | 404 `NOT_FOUND` |
| 7 | employee1 `start` | 200 `IN_PROGRESS` |
| 8 | employee1 `approve` | 403 `FORBIDDEN` |
| 9 | admin `approve` while IN_PROGRESS | 409 `INVALID_TRANSITION` "Task cannot be approved while its status is IN_PROGRESS" |
| 10 | employee1 `submit` | 200 `PENDING_APPROVAL` |
| 11 | admin `reject` `{"reason":"   "}` | 400 `VALIDATION_ERROR` (`reason`: "A rejection reason is required") |
| 12 | admin `reject` "Please attach the summary sheet." | 200 `IN_PROGRESS`, `reviewedBy: Alex Admin`, `latestRejectionReason` set |
| 13 | employee1 comment | 201, author `{id,name,role}` |
| 14 | employee1 `submit` again | 200 `PENDING_APPROVAL`, `latestRejectionReason: null` |
| 15 | admin `approve` | 200 `COMPLETED`, `reviewedAt` updated |
| 16 | `PATCH` the completed task | 409 `TASK_COMPLETED` |
| 17 | `GET /tasks/:id/history` (employee1) | 6 rows, in order: `null→PENDING` (Alex Admin), `PENDING→IN_PROGRESS` (Jordan Lee), `IN_PROGRESS→PENDING_APPROVAL` (Jordan Lee), `PENDING_APPROVAL→IN_PROGRESS` with reason (Alex Admin), `IN_PROGRESS→PENDING_APPROVAL` (Jordan Lee), `PENDING_APPROVAL→COMPLETED` (Alex Admin) |
| 18 | `GET /tasks?status=COMPLETED&pageSize=2` (admin) | 200, 2 rows, `meta {page:1,pageSize:2,total:2,totalPages:1}` |
| 19 | `GET /dashboard/summary` admin / employee1 / employee2 | `{"total":6,"byStatus":{"PENDING":1,"IN_PROGRESS":2,"PENDING_APPROVAL":1,"COMPLETED":2},"overdue":1}` / `{"total":4,…"COMPLETED":2},"overdue":0}` / `{"total":2,…"PENDING_APPROVAL":1…},"overdue":1}` |
| 20 | `POST approve` with `Origin: https://evil.example` | 403 `CSRF_REJECTED` |

Afterwards the API got SIGTERM. Its log shows `[api] SIGTERM received, shutting down`, `kill -0` confirmed it was gone, and nothing was listening on :4000.

The dev DB now holds one extra COMPLETED task ("Phase 4 smoke task") with 6 history rows and 1 comment. The seed still skips sample tasks because the table isn't empty.

## Iteration 2: review fixes (`phase4-review.md`)

| Finding | Fix | Evidence |
|---|---|---|
| #1 PATCH stale-snapshot 200 (blocking) | `updateTask` now runs the conditional `updateMany` (`scope AND status ≠ COMPLETED`) as the transaction's first statement. On 0 rows it re-reads (404 / 409 `TASK_COMPLETED`, else 409 `CONFLICT`). An unknown assignee fails the FK (P2003 → 400 `INVALID_ASSIGNEE`). An ADMIN assignee is checked after the update, and the throw rolls the update back. The check order stays scope → COMPLETED → assignee. | New `tasks.test.ts` › "PATCH racing a concurrent approve or delete" (2 tests). A second transaction holds the row lock with an approval / soft delete, the PATCH is sent, and the lock is committed 300 ms later. Expected: 409 `TASK_COMPLETED` / 404, with the title unchanged in the DB. **Negative check:** with the old read-first code temporarily restored, `vitest run test/tasks.test.ts -t racing` failed both tests with `expected 200 to be 409` and `expected 200 to be 404` (`exit=1`), which reproduces the review's trace. The fixed code was then restored. |
| #2 rollback test accepts any rejection | Spec #9 now asserts `rejects.toMatchObject({ name: 'PrismaClientKnownRequestError', code: 'P2003' })` | passes in the full run below |
| #3 global login lockout behind the proxy | New Phase 7 checklist item names the `loginIp` limiter and the lockout failure mode; ARCHITECTURE §14 points to it | docs only |
| #4 PATCH check order missing from API.md | The PATCH section lists scope 404 → COMPLETED 409 → assignee 400 and the race behaviour. The generic check-order section notes that DB-dependent 400s come after scope. | docs only |

Re-run (same method as above, logs in `/tmp/p4i2-*.out`):

| Command | Result |
|---|---|
| `pnpm -r typecheck` | shared, api, web `Done`, `exit=0` |
| `pnpm -r lint` | shared, api, web `Done`, `exit=0` |
| `pnpm -r build` | `exit=0` (web `next build` static output) |
| `pnpm format:check` | `All matched files use Prettier code style!`, `exit=0` |
| `pnpm --filter api test` | `Test Files 14 passed (14)`, `Tests 201 passed (201)`, `exit=0` (199 + 2 race tests) |

PATCH smoke (built `node dist/server.js`, dev DB, `Origin: http://localhost:3000`, cookie jars deleted afterwards, no token printed):

| # | Request | Result |
|---|---|---|
| 1–3 | login admin + employee1, admin creates "Phase 4 PATCH smoke" | 200, 200, 201 |
| 4 | `PATCH` title + priority | 200, edited title, `HIGH`, status `PENDING` |
| 5 | `PATCH` `assignedToId` = admin | 400 `INVALID_ASSIGNEE` |
| 6 | `PATCH` `assignedToId` = unknown cuid | 400 `INVALID_ASSIGNEE` (FK path) |
| 7 | `GET` after 5–6 | title still the edited one, assignee still employee1 (rolled back) |
| 8–10 | start → submit → approve | 200 ×3 |
| 11 | `PATCH` completed task | 409 `TASK_COMPLETED` |
| 12 | `DELETE` | 204 |
| 13 | `PATCH` deleted task | 404 `NOT_FOUND` |

The server got SIGTERM: its log shows only `listening` and `SIGTERM received, shutting down`, with no Prisma error lines. `kill -0` confirmed it was gone and :4000 was free. The dev DB now has one more soft-deleted task.

## Notes

- One bug was found by the new tests and fixed: Prisma's `contains` doesn't escape LIKE wildcards on MySQL, so `q=%` matched every task. `tasks.service.ts` now escapes `\`, `%` and `_`.
- The IDE's on-save "organize imports" removed two imports while they were briefly unused during editing. Both were re-added, and the final typecheck and lint runs above are clean.
