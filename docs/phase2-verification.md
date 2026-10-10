# Phase 2 verification evidence

Run on 2026-10-10, macOS, Node 22.19.0 (via `nvm use 22.19.0`), pnpm 10.12.4, Docker server 29.8.2.
Outputs are trimmed; nothing below is paraphrased into a success that did not happen.

## Dependency versions (all pinned exactly)

| Package | Version | Why this version |
|---|---|---|
| Node | 22.19.0 (`.nvmrc`; `engines: >=22.18 <23 \|\| >=24.11`) | Prisma 7 needs ^20.19/^22.12; Vitest 5 needs ^22.12 |
| pnpm | 10.12.4 (`packageManager`) | installed version |
| TypeScript | 6.0.3 | `typescript-eslint@8.71.1` peer is `<6.1.0`, so 7.0.2 (latest) is not supported yet |
| Prisma / @prisma/client / @prisma/adapter-mariadb | 7.10.0 | npm `latest` is `8.0.0-rc.22`, a release candidate whose GA scope is PostgreSQL; 7.10.0 is the newest stable 7.x |
| Express | 5.3.0 | latest |
| helmet | 8.3.0 | latest |
| Zod | 4.6.5 | latest |
| bcryptjs | 3.0.3 | latest (ships its own types) |
| dotenv | 18.0.7 | latest |
| Next.js / eslint-config-next | 16.4.0 | latest |
| React / React DOM | 19.3.0 | latest |
| Tailwind CSS / @tailwindcss/postcss | 4.3.3 | latest |
| shadcn CLI (dlx only) / radix-ui | 4.21.4 / 1.7.0 | latest |
| Vitest / Vite | 5.0.3 / 8.3.4 | latest (Vite is Vitest's required peer) |
| Supertest | 7.3.1 | latest |
| tsx | 4.23.15 | latest (seed + `dev`) |
| ESLint | 10.12.0 (root, api, shared); 9.39.5 (web only) | `eslint-config-next` pulls `eslint-plugin-react`/`jsx-a11y`, which only support ESLint ≤9. npm flags 9.39.5 as deprecated; confined to `apps/web` until those plugins support v10 |
| typescript-eslint / @eslint/js / Prettier | 8.71.1 / 10.0.1 / 3.9.10 | latest |
| MySQL (Docker) | `mysql:8.4` → server 8.4.11 | LTS |

## Scope item 9 commands

| # | Command | Result |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | exit 0, "Done in 2.9s"; build scripts run only for `@prisma/engines`, `esbuild`, `prisma`; `unrs-resolver` intentionally ignored |
| 2 | `pnpm -r typecheck` | exit 0 (shared, api incl. `prisma generate`, web incl. `next typegen`) |
| 3 | `pnpm -r lint` | exit 0; api lints 24 files, shared 8 files (checked with `eslint . -f json`) |
| 4 | `pnpm -r build` | exit 0; shared `tsc`, api `prisma generate && tsc`, web `next build` (routes `/`, `/_not-found`) |
| 5 | `pnpm format:check` | "All matched files use Prettier code style!" |
| 6 | `docker compose up -d --wait` | exit 0, "Container task-approval-mysql Healthy"; `docker compose ps`: `Up (healthy) 0.0.0.0:3307->3306/tcp` |
| 7 | init SQL check (`SHOW DATABASES; SHOW GRANTS FOR task_app`) | `task_approval`, `task_approval_test` exist; `task_app` has ALL on both + global `CREATE, DROP, REFERENCES, INDEX, ALTER` (local shadow DB only) |
| 8 | `prisma migrate dev --name init` (empty dev DB) | "Applying migration `20261010172057_init` … Your database is now in sync with your schema." |
| 9 | `prisma migrate deploy` (empty test DB, via Vitest globalSetup) | "Applying migration `20261010172057_init` … All migrations have been successfully applied." Later runs: "No pending migrations to apply." |
| 10 | `prisma migrate status` (dev DB) | "Database schema is up to date!" |
| 11 | `pnpm db:seed` run 1 | created 3 users, "created 5 sample tasks with status history" |
| 12 | `pnpm db:seed` run 2 | "kept" ×3, "skipped sample tasks (5 task(s) already exist)" |
| 13 | DB snapshot after each run (mysql CLI in container) | both runs: users 3, tasks 5, history 14; `LEFT(SHA2(passwordHash,256),16)` identical (`078da603…`, `26f89f9a…`, `bf91f14e…`); hashes start `$2b$12$` |
| 14 | `bcrypt.compare` of documented demo passwords vs stored hashes | true for all 3 users |
| 15 | `pnpm --filter api test` | 3 files, 16 tests passed (list below) |
| 16 | `node dist/server.js` with no env (cwd without `.env`) | exit 1: `Invalid environment configuration: DATABASE_URL: is missing, JWT_SECRET: is missing, FRONTEND_URL: is missing. See .env.example …` |
| 17 | same with `JWT_SECRET=short` | exit 1: `JWT_SECRET: must be at least 32 characters`, `FRONTEND_URL: is missing` (value not echoed) |
| 18 | `node dist/server.js` with `apps/api/.env`, `GET /health`, then SIGTERM | `HTTP/1.1 200 OK {"status":"ok","checks":{"database":"ok"}}`; unknown route → `{"error":{"code":"NOT_FOUND",…}}`; "SIGTERM received, shutting down", exit 0 |
| 19 | `next start` + API: `GET http://localhost:3000/api/v1/health` | `{"status":"ok","checks":{"database":"ok"}} -> HTTP 200` (D1 rewrite proxy works); `GET /` → 200 with the placeholder title |
| 20 | `API_URL= next build` | fails: `API_URL must be set for production builds` |
| 21 | `shadcn@4.21.4 info` / `add button --dry-run` | CLI resolves `components.json` (rsc, tsx, lucide, aliases, `globals.css`) and sees `button` as installed |

Test names (`vitest run --reporter=verbose`):
- app.test.ts: health 200 with DB ok; `/api/v1/health` alias; 503 when the DB check fails; unknown route JSON 404 shape; malformed JSON 400 without stack; helmet headers and no `x-powered-by`.
- env.test.ts: valid config; missing `JWT_SECRET`; short `JWT_SECRET` (value not echoed); all problems listed at once; non-MySQL URL rejected.
- db-guard.test.ts: accepts `_test`; rejects `task_approval`; rejects `my_test_prod`; rejects `NODE_ENV≠test`; rejects missing `DATABASE_URL`.

## Environment notes

- Local DNS (phone hotspot, NAT64) cannot resolve `binaries.prisma.sh`, so the first `pnpm install` failed in `prisma generate`. It is a CNAME to Prisma's own `r2.prisma.sh`, which resolves. Install was run with `PRISMA_ENGINES_MIRROR=https://r2.prisma.sh` (Prisma verifies the engine SHA-256). This is a shell variable only, not committed config.
- The shadcn CLI's button diff imports `cn` from an npm package named `cn`. I didn't apply it. `src/components/ui/button.tsx` matches the CLI's current template but imports `cn` from the local `@/lib/utils`.
- Git: `git init` done; 0 commits (D10). `git check-ignore` confirms `.env`, `apps/api/.env`, `apps/api/.env.test` and `apps/web/.env` are ignored.
