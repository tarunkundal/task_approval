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
- [ ] `POST /auth/login`: bcrypt check, JWT in an httpOnly cookie, same 401 for unknown email and wrong password, rate limited.
- [ ] `POST /auth/logout` clears the cookie (204).
- [ ] `GET /auth/me` returns a safe user DTO.
- [ ] `authenticate` middleware: pinned algorithm, expiry checked, user reloaded from the DB.
- [ ] `requireRole('ADMIN')` middleware.
- [ ] Cookie flags: httpOnly, Secure in production, SameSite=Lax, Max-Age. *(verify: test inspects `Set-Cookie`)*
- [ ] CSRF Origin / `Sec-Fetch-Site` check on unsafe methods. *(verify: test with a foreign Origin → 403)*
- [ ] Helmet headers, CORS allowlist with credentials, JSON body size limit.
- [ ] Centralized error handler with consistent JSON; no stack traces, hashes or tokens. *(verify: tests)*
- [ ] Tests: valid login, invalid login, unauthenticated → 401, employee on an admin route → 403.

## Phase 4 — Task APIs & workflow (§6, §8–§12)
- [ ] `GET /users` (admin): employee list, no `passwordHash`.
- [ ] `POST /users` (admin): creates an EMPLOYEE only; role not accepted from the body; duplicate email → 409.
- [ ] `POST /tasks`: admin only; status PENDING; assignee must be an existing EMPLOYEE; history row with `from=null`.
- [ ] `GET /tasks`: pagination (max 100); status, priority, employee and `q` filters; employee scope enforced in the query.
- [ ] `GET /tasks/:id`: admin sees all; employee sees own only, others → 404; deleted → 404.
- [ ] `PATCH /tasks/:id`: admin only; strict whitelist; no status or ownership mass assignment; COMPLETED → 409 (D5).
- [ ] `DELETE /tasks/:id`: admin only; soft delete → 204; excluded from lists and counts.
- [ ] `start` / `submit`: assigned employee only, correct status only; atomic with history.
- [ ] `approve`: admin only; PENDING_APPROVAL → COMPLETED; `reviewedById`/`reviewedAt` set; atomic with history.
- [ ] `reject`: admin only; reason required; → IN_PROGRESS; reviewer recorded; reason in history; atomic.
- [ ] Concurrency guard: conditional update; the loser gets 409.
- [ ] Comments: GET and POST with scope checks; 1–2000 chars; author DTO without sensitive fields.
- [ ] History: GET with scope check; no edit or delete endpoints.
- [ ] `GET /dashboard/summary`: role-scoped counts, deleted tasks excluded, independent of pagination.
- [ ] `docs/API.md`: bodies, responses, auth rules, status codes.
- [ ] Required tests (§15):
  - [ ] 1. Unauthenticated → 401 on a task endpoint
  - [ ] 2. Employee cannot approve; status unchanged
  - [ ] 3. Admin approves PENDING_APPROVAL; history persisted
  - [ ] 4. Admin rejects → IN_PROGRESS
  - [ ] 5. Employee 1 cannot access Employee 2's task (404)
  - [ ] 6. Invalid transitions rejected (409)
  - [ ] 7. Invalid task inputs rejected (400)
  - [ ] 8. Employee workflow PENDING → IN_PROGRESS → PENDING_APPROVAL
  - [ ] 9. Status and history roll back together on failure
- [ ] Extra tests: PATCH mass-assignment rejected; non-employee assignee rejected; double approve → one 200 / one 409; employee list scope; dashboard scope.

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
- [ ] Production seed instructions (safe to re-run; no password resets).
- [ ] Public-URL checklist executed. *(URLs supplied by the user)*

## Phase 8 — README & final review (§17, §19)
- [ ] README has all 18 required sections; demo credentials; AI usage and what was personally verified.
- [ ] Requirement → location → verification → result → limitation table.
