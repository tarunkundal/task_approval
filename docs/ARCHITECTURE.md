# Architecture & Implementation Plan

Status: **Approved 2026-10-10. Phases 2–4 complete; Phase 5 (frontend) implemented, awaiting review.** Source of truth for requirements: `PROJECT_SPEC.md`.
Decisions marked **(D#)** are listed in section 11 and need confirmation before Phase 2.

## 1. Environment findings (Phase 1 inspection)

| Item | Finding | Impact |
|---|---|---|
| Workspace | Only `PROJECT_SPEC.md`. No git repo, no `package.json`. | Greenfield; nothing to overwrite. |
| Node | Active `v20.18.3`; nvm also has `v22.19.0`. | Prisma 7 needs Node `^20.19`; current Vitest and Vite need Node 22.12+. **Use Node 22.19.0** (pinned via `.nvmrc` and `engines`). |
| pnpm | 10.12.4 | pnpm 10 blocks dependency build scripts by default, so allowed ones go in `onlyBuiltDependencies`. |
| Docker | CLI 29.2.1 installed. The daemon did not respond during inspection. | Start Docker Desktop before Phase 2 (local MySQL 8 runs via Compose). |
| MySQL client | Not installed | Not needed; use the container's `mysql` CLI. |

## 2. Architecture overview

```
Browser ──HTTPS──▶ Next.js (apps/web, Vercel)
                     │  same-origin requests to /api/v1/*  (Next rewrite = reverse proxy)
                     ▼
                  Express API (apps/api, Node host) ──Prisma──▶ MySQL 8 (managed)
```

- **Same-origin proxy (D1).** The browser only talks to the web origin. `/api/v1/*` is rewritten to `${API_URL}/api/v1/*`, so the auth cookie is first-party with `SameSite=Lax`. This avoids third-party cookie blocking: `*.vercel.app` and `*.onrender.com`, for example, are different sites. CORS is still configured with an explicit allowlist (`FRONTEND_URL`) for direct calls.
- **Frontend.** Next.js App Router with React 19 and TypeScript. The spec requires "React"; Next.js satisfies it and provides the proxy and server-side route guards.
- **Backend.** Express 5 with TypeScript (ESM, `NodeNext`). Layers: routes → controllers (thin: parse and respond) → services (business rules, transactions) → Prisma.
- **Shared package.** Contains only what both sides use: enums, Zod request schemas, the status-transition table and response DTO types. It is compiled with `tsc` to `dist`.

## 3. Folder structure

```
task-approval-system/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/            schema.prisma, migrations/, seed.ts
│  │  ├─ prisma.config.ts
│  │  ├─ src/
│  │  │  ├─ config/         env.ts (Zod-validated, fail fast)
│  │  │  ├─ middleware/     authenticate, requireRole, validate, csrf, rateLimit, error
│  │  │  ├─ routes/         auth, users, tasks, dashboard, health
│  │  │  ├─ controllers/
│  │  │  ├─ services/       auth, users, tasks, taskWorkflow, comments, history, dashboard
│  │  │  ├─ validators/     route-specific Zod (params/query) built on shared schemas
│  │  │  ├─ lib/            prisma client, jwt, password, dates, pagination
│  │  │  ├─ errors/         AppError hierarchy + error codes
│  │  │  ├─ app.ts          builds the Express app (used by tests)
│  │  │  └─ server.ts       listen + graceful shutdown
│  │  └─ test/              Vitest + Supertest integration tests, helpers, setup
│  └─ web/
│     └─ src/
│        ├─ app/            (auth)/login, (app)/admin/*, (app)/employee/*
│        ├─ features/       auth, tasks, users, dashboard (components + hooks + api)
│        ├─ components/ui/  shadcn/ui primitives
│        ├─ components/     layout (sidebar, header), shared (badges, empty states)
│        └─ lib/            api client, query client, date utils
├─ packages/shared/src/     enums.ts, schemas/*.ts, workflow.ts, types.ts
├─ docs/                    ARCHITECTURE.md, IMPLEMENTATION_CHECKLIST.md, API.md
├─ docker-compose.yml       MySQL 8 (dev db + test db)
├─ .env.example, .nvmrc, .gitignore, package.json, pnpm-workspace.yaml, tsconfig.base.json, README.md
```

## 4. Data model (Prisma, MySQL 8, `utf8mb4`)

```
User      id (cuid) · name · email UNIQUE · passwordHash · role(ADMIN|EMPLOYEE) · createdAt · updatedAt
Task      id (cuid) · title VARCHAR(200) · description TEXT · priority(LOW|MEDIUM|HIGH)
          · status(PENDING|IN_PROGRESS|PENDING_APPROVAL|COMPLETED) · dueDate DATE
          · assignedToId → User · createdById → User · reviewedById? → User · reviewedAt?
          · createdAt · updatedAt · deletedAt?
TaskComment        id · taskId → Task · authorId → User · body TEXT · createdAt
TaskStatusHistory  id · taskId → Task · fromStatus? · toStatus · actorId → User · reason? TEXT · createdAt
```

- **Relations.** Every foreign key uses `onDelete: Restrict`. Users are never hard-deleted, and tasks are soft-deleted (`deletedAt`), so audit rows can't be lost through cascades.
- **Indexes.**
  - Task: `(assignedToId, status)`, `(status)`, `(priority)`, `(deletedAt, createdAt)`.
  - TaskComment: `(taskId, createdAt)`.
  - TaskStatusHistory: `(taskId, createdAt)`.
  - Foreign keys on actor and author columns are indexed automatically.
- **Due date.** Stored as `@db.Date` (calendar date). The API accepts and returns `"YYYY-MM-DD"`. Conversion goes through one helper that uses UTC midnight, so dates never shift with timezones. "Overdue" means `dueDate < today` (the viewer's local date) and `status ≠ COMPLETED`.
- **Comments are not editable**, so `TaskComment` has no `updatedAt` (the spec makes that field conditional).
- **Audit scope (D4).** `TaskStatusHistory` records creation (`fromStatus = null`) and every transition, with the rejection reason. Field edits, reassignment and deletion are not recorded as history rows; this is documented in the README. Deletion is still traceable through `deletedAt`.

## 5. Workflow (state machine)

| Action | From → To | Actor | Extra effects |
|---|---|---|---|
| create | – → PENDING | ADMIN | history row (from = null) |
| start | PENDING → IN_PROGRESS | assigned EMPLOYEE | history row |
| submit | IN_PROGRESS → PENDING_APPROVAL | assigned EMPLOYEE | history row |
| approve | PENDING_APPROVAL → COMPLETED | ADMIN | `reviewedById`, `reviewedAt`, history row |
| reject | PENDING_APPROVAL → IN_PROGRESS | ADMIN, reason 1–1000 chars required | `reviewedById`, `reviewedAt`, history row with reason |

- The transition table lives in `packages/shared/src/workflow.ts`. It is enforced only by `services/taskWorkflow.ts` and imported by the UI only to decide which buttons to show.
- **Atomicity and concurrency.** Inside `prisma.$transaction`, a conditional update is followed by inserting the history row:
  - The update is `updateMany({ where: { id, status: from, deletedAt: null, [assignedToId: actor.id] }, data })`.
  - If the update matches 0 rows, the task is re-read: missing or not visible → 404; wrong status → 409 `INVALID_TRANSITION`.
  - Two conflicting transitions can't both succeed, because the second matches 0 rows.
- **Status-only endpoints.** Status changes only through these endpoints. `PATCH` uses a `.strict()` schema with no `status`, `createdById`, `reviewedById` or `reviewedAt`.
- **COMPLETED is final.** There is no reopening, and `PATCH` on a COMPLETED task returns 409 (D5).

## 6. Authentication

- **Login.** `POST /auth/login` checks the password with bcrypt (D2), then signs an HS256 JWT `{ sub, role }` using `jose`, with `exp = JWT_EXPIRES_IN` (default `8h`).
- **Cookie.** The token is set in an `httpOnly` cookie with `Secure` in production, `SameSite=Lax`, `Path=/` and a `Max-Age` matching the token expiry. The token is never placed in a response body or localStorage.
- **Each protected request.** The JWT is verified with the algorithm pinned and expiry checked. The user is then loaded from the database by `sub`; if the user is missing, the response is 401. The role used is the one from the database, never from the request.
- **Logout** clears the cookie (204). Limitation: a stolen token stays valid until it expires (stateless JWT). This is mitigated by the short expiry and documented.
- **Login failures** return the same 401 whether the email or the password is wrong. A dummy bcrypt comparison runs when the user doesn't exist, so response timing doesn't reveal which accounts exist.
- **CSRF protection** for POST, PATCH and DELETE:
  - The cookie is `SameSite=Lax`.
  - The `Origin` header (or `Sec-Fetch-Site` when `Origin` is absent) must be in the allowlist.
  - Request bodies must be JSON (`express.json` only).
- **Other protections.**
  - Helmet for security headers.
  - `express-rate-limit`: login allows 10 attempts per 15 minutes, keyed by IP and email; writes have a general limit.
  - `trust proxy` is configured for the hosting topology.
  - A request body size limit is enforced.

## 7. Authorization matrix

| Endpoint | ADMIN | EMPLOYEE | Notes |
|---|---|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | ✓ | ✓ | login and logout are public; `me` needs auth |
| `GET /users` | ✓ | 403 | lists employees; never returns `passwordHash` |
| `POST /users` | ✓ | 403 | creates EMPLOYEE only; the body cannot set a role; duplicate email → 409 |
| `GET /tasks` | all non-deleted | assigned only (enforced in the query) | an employee's `assignedToId` is forced to their own ID |
| `POST /tasks` | ✓ | 403 | assignee must be an existing EMPLOYEE, else 400 |
| `GET /tasks/:id` | ✓ | own only, else **404** | |
| `PATCH /tasks/:id` | ✓ (not COMPLETED) | 403 | title, description, priority, dueDate, assignedToId |
| `DELETE /tasks/:id` | ✓ → 204 (soft delete) | 403 | UI requires a confirmation dialog |
| `POST /tasks/:id/start`, `POST /tasks/:id/submit` | 403 | own only (else 404); wrong state → 409 | |
| `POST /tasks/:id/approve`, `POST /tasks/:id/reject` | ✓; wrong state → 409 | **403**, status unchanged | reject needs a reason (else 400) |
| `GET`/`POST /tasks/:id/comments` | ✓ | own tasks only (else 404) | body 1–2000 chars after trimming |
| `GET /tasks/:id/history` | ✓ | own only (else 404) | |
| `GET /dashboard/summary` | counts for all tasks | counts for own tasks | excludes deleted tasks; independent of pagination |
| `GET /health` | public | public | includes a DB ping; 503 if the DB is down |

Checks run in this order:
1. **Transport guards**, app-wide, before any router: CORS allowlist; CSRF Origin / `Sec-Fetch-Site` check on unsafe methods (403 `CSRF_REJECTED`); non-JSON body (415); body over 100 kb (413) or malformed JSON (400); rate limits (429).
2. Authenticate (401) → role (403) → validate params, query and body (400) → load the task within the user's scope (404) → state rules (409).

So an unauthenticated cross-site POST gets 403, not 401. The full table is in `docs/API.md`.

## 8. REST API conventions

- **Base path** `/api/v1`. The full contract (bodies, response shapes, status codes) will go in `docs/API.md` during Phase 4.
- **Task lists.**
  - Query parameters: `page` (≥1), `pageSize` (1–100, default 20), `status`, `priority`, `assignedToId` (admin only), `q` (title search), `sort`.
  - Response: `{ data: Task[], meta: { page, pageSize, total, totalPages } }`.
- **Task DTO.** Includes the assignee and creator `{ id, name, email }`, `dueDate` as `"YYYY-MM-DD"`, and `latestRejectionReason` when the most recent transition was a rejection.
- **Errors.** Every error returns `{ error: { code, message, details? } }`. Zod issues go in `details`. There are no stack traces, Prisma messages or secrets. Prisma `P2002` maps to 409 and `P2003` to 400.

## 9. Frontend plan

- **Stack.** Tailwind CSS v4 and shadcn/ui (Radix-based, accessible). React Hook Form with Zod (shared schemas). TanStack Query for server state, loading and error states, and cache invalidation (D6). `sonner` for toasts and `lucide-react` for icons.
- **Route protection.**
  - A Next.js request interceptor (`proxy.ts` in Next 16, formerly `middleware.ts`) redirects to `/login` when there's no cookie.
  - The `(app)` layout fetches `/auth/me` on the server and redirects by role.
  - The API stays the authority.
- **Admin screens:**
  - Dashboard: counts, the approval queue and a recent-tasks table.
  - Tasks: table with search and status, priority and employee filters synced to the URL, plus pagination.
  - New and edit task forms.
  - Task detail: details, approve, reject (dialog with a required reason), comments and a history timeline.
  - Employees: list and a create-account form.
  - Delete confirmation dialog.
- **Employee screens:**
  - Dashboard: own counts, assigned list with status and priority filters, and overdue badges.
  - Task detail: start and submit actions, comments, history, and a prominent "Admin feedback" banner after rejection.
- **Accessibility.** Labelled inputs, visible focus rings, keyboard-operable dialogs and menus, status badges with icon and text (not color alone) at WCAG AA contrast, plus skeletons and empty states.

## 10. Testing strategy

- **Tools.** Vitest and Supertest against `createApp()`, using a real MySQL **test database** (`task_approval_test` in the same container, configured in `apps/api/.env.test`).
- **Safety guard.** Test setup refuses to run unless `NODE_ENV=test` and the database name ends in `_test`. Tables are cleared between test files; files run sequentially (`fileParallelism: false`) for determinism.
- **Rollback test (spec #9).** The workflow service is called with an actor ID that doesn't exist. The status update succeeds, then the history insert fails its foreign key (asserted as Prisma `P2003`), and the test asserts the status rolled back. This uses a real database failure, not a mock.
- **Coverage.** All 9 required scenarios plus: employee task listing scoped to the employee; rejecting mass-assignment fields in PATCH; assignee must be an EMPLOYEE; double approval (one request gets 200, the other 409); no `passwordHash` in responses; and that the seed can be re-run safely.
- **Frontend.** Typecheck, lint and `next build`, plus a manual browser walkthrough of both roles. Playwright smoke tests are optional and only if time allows.

## 11. Decisions needing confirmation

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| D1 | Cookie topology | Same-origin proxy through Next.js rewrites (`SameSite=Lax`, first-party) | Cross-site cookie with `SameSite=None; Secure` (blocked by Safari and other tracking protections), or custom domain subdomains |
| D2 | bcrypt implementation | `bcryptjs` (pure JS bcrypt, no native build, cost 12) | native `bcrypt` (needs pnpm build approval and native toolchains on the host) |
| D3 | Frontend framework | Next.js (App Router), as you stated earlier | Vite React SPA + Vercel rewrites |
| D4 | Audit scope | Status history only (creation + transitions + rejection reason); documented | Also record edits, reassignment and deletion (needs an extra event model, beyond the spec's fields) |
| D5 | Edit rules | Admin may edit or reassign any non-COMPLETED task; status is kept on reassignment; COMPLETED tasks are read-only (409) | Also allow edits after completion |
| D6 | Server-state library | TanStack Query | Plain `fetch` + hand-rolled state |
| D7 | Demo passwords | Seeded with documented defaults (`Admin@12345`, `Employee1@12345`, `Employee2@12345`), overridable via `SEED_*_PASSWORD`; the seed never resets an existing user's password | – |
| D8 | Sample tasks | Seed ~5 sample tasks across statuses (with matching history) only when the task table is empty | Seed users only |
| D9 | Hosting | Web on Vercel. API on Render or Railway. MySQL on a managed provider (Railway, Aiven, TiDB Cloud or DigitalOcean). Limits checked in Phase 7. | Your preferred providers or existing accounts |
| D10 | Git | `git init` in Phase 2; commit at the end of each verified phase only when you approve | – |

## 12. Risks

1. **Cross-origin cookies.** Handled by D1.
   - To check in Phase 7: Vercel rewrites forward `Set-Cookie` and `Origin`, the cookie lands on the web host, and the CSRF Origin check passes through the proxy.
2. **Rate-limit client IP behind two proxies.** Vercel → host → app may hide the real client IP. Login is keyed by IP and email, and `trust proxy` is tuned per host. To verify after deployment.
3. **MySQL hosting.**
   - Free tiers change and may sleep or expire within the 14-day window.
   - Vitess and TiDB-style hosts differ on foreign keys and some features.
   - Managed hosts need TLS options in `DATABASE_URL`.
   - **Mitigation:** standard MySQL 8, `prisma migrate deploy` only in production, and a connectivity check early in Phase 7.
4. **Prisma 7 changes.**
   - Requires `prisma.config.ts`, a driver adapter for MySQL (`@prisma/adapter-mariadb`) and an explicit generator output path.
   - `.env` is not loaded automatically.
   - Exact versions will be checked and pinned at install time.
5. **Authorization defects.** Handled by the central policy, employee scope applied in queries, strict schemas and negative tests.
6. **Audit integrity.** Writes are transactional, the actor comes from the JWT and database, there are no edit or delete endpoints for history, and foreign keys use `Restrict`.
7. **Timezones.** Due dates are DATE-only with UTC conversion in one helper. Overdue is computed against the viewer's local date.
8. **Search case sensitivity.** Prisma's `mode: 'insensitive'` isn't available on MySQL. Case-insensitive search relies on the default `utf8mb4_0900_ai_ci` collation.

## 13. Phases (mapped to spec section 19)

| Phase | Scope | Exit criteria |
|---|---|---|
| 1 | Inspect and plan (this document) | Your approval of D1–D10 |
| 2 | Monorepo, strict TS, lint, shared package, Docker MySQL, Prisma schema + migration, seed, env validation, Express skeleton + `/health`, Next.js skeleton | `pnpm install`, `typecheck`, `lint`, `build` pass; migration applied; seed runs twice without duplicates; `/health` test passes |
| 3 | Auth + permissions middleware | Auth tests pass (valid and invalid login, 401s, cookie flags, role checks) |
| 4 | Users, tasks CRUD, workflow, comments, history, dashboard, `docs/API.md` | All 9 required tests + extra negative tests pass |
| 5 | Frontend screens wired to the real API | Typecheck, lint and build pass; both roles walked through in the browser |
| 6 | Hardening: full test run, lint, builds, end-to-end workflow incl. unauthorized actions | Everything green, and results recorded |
| 7 | Deployment prep and deployment (with your accounts and URLs) | Public-URL checklist passes |
| 8 | Final requirement-by-requirement review table | Table delivered with real results |

## 14. Phase 2 notes (version and config decisions)

- **Prisma 7.10.0**, not 8. npm `latest` is `8.0.0-rc.22`, a release candidate whose GA scope is PostgreSQL. Prisma 7 setup: `apps/api/prisma.config.ts` (loads `.env` via `dotenv`), `prisma-client` generator with output `src/generated/prisma` (gitignored, regenerated on install/build), and `@prisma/adapter-mariadb` built in `src/lib/prisma-client.ts`.
- **TypeScript 6.0.3**, not 7. `typescript-eslint` supports `<6.1.0` only.
- **ESLint 10** for api and shared. **ESLint 9** for web only, because `eslint-config-next`'s React plugins don't support v10 yet.
- **Collation.** Prisma creates tables as `utf8mb4_unicode_ci`, not the server default `utf8mb4_0900_ai_ci`. It is still case-insensitive, so risk 8 (search) is unchanged.
- **Extra index** `users(role)` for listing employees.
- **Test DB cleanup** uses `deleteMany` children-first instead of `TRUNCATE`, because MySQL refuses `TRUNCATE` on tables referenced by FKs.
- **Local MySQL** runs on host port 3307. The app user gets global DDL grants only so `prisma migrate dev` can create its shadow DB. Production uses `migrate deploy` only.

## 14. Phase 2 notes

### Actual versions
- Node 22.19.0
- Prisma 7.10.0 with `@prisma/adapter-mariadb`. Prisma 8 is still a release candidate.
- Express 5.3.0
- Next.js 16.4.0 with React 19.3.0
- Tailwind 4.3.3
- Zod 4.6.5
- Vitest 5.0.3
- TypeScript 6.0.3, capped by the `typescript-eslint` peer range
- MySQL 8.4 on host port 3307

Full list: `docs/phase2-verification.md`.

### Review follow-ups (from `docs/phase2-review.md`)

**Phase 3**
- **#4** Require `NODE_ENV` explicitly (no silent development default) so the `Secure` cookie flag can't fail open.

**Phase 4**
- **#1** Map Prisma errors (P2002 → 409, P2003 → 400). Log only the Prisma error `name` and `code`, never invocation arguments.
- **#6** Add unit tests for the workflow table, `parseMysqlUrl` and date helpers, plus a compile-time equality check between the shared enums and Prisma enums.
- **#8** Validate password length in UTF-8 bytes (≤ 72) on `POST /users`.

**Phase 6**
- **#7** Add an automated test that re-running the seed is safe.

**Phase 7**
- **#2** Add an explicit `DATABASE_SSL` option for the runtime adapter, and verify it against the chosen host.
- **#3** Make `prisma` and `tsx` available on the production host: move them to dependencies or require a full install.
- **#5** Document the seed as a single-instance release step, or add `GET_LOCK`.

**Done:** #9 (this document's status line).

### Local environment quirk
On the current network, `binaries.prisma.sh` doesn't resolve. If `pnpm install` fails at `prisma generate`, set `PRISMA_ENGINES_MIRROR=https://r2.prisma.sh` for that shell.

### Phase 3 notes (auth details fixed during implementation)
- **Cookie** name `tas_token`; `HttpOnly; SameSite=Lax; Path=/; Max-Age=<JWT_EXPIRES_IN>`, plus `Secure` when `NODE_ENV=production`. Logout clears it with the same attributes (epoch `Expires`).
- **Response shapes.** `POST /auth/login` and `GET /auth/me` return the bare user DTO `{ id, name, email, role }` (`UserDto` in `packages/shared`). `GET /users` returns `{ data: UserDto[] }`. Login failures: 401 `INVALID_CREDENTIALS` "Invalid email or password"; other auth failures: 401 `UNAUTHENTICATED`.
- **CSRF / content type** (`middleware/csrf.ts`, runs before body parsing on POST/PUT/PATCH/DELETE): an `Origin` must be in `FRONTEND_URL`; with no `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none` if present (`same-site` is rejected because it can't be matched to the allowlist); with neither header the request is treated as a non-browser client. Failures → 403 `CSRF_REJECTED`. A request body that isn't `application/json` → **415 `UNSUPPORTED_MEDIA_TYPE`**.
- **`FRONTEND_URL`** entries are normalized to bare origins (`new URL(x).origin`) and used for both CORS and CSRF.
- **Rate limits** (created inside `createApp()`, overridable through `createApp({ rateLimits })`): login 10 / 15 min keyed by IP + normalized email; all unsafe `/api/v1` requests 300 / 15 min per IP. 429 → `{ error: { code: 'RATE_LIMITED', message } }`. In-memory store, so limits are per instance.
- **`TRUST_PROXY`** (integer hop count, default 0 = trust none) feeds `app.set('trust proxy')`. Behind the Next.js proxy, `req.ip` is the proxy's address until this is tuned in Phase 7.
- **`NODE_ENV` is required** by the API env schema and by the seed (Phase 2 review #4).
- **Ownership policy** lives in `apps/api/src/services/task-access.ts`: `visibleTasksWhere(actor)`, `taskInScopeWhere(actor, id)` and `findTaskInScope(actor, id, db?)` (throws 404 `Task not found`). Phase 4 task endpoints must load tasks only through these.

### Phase 3 review follow-ups (from `docs/phase3-review.md`)

The orchestrator re-ran the checks independently: typecheck exited 0, lint exited 0, and API tests passed 58/58.

**Phase 4**
- **#2** Add a coarse IP-only login limiter (about 50 per 15 minutes) in front of the existing IP+email limiter, or document the trade-off.
- **#3** Document the transport checks (CORS, CSRF 403, 415, 413, 429) that run before the 401 → 403 → 400 → 404 → 409 chain, in §7 and `docs/API.md`.
- **#4** Use one exported bcrypt cost constant in the seed, `POST /users` and the dummy hash.
- **#5** Load every task through `findTaskInScope` / `visibleTasksWhere` (pass `tx` inside transactions). Add route-level tests: an employee gets 404 on another employee's task and 403 on approve/reject.

**Phase 7**
- **#1** Set `TRUST_PROXY` to the real hop count and verify `req.ip` on the deployed chain (added to the checklist).

### Phase 4 notes (task API details fixed during implementation)

No schema change or new dependency was needed. The full contract is in `docs/API.md`.

- **Layout.**
  - `services/tasks.service.ts`: CRUD and list.
  - `services/task-workflow.service.ts`: the only place status changes.
  - `services/task-activity.service.ts`: comments and history.
  - `services/dashboard.service.ts`: counts.
  - `services/task-dto.ts`: the response mapping.
  - Every task read and write goes through `task-access.ts` (`visibleTasksWhere` / `taskInScopeWhere` / `findTaskInScope`, with `tx` inside transactions).
- **Workflow enforcement.** The guard is `updateMany({ where: AND[scope, id, status = from] })`; 0 rows → re-read in scope → 404 or 409 `INVALID_TRANSITION` (`details: { action, currentStatus }`). Roles are gated by `requireRole` on each route. approve/reject also check ADMIN in the service, because the employee scope alone would match an assignee's own task. start/submit rely on the route gate for the ADMIN exclusion, since an admin gains no privilege from them. The shared `canPerformAction` is used only by the UI.
- **Reject** stores the reason only in the history row; there is no feedback comment. `TaskDto.latestRejectionReason` exposes it while the task is back IN_PROGRESS.
- **PATCH** checks run in this order: scope (404), then COMPLETED (409 `TASK_COMPLETED`), then assignee (400 `INVALID_ASSIGNEE`). Like transitions, the conditional update (`scope AND status ≠ COMPLETED`) is the transaction's first statement: under InnoDB REPEATABLE READ a plain SELECT first would fix a snapshot, so after a concurrent approve/delete the update would match 0 rows while the re-read still showed the old row and returned 200 (Phase 4 review #1). On 0 rows the task is re-read (404 / 409). An unknown assignee fails the FK (P2003 → `INVALID_ASSIGNEE`); an ADMIN assignee is checked after the update and the throw rolls it back. Edits and reassignments write no history (D4).
- **Search.** Prisma's `contains` does not escape LIKE wildcards on MySQL (found by a test), so `%`, `_` and `\` are escaped in the service.
- **Query validation.** Express 5 exposes `req.query` as a getter, so `validateQuery` defines the parsed value on the request instance and controllers read it via `parsedQuery<T>(req)`. `validateParams` checks that `:id` is a cuid.
- **Prisma errors** are mapped in the central handler: P2002 → 409 `CONFLICT`, P2003 → 400, P2025 → 404, others → 500. For any Prisma error only `{ name, code }` is logged (Phase 2 review #1).
- **bcrypt.** `BCRYPT_COST = 12` is exported from `lib/password.ts` and used by the seed, `POST /users` and the login dummy hash. The dummy hash is now generated at startup with that cost instead of being a literal (Phase 3 review #4).
- **Passwords** for `POST /users` must be ≥ 8 characters and ≤ 72 UTF-8 bytes (`utf8ByteLength` in shared; Phase 2 review #8).
- **Login rate limits.** A coarse per-IP limiter (`loginIp`, 50 / 15 min) runs before the IP + email limiter (Phase 3 review #2). Behind the proxy with `TRUST_PROXY=0` it becomes one shared bucket (50 failed logins from anyone lock everyone out for 15 minutes); a dedicated Phase 7 checklist item covers keying it on the real client IP (Phase 4 review #3).
- **Dashboard** `overdue` uses today's UTC date. The UI may recompute it against the viewer's local date.
- **`parseDateOnly`** now rejects non-existent dates (round-trip check) instead of rolling them over.
- **Tests** cover Phase 2 review #6 and Phase 3 reviews #3 and #5:
  - `test/unit.test.ts`: workflow table, `parseMysqlUrl`, date helpers.
  - `test/enum-parity.types.ts`: compile-time check against the Prisma `$Enums`, included in `typecheck`.
  - Route-level ownership tests (`task-activity.test.ts`, `workflow.test.ts`).
  - Transport guards documented in §7 and `docs/API.md`.

### Phase 5 notes (frontend)

Full plan: `docs/phase5-plan.md` (decisions P1–P22). Evidence: `docs/phase5-verification.md`. No backend change was needed in Phase 5.

- **Routes (P1).** `/login`; admin `/admin`, `/admin/tasks`, `/admin/tasks/new`, `/admin/tasks/[id]`, `/admin/tasks/[id]/edit`, `/admin/employees`; employee `/employee`, `/employee/tasks/[id]`. `/` redirects by role. Route groups `(auth)` and `(app)`.
- **Guards (P2–P5).** `src/proxy.ts` (Next 16 Proxy) only checks that `tas_token` exists and forwards the path in `x-pathname`. `(app)/layout.tsx` validates the session with `GET /auth/me` server-side (`src/lib/api/server.ts`, `server-only`, React `cache`, forwards only `tas_token`); the admin/employee layouts send a wrong role to its own home. `?next=` goes through `safeReturnPath`. The API stays the authority.
- **Data (P6–P10).** All data except `/auth/me` is fetched client-side with TanStack Query through relative `/api/v1` paths (same-origin rewrite, D1). Query keys live in `src/lib/query-keys.ts` and every mutation's cache effect in `src/lib/query-invalidation.ts`. A stale 409/404 toasts the API message and refetches.
- **Forms (P11).** React Hook Form + the shared Zod schemas; API `VALIDATION_ERROR` details map to fields. Edit sends only dirty fields.
- **Dates (P13).** `dueDate` strings are never parsed with `new Date(string)`; overdue badges use the viewer's local date, the dashboard Overdue card uses the API's UTC count.
- **Errors.** Both error boundaries use Next's `retry` (re-fetches the server render); verified in a browser with the API down and back up (`e2e/error-boundary.spec.ts`).
- **Tests.** Vitest for pure modules (`TZ=Pacific/Honolulu`); Playwright e2e against the guarded test DB on ports 3100/4100 (`pnpm test:e2e`, build in `.next-e2e`), including axe-core WCAG 2.0/2.1 A + AA checks with no rule exclusions, keyboard checks, a 390 px responsive spec and the doc screenshots (`docs/screenshots/phase5/`).
