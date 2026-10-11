# Implementation Checklist

Rules:
- Tick an item only after its verification has actually run, and note the evidence next to it (command, test name or manual check).
- `§` refers to sections of `PROJECT_SPEC.md`. Decisions D1–D10 are in `docs/ARCHITECTURE.md`.

Legend: `[ ]` not started · `[~]` in progress / awaiting approval · `[x]` verified

## Phase 1 — Inspect & plan (§19)
- [x] Workspace inspected. Only `PROJECT_SPEC.md` exists; no git repo. *(list_directory)*
- [x] Toolchain checked: Node 20.18.3 active, 22.19.0 available via nvm; pnpm 10.12.4; Docker CLI present, daemon not responding. *(shell)*
- [x] Spec compared with the initial proposal; conflicts recorded in ARCHITECTURE.md §11.
- [x] Architecture, data model, API conventions, auth, authorization matrix, folders, risks: approved by the user (2026-10-10).
- [x] Decisions D1–D8 and D10 approved. D9: Vercel plus an API host approved in principle; specific API and MySQL providers still to be picked in Phase 7.

## Phase 2 — Foundation & database (§3, §5, §16)
Full evidence: `docs/phase2-verification.md` (commands, outputs, versions).
Independent re-check by the orchestrator on 2026-10-10 (Node 22.19.0): `pnpm -r typecheck` exited 0. `pnpm -r lint` and `pnpm -r build` printed "Done" for every package, but their exit codes weren't captured because the shell tool hung after they finished. `pnpm --filter api test` passed 16/16. `pnpm db:seed` ran twice more: "kept" ×3 users and sample tasks skipped each time.
Review (`docs/phase2-review.md`): APPROVED. Its 9 non-blocking findings are assigned to Phases 3, 4, 6 and 7 (see the Phase 2 notes in ARCHITECTURE.md).
- [x] Node 22.19.0 pinned (`.nvmrc`, `engines >=22.18 <23 || >=24.11`); `git init` (D10). *(`node -v` → v22.19.0; `git rev-list --all --count` → 0 commits)*
- [x] Root: `package.json`, `pnpm-workspace.yaml` (incl. `onlyBuiltDependencies`), `tsconfig.base.json` (strict), `.gitignore`, `.env.example` (placeholders only). *(`pnpm install --frozen-lockfile` exit 0; only `@prisma/engines`, `esbuild`, `prisma` run scripts; `git check-ignore` matches all 4 local `.env` files)*
- [x] ESLint + Prettier configured for all packages. *(`pnpm -r lint` exit 0, 24 api + 8 shared files linted; `pnpm format:check` clean. ESLint 10 for api/shared, 9 for web; see verification doc)*
- [x] `packages/shared`: enums, Zod schemas, workflow table; builds with `tsc`. *(`pnpm -r build` / `typecheck` exit 0; web build imports `TaskStatus` from it)*
- [x] `apps/api` skeleton: Express 5, ESM, layered folders, `app.ts`/`server.ts`. *(build exit 0; `node dist/server.js` serves `/health` 200; SIGTERM → graceful exit 0)*
- [x] Env validation with Zod; the app fails fast with a clear message. *(no env → exit 1 listing `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` missing; short secret → "JWT_SECRET: must be at least 32 characters"; 5 `env.test.ts` tests pass)*
- [x] `docker-compose.yml` runs MySQL 8 with dev and test databases. *(`docker compose up -d --wait` → Healthy; mysql 8.4.11; `SHOW DATABASES` lists `task_approval`, `task_approval_test`)*
- [x] Prisma schema: 4 models, enums, FKs with `Restrict`, unique email, required indexes, `dueDate @db.Date`, `deletedAt`. *(checked in generated `migration.sql`: `ON DELETE RESTRICT` ×7, `users_email_key`, all 6 required indexes, `dueDate DATE`)*
- [x] First migration generated under `apps/api/prisma/migrations` (`20261010172057_init`; not committed yet, D10). *(`prisma migrate dev` on empty dev DB → applied; `migrate deploy` on empty test DB → applied; `migrate status` → up to date)*
- [x] Idempotent seed for the 3 demo users (hashed passwords) plus 5 sample tasks (D8). *(seed ×2: users 3/3, tasks 5/5, history 14/14; SHA-256 hash fingerprints identical after both runs; `bcrypt.compare` with demo passwords → true ×3)*
- [x] `GET /health` with a DB ping. *(Supertest: 200 `{database:"ok"}`, `/api/v1/health` alias, 503 when the check fails)*
- [x] Vitest + Supertest harness with the test-DB safety guard. *(`pnpm --filter api test` → 16/16 pass; guard tests reject `task_approval`, `my_test_prod`, `NODE_ENV≠test`)*
- [x] `apps/web` skeleton: Next.js, strict TS, Tailwind, shadcn/ui init, `/api/v1` rewrite to `API_URL`. *(`next build` ok; `next start` → `GET :3000/api/v1/health` proxied 200; `API_URL= next build` fails with a clear error; `shadcn info` reads `components.json`)*
- [x] `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r build` all pass. *(final run: all exit 0)*

## Phase 3 — Authentication & permissions (§7)
Full evidence: `docs/phase3-verification.md`. Final run: `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build` all `exit=0`; `pnpm format:check` clean; `pnpm --filter api test` → 7 files, 58/58 passed (16 from Phase 2 + 42 new). Not committed (orchestrator commits).
- [x] `POST /auth/login`: bcrypt check, JWT in an httpOnly cookie, same 401 for unknown email and wrong password, rate limited. *(auth.test.ts: 200 safe DTO with normalized email; wrong password vs unknown email → identical 401 `INVALID_CREDENTIALS`; dummy-hash compare when the user is missing; security.test.ts: 429 `RATE_LIMITED` after the configured limit, keyed by IP + email)*
- [x] `POST /auth/logout` clears the cookie (204). *(auth.test.ts: 204, `tas_token=;` with epoch `Expires`, same `HttpOnly`/`SameSite=Lax`/`Path=/`; idempotent without a cookie; manual proxy check #6)*
- [x] `GET /auth/me` returns a safe user DTO. *(auth.test.ts: 200 `{id,name,email,role}` / 401 without cookie; manual proxy check #2, #3)*
- [x] `authenticate` middleware: pinned algorithm, expiry checked, user reloaded from the DB. *(auth.test.ts: tampered, other secret, `alg: none`, expired, missing `exp`, deleted user, unknown `sub` → 401; signed token claiming ADMIN for an employee → role `EMPLOYEE` from DB)*
- [x] `requireRole('ADMIN')` middleware. *(users.test.ts: `GET /users` employee → 403 `FORBIDDEN`, admin → 200)*
- [x] Cookie flags: httpOnly, Secure in production, SameSite=Lax, Max-Age. *(auth.test.ts inspects `Set-Cookie`: `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`, no `Secure` in test; `Secure` with production config; manual proxy check #1 shows the same flags through Next.js)*
- [x] CSRF Origin / `Sec-Fetch-Site` check on unsafe methods. *(security.test.ts: foreign Origin → 403 `CSRF_REJECTED`, allowed Origin → 200, `Sec-Fetch-Site: cross-site`/`same-site` without Origin → 403, `Origin: null` → 403, logout covered; non-JSON body → 415; manual proxy check #4 → 403)*
- [x] Helmet headers, CORS allowlist with credentials, JSON body size limit. *(app.test.ts helmet test; security.test.ts: preflight ACAO = allowed origin + credentials true, foreign origin no ACAO; >100kb body → 413)*
- [x] Centralized error handler with consistent JSON; no stack traces, hashes or tokens. *(every new error test asserts the `{ error: { code, message } }` shape; login body checked for no token, no `passwordHash`, no `$2b$`; users list checked for no hashes; malformed JSON test checks no stack)*
- [x] Tests: valid login, invalid login, unauthenticated → 401, employee on an admin route → 403. *(auth.test.ts, users.test.ts; 58/58 pass)*
- [x] Task ownership policy (`services/task-access.ts`): scope in the query, 404 outside scope. *(task-access.test.ts on the real test DB: own task loads; other employee's, soft-deleted and unknown ids → 404; admin loads any non-deleted task)*
- [x] `GET /users` (admin, read-only employee list) added early as the admin route under test. *(users.test.ts; manual proxy check #5)*
- [x] Phase 2 review #4: `NODE_ENV` required (API env and seed). *(env.test.ts: missing → `NODE_ENV: is missing`; local `.env`/`.env.test` already set it)*
- [x] `TRUST_PROXY` env (hop count, default 0) applied via `app.set('trust proxy', …)`. *(env.test.ts default/parse tests; value tuned in Phase 7)*
- [x] Manual D1 proxy check through `next start` → Express. *(phase3-verification.md: login 200 + `Set-Cookie` via :3000, `/me` 200 with cookie, foreign Origin 403, both servers stopped)*

## Phase 4 — Task APIs & workflow (§6, §8–§12)
Full evidence: `docs/phase4-verification.md`. Final run: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build` all `exit=0`; `pnpm format:check` clean; `pnpm --filter api exec vitest run` → 14 files, 199/199 passed (58 earlier + 141 new); `pnpm db:seed` ×2 idempotent; manual curl smoke run against the built API passed. Review iteration 2 (phase4-review.md #1–#4 fixed): same commands `exit=0`, `pnpm --filter api test` → 14 files, 201/201; PATCH smoke passed. Not committed (orchestrator commits).
- [x] `GET /users` (admin): employee list, no `passwordHash`. *(done in Phase 3; users.test.ts)*
- [x] `POST /users` (admin): creates an EMPLOYEE only; role not accepted from the body; duplicate email → 409. *(users.test.ts: 201 DTO with role EMPLOYEE, `role` key → 400, `ZOE@test.local` → 409 `EMAIL_TAKEN`, employee → 403; ≤ 72 UTF-8 bytes: 75-byte `€` password → 400, 72 bytes → 201; hash rounds = `BCRYPT_COST`)*
- [x] `POST /tasks`: admin only; status PENDING; assignee must be an existing EMPLOYEE; history row with `from=null`. *(tasks.test.ts: 201 DTO + history `[null→PENDING, admin]`; employee 403; nonexistent / ADMIN assignee → 400 `INVALID_ASSIGNEE`; smoke #4)*
- [x] `GET /tasks`: pagination (max 100); status, priority, employee and `q` filters; employee scope enforced in the query. *(task-list.test.ts: meta, pages, each filter, `pageSize=101` → 400, employee sees own only; task-activity.test.ts: `?assignedToId=<emp2>` as emp1 → empty; smoke #18)*
- [x] `GET /tasks/:id`: admin sees all; employee sees own only, others → 404; deleted → 404. *(tasks.test.ts detail + delete tests; smoke #6)*
- [x] `PATCH /tasks/:id`: admin only; strict whitelist; no status or ownership mass assignment; COMPLETED → 409 (D5). *(tasks.test.ts: `status`/`createdById`/`reviewedById`/`reviewedAt`/`deletedAt`/unknown/empty → 400 with the DB row unchanged; COMPLETED → 409 `TASK_COMPLETED`; reassign keeps status; smoke #16. Race with a concurrent approve / delete → 409 / 404 with the edit not applied: "PATCH racing…" tests, which fail with 200 against the old read-first code; iteration 2 smoke #4–#13)*
- [x] `DELETE /tasks/:id`: admin only; soft delete → 204; excluded from lists and counts. *(tasks.test.ts: 204, then 404 on detail, absent from list, history kept, repeat → 404, employee 403; dashboard.test.ts: deleted tasks not counted)*
- [x] `start` / `submit`: assigned employee only, correct status only; atomic with history. *(workflow.test.ts #5, #6, #8; admin → 403; smoke #7, #10, #14)*
- [x] `approve`: admin only; PENDING_APPROVAL → COMPLETED; `reviewedById`/`reviewedAt` set; atomic with history. *(workflow.test.ts #2, #3; smoke #8, #15)*
- [x] `reject`: admin only; reason required; → IN_PROGRESS; reviewer recorded; reason in history; atomic. *(workflow.test.ts #4: reason in history and `latestRejectionReason`, 6 invalid bodies → 400; smoke #11, #12)*
- [x] Concurrency guard: conditional update; the loser gets 409. *(workflow.test.ts: double approve, approve vs reject, double start via `Promise.all` → `[200, 409]`, one history row)*
- [x] Comments: GET and POST with scope checks; 1–2000 chars; author DTO without sensitive fields. *(task-activity.test.ts: 201, order, author `{id,name,role}`, invalid → 400, other employee / deleted → 404; smoke #13)*
- [x] History: GET with scope check; no edit or delete endpoints. *(task-activity.test.ts: order, actor DTO, PATCH/DELETE → 404 route-not-found; smoke #17)*
- [x] `GET /dashboard/summary`: role-scoped counts, deleted tasks excluded, independent of pagination. *(dashboard.test.ts: 27 tasks vs a 20-row page, per-employee counts, zero keys, overdue rules; smoke #19)*
- [x] `docs/API.md`: bodies, responses, auth rules, status codes. *(written; check order incl. transport guards; ARCHITECTURE §7 updated)*
- [x] Required tests (§15), named `[spec #N]` in the test files:
  - [x] 1. Unauthenticated → 401 on a task endpoint *(tasks.test.ts)*
  - [x] 2. Employee cannot approve; status unchanged *(workflow.test.ts)*
  - [x] 3. Admin approves PENDING_APPROVAL; history persisted *(workflow.test.ts)*
  - [x] 4. Admin rejects → IN_PROGRESS *(workflow.test.ts)*
  - [x] 5. Employee 1 cannot access Employee 2's task (404) *(task-activity.test.ts, workflow.test.ts)*
  - [x] 6. Invalid transitions rejected (409) *(workflow.test.ts, 9 cases)*
  - [x] 7. Invalid task inputs rejected (400) *(tasks.test.ts, 15 cases + PATCH cases)*
  - [x] 8. Employee workflow PENDING → IN_PROGRESS → PENDING_APPROVAL *(workflow.test.ts, plus the full reject/resubmit/approve cycle)*
  - [x] 9. Status and history roll back together on failure *(workflow.test.ts: nonexistent actor → real FK failure on the history insert, asserted as `P2003`; status still PENDING, one history row)*
- [x] Extra tests: PATCH mass-assignment rejected; non-employee assignee rejected; double approve → one 200 / one 409; employee list scope; dashboard scope. *(see above; plus prisma-errors.test.ts, unit.test.ts, the security.test.ts IP limiter)*
- [x] Review follow-ups. Phase 2 #1 (Prisma mapping + `{name, code}`-only logging; prisma-errors.test.ts), #6 (unit.test.ts + `enum-parity.types.ts`, negative check fails as expected), #8 (UTF-8 byte limit). Phase 3 #2 (IP login limiter; security.test.ts), #3 (transport guards in ARCHITECTURE §7 and API.md), #4 (`BCRYPT_COST` shared by seed, `POST /users` and the dummy hash), #5 (all task access via `task-access.ts`; route-level 404/403 tests). *(phase4-verification.md)*

## Phase 5 — Frontend (§9, §13, §14)
- [ ] Login page (RHF + Zod, inline errors, toasts) and logout.
- [ ] Route protection plus role-based redirect; separate Admin and Employee navigation.
- [ ] App shell: sidebar, header, responsive layout.
- [ ] Admin dashboard: 5 counts, approval queue, task table with assignee.
- [ ] Admin task list: search plus status, priority and employee filters synced to the URL; pagination.
- [ ] Admin create and edit task forms (employee picker, date-only due date).
- [ ] Admin delete with a confirmation dialog.
- [ ] Admin approve, and reject with a required reason dialog.
- [ ] Admin employees page: list and create employee.
- [ ] Employee dashboard: own counts, assigned list, status and priority filters, overdue indicator.
- [ ] Employee task detail: start and submit, comments, history, rejection feedback banner.
- [ ] Shared: status and priority badges (accessible), skeletons, empty states, API error messages, toasts.
- [ ] Accessibility: labels, keyboard navigation, focus states. *(verify: keyboard-only walkthrough)*
- [ ] Web typecheck, lint and build pass; both roles walked through end to end in a browser against the real API.

## Phase 6 — Testing & hardening (§15, §19)
- [ ] Fresh DB: migrate, seed, then the full API test suite passes. *(record command and output summary)*
- [ ] `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r build` pass.
- [ ] Manual end-to-end: create → start → submit → reject → resubmit → approve; unauthorized attempts blocked.
- [ ] Logs and errors checked for leaked secrets, hashes or tokens.

## Phase 7 — Deployment (§18)
- [ ] Hosting confirmed (D9); free-tier limits checked for the 14-day window.
- [ ] Production build and start scripts; `prisma migrate deploy` as the release step.
- [ ] Production env vars documented; no hardcoded localhost; `API_URL` points at the deployed API.
- [ ] Cookie and CSRF checked through the proxy on real HTTPS URLs.
- [ ] `TRUST_PROXY` set to the real hop count. Verify `req.ip` is the client IP on the deployed chain and that `X-Forwarded-For` can't be spoofed, so rate-limit keys stay per client (Phase 3 review #1).
- [ ] `loginIp` limiter (50 / 15 min, `middleware/rate-limit.ts`) keyed on a real client IP before release. With `TRUST_PROXY=0` behind the Next.js proxy, `req.ip` is the proxy's address, so the limiter is one global bucket: after 50 login attempts from anyone, every user (even with the correct password) gets 429 for 15 minutes. *(verify on the deployed chain: two clients with different IPs get separate buckets; Phase 4 review #3)*
- [ ] Production seed instructions (safe to re-run; no password resets).
- [ ] Public-URL checklist executed. *(URLs supplied by the user)*

## Phase 8 — README & final review (§17, §19)
- [ ] README has all 18 required sections; demo credentials; AI usage and what was personally verified.
- [ ] Requirement → location → verification → result → limitation table.
