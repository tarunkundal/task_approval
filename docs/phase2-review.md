# Phase 2 foundation: monorepo, Prisma schema, seed and API/web skeletons

Phase 2 stands up the pnpm monorepo (`apps/api`, `apps/web`, `packages/shared`) on a strict shared tsconfig, a Docker MySQL 8.4 with dev and `_test` databases, a Prisma 7 schema with its initial migration, an idempotent seed, a Zod-validated Express 5 skeleton exposing only `/health`, and a Next.js 16 skeleton that proxies `/api/v1/*` to `API_URL`. The schema and migration match ARCHITECTURE.md §4 exactly, the seed never touches existing users, and the recorded evidence in `docs/phase2-verification.md` covers every required check (install, typecheck, lint, build, compose, migrate, seed ×2 with hash fingerprints, 16 API tests, env-error startup, proxied health). No Phase 3+ endpoints exist and nothing is committed.

Watch for: the centralized error handler logs raw error stacks, which will include Prisma invocation arguments once write paths exist (likely); the runtime MySQL connection drops DATABASE_URL query options, so there is currently no way to enable TLS for a managed host (confirmed); `prisma` and `tsx` are devDependencies but are needed by the production release and seed steps (likely). None of these is live in Phase 2.

**Verdict**: APPROVED

## High-level view

The schema follows ARCHITECTURE §4 one-for-one. That covers the four tables with cuid ids, ENUM columns, unique email, `VARCHAR(200)`/`TEXT`/`DATE` types, nullable `deletedAt`, the six listed indexes plus `users(role)`, all seven FKs `ON DELETE RESTRICT`, and no `updatedAt` on comments.

The shared package holds the const-object enums, strict Zod schemas and the workflow table. Create/start/submit/approve/reject carry the right roles, assignee flags and the 1–1000 char reject reason, and `updateTaskSchema` is a strict whitelist with no status or ownership fields. Nothing tests the table yet, and nothing ties the shared enums to the Prisma enums.

The API skeleton is a `createApp()` factory plus a `server.ts` that owns listen and graceful shutdown. Env validation fails fast without echoing values and enforces a 32+ char `JWT_SECRET`. The error and 404 shapes are `{ error: { code, message, details? } }`, and `/health` returns 503 when the ping fails or times out. The gaps are forward-looking: what the error handler logs, how the Prisma adapter is configured for production, and a `NODE_ENV` default that fails open.

The seed never touches an existing user (`upsert` with `update: {}`) and inserts sample tasks with matching history only into an empty task table. The recorded double run kept 3 users, 5 tasks, 14 history rows and identical hash fingerprints. The empty-table check is not safe if two seeds run concurrently, and idempotency is verified only by hand.

The web skeleton (App Router under `src/`, Tailwind v4, shadcn Button) imports `@workspace/shared`, and its rewrite refuses a production build without `API_URL`, so production never falls back to localhost.

<details>
<summary>Issues (9)</summary>

1. **Error logs will carry Prisma payloads** — `errorHandler` logs `err.stack` for every unexpected error, and Prisma validation errors embed the invocation arguments (likely). Before Phase 3/4 write paths land, map known Prisma errors (P2002 → 409, P2003 → 400) and log only `name`/`code` for Prisma errors.
2. **No TLS path for the runtime DB connection** — `parseMysqlUrl` drops the URL query string, so `?ssl=…` options reach `prisma migrate` but never the runtime adapter (confirmed). Add an explicit SSL option (env var or parsed query) in Phase 7 and verify it against the chosen host.
3. **Release tooling in devDependencies** — `prisma` (needed by `postinstall`, `build` and `migrate deploy`) and `tsx` (needed by `prisma db seed`) are devDependencies, so a `--prod` install breaks the release and seed steps (likely). Move them to dependencies or document a full install on the host in Phase 7.
4. **`NODE_ENV` defaults to development** — an unset `NODE_ENV` on a host turns on `allowPublicKeyRetrieval` and will produce non-Secure cookies in Phase 3 (confirmed default, possible impact). Require `NODE_ENV` explicitly, or derive the cookie `Secure` flag from an `https` `FRONTEND_URL`.
5. **Concurrent seeds can double-insert sample tasks** — `task.count()` followed by inserts takes no lock (likely). Use `GET_LOCK`/`SELECT … FOR UPDATE`, or document the seed as a single-instance release step.
6. **Workflow table, enum parity and helpers untested** — `canPerformAction`/`getAvailableActions`, `parseMysqlUrl` and the date-only helpers have no tests, and nothing fails if the shared enums drift from the Prisma enums (confirmed). Add unit tests and a type-level enum equality check in Phase 4.
7. **Seed idempotency has no automated test** — the double-run evidence is manual, but ARCHITECTURE §10 lists "seed can be re-run safely" as a test. Add it to the API suite by Phase 6.
8. **Password max length counts characters, not bytes** — `max(72)` counts UTF-16 units, so a multibyte password over 72 bytes is silently truncated by bcrypt (likely, low impact). Validate the UTF-8 byte length when `POST /users` is implemented.
9. **Stale ARCHITECTURE.md status line** — the header still reads "Phase 1 draft, awaiting approval" although D1–D10 are approved (confirmed). Update it.

</details>

<details>
<summary>Details</summary>

### Shared workflow table and enum drift

```
create   –                → PENDING           ADMIN
start    PENDING          → IN_PROGRESS       EMPLOYEE (assignee)
submit   IN_PROGRESS      → PENDING_APPROVAL  EMPLOYEE (assignee)
approve  PENDING_APPROVAL → COMPLETED         ADMIN
reject   PENDING_APPROVAL → IN_PROGRESS       ADMIN, reason trim 1–1000
```

`canPerformAction` checks an in-memory snapshot, so it suits the UI's button logic and nothing more. ARCHITECTURE §5 has the server enforce transitions through a conditional `updateMany` in `services/taskWorkflow.ts`, which doesn't exist yet. Phase 4 should not reuse `canPerformAction` as the server check. Status has to be re-checked atomically in the update's `where`.

The enums are written out by hand twice: as const objects in `packages/shared/src/enums.ts` and in `schema.prisma`. Nothing catches a renamed or added value at compile time (confirmed). A type-level equality between `$Enums.TaskStatus` and the shared `TaskStatus` in the API would cover it. Not tested: the shared package has no test runner at all, and `parseMysqlUrl` and `parseDateOnly`/`formatDateOnly`, which Phase 4 due-date handling will rely on, have no tests either.

`createUserSchema.password` uses `.max(72)` on a JS string. That bounds UTF-16 code units, not the 72 bytes bcrypt actually reads. A password of 30 three-byte characters passes validation, and everything after its 24th character is ignored by the hash (likely; bcryptjs truncates at 72 bytes).

### Error handler logging and Prisma

```ts
console.error('[api] unhandled error', err instanceof Error ? (err.stack ?? err.message) : err);
```

Responses stay clean. The risk is in the log. `PrismaClientValidationError` and some `PrismaClientKnownRequestError` messages render the failing call with its arguments. Once `POST /users` or the task writes exist, an unexpected Prisma failure would write field values to the log, possibly including `passwordHash` (likely). Spec §7 forbids password hashes in logs. In Phase 2 no request reaches a Prisma write, so this is not live yet. The fix fits with the P2002/P2003 mapping already planned for the handler.

### Production database connectivity

`createPrismaClient` builds the MariaDB adapter from `parseMysqlUrl`, which keeps only host, port, user, password and database:

```
DATABASE_URL=mysql://u:p@host/db?ssl={"rejectUnauthorized":true}
   prisma migrate deploy  → reads the full URL (via prisma.config.ts)
   runtime adapter        → query string discarded, no ssl option
```

Migrations and the running app can therefore connect differently (confirmed). In production `allowPublicKeyRetrieval` is off and there is no TLS option, so a managed MySQL 8 host using `caching_sha2_password` will refuse the connection. That fails closed. The code comment defers TLS to Phase 7. The fix needs a deliberate input (a `DATABASE_SSL` env var or parsed query options) rather than relying on the URL.

Both `production` flags derive from `NODE_ENV`, which defaults to `'development'` in the env schema. A host that doesn't set `NODE_ENV` silently gets development behaviour: public-key retrieval now, non-Secure cookies once Phase 3 lands. Making `NODE_ENV` required, or failing startup when `FRONTEND_URL` is `https` but `NODE_ENV` isn't `production`, would close this.

`prisma` and `tsx` are devDependencies. `postinstall` and `build` both run `prisma generate`, the release step is `prisma migrate deploy`, and `prisma db seed` runs `tsx prisma/seed.ts`. A host doing a production-only install would fail at `postinstall` or have no CLI for the release step (likely; depends on the Phase 7 host's install mode).

### Seed sample-task race

The sample-task path reads `tx.task.count()` inside an interactive transaction and inserts when it's 0. Under InnoDB REPEATABLE READ that read takes no lock, so two seeds started together (for example a release step on two instances) would each insert all five tasks and their history (likely). This only happens when seeds overlap, which a manual run won't do. Either take `GET_LOCK('seed')` or document the seed as a single-run step. The double-run evidence (counts and `SHA2(passwordHash)` fingerprints) was collected by hand. ARCHITECTURE §10 promises an automated "seed can be re-run safely" test.

</details>

<details>
<summary>File map</summary>

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc` — workspace root, strict TS base, lint/format, Node pin, build-script allowlist
- `.gitignore`, `.env.example` — env files ignored; placeholder-only variable reference
- `docker-compose.yml`, `docker/mysql/init/01-databases.sh` — local MySQL 8.4 on 3307 with `task_approval` and `task_approval_test`
- `apps/api/prisma/schema.prisma`, `prisma/migrations/20261010172057_init/*`, `prisma.config.ts` — data model, initial migration, Prisma 7 config
- `apps/api/prisma/seed.ts` — idempotent demo users and sample tasks with history
- `apps/api/src/app.ts`, `server.ts` — app factory; listen and graceful shutdown
- `apps/api/src/config/env.ts` — Zod env validation
- `apps/api/src/middleware/*`, `errors/app-error.ts` — JSON 404 and centralized error handler
- `apps/api/src/{routes,controllers,services}/health.*` — `/health` with DB ping
- `apps/api/src/lib/{prisma,prisma-client,database-url,dates}.ts` — Prisma singleton, adapter construction, URL parsing, date-only helpers
- `apps/api/test/**`, `vitest.config.ts` — health/error/env/guard tests, test-DB guard, migrate-on-setup
- `packages/shared/src/**` — enums, Zod schemas, workflow table
- `apps/web/**` — Next.js App Router skeleton, Tailwind v4, shadcn Button, `/api/v1` rewrite
- `docs/*` — architecture, checklist, Phase 2 verification evidence

Full diff: the working tree is uncommitted (every file is untracked), so there is no `git diff`. Review the files directly.

</details>
