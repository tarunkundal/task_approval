# Task CRUD, approval workflow, comments, history and dashboard API (Phase 4, pass 2)

Phase 4 adds the backend task lifecycle: admin-only CRUD with soft delete, the four workflow actions, comments, status history, a filterable paginated list and dashboard counts. It also closes the Phase 2/3 follow-ups. This second pass checks the fixes for the four pass-1 findings and looks for regressions they introduced. All four are fixed. `updateTask` now runs its conditional update as the transaction's first statement, and two lock-holding race tests cover it, with a recorded negative check against the old code. The rollback test asserts `P2003`. The `loginIp` lockout has its own Phase 7 checklist item. API.md documents the PATCH check order. Both re-run checks passed: `pnpm -r typecheck` (exit 0) and `pnpm --filter api test` (14 files, 201/201, exit 0).

Watch for: no blocking items. The concurrent-transition tests rely on `Promise.all` timing, and the PATCH race tests rely on a 300 ms sleep. Under load, any of them could pass without the race actually happening (likely, non-blocking). The `loginIp` global-bucket behaviour behind the proxy is still live until Phase 7 (confirmed, tracked).

**Verdict**: APPROVED

## High-level view

Every task path builds its `where` from `visibleTasksWhere` / `taskInScopeWhere` in `task-access.ts`, and nothing is filtered after the query. That covers detail, update, delete, transitions, comments, history, list and dashboard. Soft-deleted rows drop out of all of them. Another employee's task returns the same 404 as a missing one. Route-level `requireRole` runs before param validation, so the 403-vs-404 policy matches the matrix.

Transitions and PATCH now follow the same pattern. The conditional `updateMany` (scope + expected status) is the transaction's first statement, and only after it matches 0 rows does a re-read decide between 404 and 409. That re-read opens its snapshot after the competing write committed, so it can't report stale state. PATCH keeps the documented order (scope 404 → COMPLETED 409 → assignee 400). It gets there by letting an unknown assignee fail the FK, which maps to `INVALID_ASSIGNEE`, and by checking an ADMIN assignee after the update, where the throw rolls the update back.

The remaining gap is test fidelity, not correctness. The concurrency and race tests prove the guard works when the interleaving happens, but they don't force it.

<details>
<summary>Issues (2)</summary>

1. **Race tests don't force the interleaving** (likely, non-blocking): the transition concurrency tests and the PATCH race tests depend on scheduling (`Promise.all`, `sleep(300)`), so on a slow runner they can pass without overlapping. If this matters, make the waiting request observably blocked before committing, e.g. poll `information_schema.innodb_trx` / `performance_schema.data_lock_waits` for a lock wait instead of sleeping.
2. **`loginIp` is a global bucket behind the proxy** (confirmed, tracked for Phase 7): with `TRUST_PROXY=0`, 50 failed logins from anyone return 429 to every user for 15 minutes. The Phase 7 checklist item (`IMPLEMENTATION_CHECKLIST.md:111`) must be done before release.

</details>

<details>
<summary>Details</summary>

### `updateTask` conditional-update-first rewrite

`apps/api/src/services/tasks.service.ts:141-182` now issues `updateMany({ where: scope AND status ≠ COMPLETED })` before any read. Outcomes by state:

```
row state at UPDATE time            outcome
in scope, not COMPLETED, bad FK  →  P2003 caught → 400 INVALID_ASSIGNEE (rolled back)
in scope, not COMPLETED, ADMIN   →  1 row → assertAssignableEmployee throws 400 → rolled back
in scope, COMPLETED              →  0 rows → re-read → 409 TASK_COMPLETED
missing / deleted / out of scope →  0 rows → re-read → 404
0 rows but re-read finds it open →  409 CONFLICT (defensive, unreachable today)
```

A COMPLETED or missing row matches nothing, so the FK is never evaluated against it. That keeps the documented order without a pre-read. The P2003 catch is limited to `input.assignedToId !== undefined`, and `assignedToId` is the only FK column PATCH can write, so the mapping can't hide an unrelated FK failure (confirmed). The race tests (`apps/api/test/tasks.test.ts:357-406`) hold the row lock in a second transaction with an approval or a soft delete, and commit after the PATCH is in flight. They assert 409/404 and an unchanged title in the DB. The recorded negative check shows both tests fail on the old read-first code.

The CONFLICT branch has no test. Nothing can reach it while COMPLETED and soft delete are final states, and API.md documents it (`docs/API.md:187`).

### Spec #9 rollback and the concurrency tests

The rollback test (`apps/api/test/workflow.test.ts:284-303`) now requires `{ name: 'PrismaClientKnownRequestError', code: 'P2003' }`. It fails if an early guard rejects the ghost actor, or if the history insert ever moves ahead of the status update. The test still depends on the service letting an ADMIN call `start` (ARCHITECTURE §14 records this as a deliberate trade-off). If someone later adds a role check there, the test will need a different trigger.

The three transition concurrency tests (`workflow.test.ts:306-350`) and the two PATCH race tests all pass whether or not the requests actually overlap. When they overlap, they prove the guard. When they don't, the second request just sees the committed state. So a regression to read-then-write would only show up intermittently (likely). The PATCH tests partly close this gap with the held lock, but the 300 ms sleep is still a timing assumption about when the PATCH reaches its `UPDATE`.

### Test coverage

All nine spec §15 scenarios exist and assert DB state.

Not tested: the unreachable PATCH `CONFLICT` branch. Comments and history for an employee who has been reassigned away from a task are only implied by the detail-404 test. Concurrency is not forced deterministically (issue 1).

</details>

<details>
<summary>File map</summary>

- `apps/api/src/services/tasks.service.ts`: create (with history), get, list (filters, LIKE escaping, stable sort, pagination), conditional-update-first PATCH, soft delete
- `apps/api/src/services/task-workflow.service.ts`: conditional transition and history in one transaction; ADMIN check for approve/reject
- `apps/api/src/services/task-activity.service.ts`: scoped comments and history, `{ id, name, role }` author DTO
- `apps/api/src/services/dashboard.service.ts`: scoped `groupBy` counts and overdue count
- `apps/api/src/services/task-dto.ts`: relation selects, field-by-field `TaskDto`, `latestRejectionReason`
- `apps/api/src/routes/tasks.routes.ts`, `dashboard.routes.ts`, `controllers/tasks.controller.ts`, `dashboard.controller.ts`: route wiring, role gates, validators
- `apps/api/src/lib/prisma-errors.ts`, `middleware/error-handler.ts`: Prisma detection, `{ name, code }` logging, P2002/P2003/P2025 mapping
- `apps/api/src/lib/password.ts`, `prisma/seed.ts`, `services/users.service.ts`, `routes/users.routes.ts`, `controllers/users.controller.ts`, `app.ts`: shared `BCRYPT_COST`, startup dummy hash, `POST /users`
- `apps/api/src/middleware/rate-limit.ts`, `routes/auth.routes.ts`: IP-only login limiter
- `apps/api/src/middleware/validate.ts`, `lib/dates.ts`, `errors/app-error.ts`: params/query validation, strict date parsing, new error codes
- `packages/shared/src/schemas/tasks.ts`, `schemas/users.ts`, `types.ts`: strict schemas, list query, byte-length password rule, DTO types
- `apps/api/test/*`: tasks (incl. PATCH race), workflow, task-activity, task-list, dashboard, prisma-errors, unit, enum-parity; users and security extended
- `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_CHECKLIST.md`, `docs/phase4-verification.md`: contract, PATCH check order, Phase 7 `loginIp` item, evidence

Full diff: `git diff HEAD` plus untracked files (`git status --short`).

</details>
