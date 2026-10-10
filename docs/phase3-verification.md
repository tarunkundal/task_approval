# Phase 3 verification evidence

Run on 2026-10-11 (local time), macOS, Node 22.19.0 (`nvm use 22.19.0`), pnpm 10.12.4, Docker MySQL `task-approval-mysql` (8.4, host port 3307, healthy).
Each command ran from the repo root with output captured to a log file together with `exit=$?`. Outputs below are trimmed, not paraphrased.

## New dependencies (apps/api, pinned exactly)

| Package | Version | Use |
|---|---|---|
| `jose` | 6.2.12 | HS256 JWT sign/verify (`algorithms: ['HS256']`, `requiredClaims: ['sub','exp']`) |
| `cookie-parser` | 1.4.7 | reads the `tas_token` cookie (unsigned) |
| `cors` | 2.8.6 | allowlist from `FRONTEND_URL`, `credentials: true` |
| `express-rate-limit` | 8.7.1 | login and write limiters (peer `express >= 4.11`, works with Express 5.3.0) |
| `@types/cookie-parser` (dev) | 1.4.10 | types |
| `@types/cors` (dev) | 2.8.19 | types |

All were the npm `latest` versions (`npm view <pkg> version`) at install time. Installed with `pnpm --filter api add -E …`.

## Commands

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter api add -E jose@6.2.12 cookie-parser@1.4.7 cors@2.8.6 express-rate-limit@8.7.1` and `add -E -D @types/cookie-parser@1.4.10 @types/cors@2.8.19` | `exit1=0`, `exit2=0` (run with `PRISMA_ENGINES_MIRROR=https://r2.prisma.sh`) |
| 2 | `pnpm install --frozen-lockfile` | `Lockfile is up to date` … `Done in 3.1s`, `exit=0` |
| 3 | `pnpm -r typecheck` | shared, api, web: `Done`, `exit=0` |
| 4 | `pnpm -r lint` | shared, api, web: `Done`, `exit=0` |
| 5 | `pnpm -r build` | shared `tsc`, api `prisma generate && tsc`, web `next build` (routes `/`, `/_not-found`): `exit=0` |
| 6 | `pnpm format:check` | `All matched files use Prettier code style!`, `exit=0` |
| 7 | `pnpm --filter api exec vitest run --reporter=verbose` | `Test Files 7 passed (7)`, `Tests 58 passed (58)`, `exit=0` (16 Phase 2 tests + 42 new) |

## Test list (new in Phase 3)

`test/auth.test.ts` (16)
- login: 200 safe DTO `{id,name,email,role}`; email normalized (`'  Employee@Test.Local '`); `Set-Cookie` has `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800`, no `Secure`; token not in body; no `passwordHash`/bcrypt hash in body
- login with `NODE_ENV=production` config (`createApp({ env: { ...getEnv(), NODE_ENV: 'production' } })`) → cookie has `Secure`
- wrong password and unknown email → both 401 with identical body `INVALID_CREDENTIALS`, no cookie
- invalid body → 400 `VALIDATION_ERROR` with `details` for `email` and `password`; extra `role` field → 400 (strict schema)
- `/auth/me`: valid cookie → 200; no cookie → 401; tampered payload (role swapped to ADMIN, original signature) → 401 and cookie cleared; other secret → 401; `alg: none` → 401; expired → 401; no `exp` → 401; deleted user and unknown `sub` → 401; employee token claiming ADMIN → 200 with `role: EMPLOYEE` (role from DB)
- logout → 204, empty body, `tas_token=;` with `Expires=Thu, 01 Jan 1970 00:00:00 GMT`, `HttpOnly`, `SameSite=Lax`, `Path=/`; logout without cookie → 204

`test/security.test.ts` (14)
- CSRF: foreign `Origin` → 403 `CSRF_REJECTED` (no cookie set); allowed `Origin` → 200; `Sec-Fetch-Site: cross-site` (no Origin) → 403; `same-site` (no Origin) → 403; `Origin: null` → 403; logout with foreign Origin → 403; GET with foreign Origin → 200
- non-JSON body (form-urlencoded, `text/plain`) → 415 `UNSUPPORTED_MEDIA_TYPE`
- CORS preflight from allowed origin → 204, `Access-Control-Allow-Origin` = that origin, `Access-Control-Allow-Credentials: true`; foreign origin → no ACAO
- rate limits: login limit 3 → 4th attempt 429 `RATE_LIMITED` (also for the correct password); limit keyed by email (another account still logs in); write limiter 2 → 3rd POST 429, GETs not counted
- JSON body > 100kb → 413 `PAYLOAD_TOO_LARGE`

`test/users.test.ts` (3): `GET /users` no cookie → 401; employee → 403 `FORBIDDEN`; admin → 200 `{ data: [...] }` employees only, ordered by name, no hashes.

`test/task-access.test.ts` (6, real test DB): employee1 loads own task; employee1 → 404 for employee2's task (and vice versa); soft-deleted task → 404 for employee and admin; unknown id → 404; admin loads any non-deleted task; `visibleTasksWhere` returns `{deletedAt:null, assignedToId}` / `{deletedAt:null}` and `findMany` with it returns only the scoped rows.

`test/env.test.ts` (+3): `NODE_ENV` missing → `['NODE_ENV: is missing']`; `TRUST_PROXY` defaults to 0, accepts `1`, rejects `yes`; `FRONTEND_URL` entries normalized to bare origins.

## Manual D1 proxy check

Setup: `apps/api` built API started with `node dist/server.js` (port 4000, `apps/api/.env`, dev DB with the Phase 2 seed); `apps/web` started with `next start -p 3000` (built in command 5, rewrite `/api/v1/*` → `http://localhost:4000`). All requests below went to `http://localhost:3000`. Token values are redacted in the log.

| # | Request (via :3000) | Result |
|---|---|---|
| 1 | `POST /api/v1/auth/login`, `Origin: http://localhost:3000`, admin@demo.com | `HTTP/1.1 200 OK`; `set-cookie: tas_token=<redacted>; Max-Age=28800; Path=/; Expires=…; HttpOnly; SameSite=Lax` arrived through the proxy; `access-control-allow-origin: http://localhost:3000`; body `{"id":"…","name":"Alex Admin","email":"admin@demo.com","role":"ADMIN"}`; curl cookie jar holds `tas_token` |
| 2 | `GET /api/v1/auth/me` with that cookie | `HTTP/1.1 200 OK`, same DTO, `cache-control: no-store` |
| 3 | `GET /api/v1/auth/me` without cookie | `HTTP/1.1 401 Unauthorized` `{"error":{"code":"UNAUTHENTICATED","message":"Authentication required"}}` |
| 4 | `POST /api/v1/auth/login`, `Origin: https://evil.example` | `HTTP/1.1 403 Forbidden` `{"error":{"code":"CSRF_REJECTED","message":"Cross-site request rejected"}}` (so the proxy forwards `Origin` unchanged) |
| 5 | `GET /api/v1/users` with the admin cookie | `HTTP/1.1 200 OK` `{"data":[Jordan Lee employee1@demo.com, Priya Patel employee2@demo.com]}`, no hashes |
| 6 | `POST /api/v1/auth/logout`, allowed Origin | `HTTP/1.1 204 No Content`; `set-cookie: tas_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax` |

Both servers were then sent SIGTERM: API log `[api] SIGTERM received, shutting down`; `kill -0` → both gone; `lsof -iTCP:3000 -iTCP:4000 -sTCP:LISTEN` → no listeners.

Observation for Phase 7: behind the Next.js proxy, Express sees the proxy's address as `req.ip` (`TRUST_PROXY=0`), so the per-IP part of the rate-limit keys is the proxy's IP locally. `TRUST_PROXY` must be tuned for the real host chain.

## Notes

- The IDE's on-save "organize imports" re-sorted imports in a few edited files (e.g. `packages/shared/src/index.ts` export order, `server.ts` import order). This has no runtime effect; Prettier was run afterwards and `format:check` passes.
- Local `apps/api/.env` and `.env.test` already had `NODE_ENV` (`development` / `test`); `TRUST_PROXY=0` was appended to both. No secret values were printed.
