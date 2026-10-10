# Cookie-based JWT auth, CSRF guard and task ownership policy for the API

Phase 3 adds login, logout and current-user endpoints to the Express API, backed by an HS256 JWT (`jose`) carried only in an httpOnly `tas_token` cookie. Every protected request re-verifies the token and reloads the user from MySQL, so identity and role always come from the database. Around that sit an Origin / `Sec-Fetch-Site` CSRF guard with a JSON-only body rule, a credentialed CORS allowlist, per-app rate limiters, an admin-only `GET /users`, and a task-scoping policy module for Phase 4 to load tasks through. `NODE_ENV` is now required (closing Phase 2 review #4). I re-ran `pnpm -r typecheck` (exit 0) and `pnpm --filter api test` (7 files, 58/58 passed) against the healthy `task-approval-mysql` container, and both match `docs/phase3-verification.md`. Every Phase 3 checklist tick cites a test or manual check that exists. The ownership tick covers the helper only, not an HTTP route.

Watch for: with the default `TRUST_PROXY=0` behind the Next.js proxy, every rate-limit key collapses to the proxy's IP. That makes the login limiter email-only, so anyone can lock any account out, and turns the write limiter into one global bucket (confirmed; deferred to Phase 7 but missing from the Phase 7 checklist). The login limiter also has no per-IP ceiling, so rotating emails gets around it (confirmed). Neither is blocking for a backend phase that isn't deployed yet.

**Verdict**: APPROVED

## High-level view

`verifyAccessToken` pins `algorithms: ['HS256']` and requires `sub` and `exp`. `authenticate` ignores the token's `role` claim and uses the role from the user it reloads by `sub`. Every failure gives a 401 and clears the cookie. The cookie's `Max-Age` and the JWT `exp` both come from `JWT_EXPIRES_IN`. `Secure` depends on `NODE_ENV=production`, and since that variable is now required, the flag can't be dropped silently.

Unknown-email and wrong-password logins give the same 401 `INVALID_CREDENTIALS`, and a missing user is compared against a cost-12 dummy hash. I measured the two paths at 289 ms and 292 ms. That balance depends on the dummy hash's cost matching the seed's separately hard-coded `BCRYPT_COST`, and Phase 4's `POST /users` will add a third hashing site.

The CSRF guard, the JSON-only rule (415, documented in ARCHITECTURE §14) and the write limiter run app-wide, ahead of any router. So the documented 401 → 403 → 400 → 404 → 409 order is really preceded by 403/415/413/429 transport checks, and the docs don't say so yet.

Both limiters depend entirely on `req.ip` being the real client. That isn't true behind the D1 proxy until `TRUST_PROXY` is tuned, and the login limiter has no IP-only ceiling.

`task-access.ts` puts scope into the Prisma `where` clause. Any role other than ADMIN is restricted to `assignedToId`, so it fails closed. Missing, deleted and foreign tasks all give one 404. No route uses it yet, so ownership at the HTTP level is still Phase 4 work.

<details>
<summary>Issues (5)</summary>

1. **Rate-limit keys collapse behind the proxy** (confirmed, non-blocking): with `TRUST_PROXY=0` behind Next.js, the login key is effectively email-only, which lets anyone lock any account out, and the write limiter is one bucket for all users. Add a Phase 7 checklist item to set `TRUST_PROXY` to the real hop count and verify `req.ip`, without over-trusting a spoofable `X-Forwarded-For`, on the deployed chain.
2. **No per-IP login ceiling** (confirmed, non-blocking): rotating the email gives each attempt a fresh login-limiter key, so one IP can spray passwords at the write limiter's 300 per 15 minutes. Stack a coarse IP-only login limiter (for example 50 per 15 minutes) in front of the IP+email one, or document the trade-off.
3. **Check order omits pre-auth guards** (confirmed, non-blocking): CSRF 403, 415, 413 and the write limiter's 429 fire before `authenticate`'s 401, which ARCHITECTURE §7 doesn't reflect. Document the transport guards ahead of the 401 → 409 chain before Phase 4 writes its ordering tests and `docs/API.md`.
4. **Bcrypt cost duplicated** (confirmed, non-blocking): `DUMMY_HASH` in `lib/password.ts` and `BCRYPT_COST` in `prisma/seed.ts` are separate cost-12 literals. Export one cost constant and use it for the seed, `POST /users` and the dummy hash, so timing parity can't drift.
5. **Ownership not enforced over HTTP yet** (confirmed, non-blocking): `findTaskInScope` and `visibleTasksWhere` are tested only by direct calls. In Phase 4, load every task through them (passing `tx` inside transitions) and add route-level tests: employee → 404 on another employee's task, employee → 403 on approve/reject.

</details>

<details>
<summary>Details</summary>

### Rate-limit keys behind the Next.js proxy

Under D1, the browser talks only to the Next.js origin, which rewrites `/api/v1/*` to Express. With `TRUST_PROXY=0`, the default and the value in both local env files, `req.ip` is the proxy's address for every user, as the verification doc records. Its effect on the two limiters is worse than "per-IP is coarse" (confirmed from `middleware/rate-limit.ts` and `app.ts`):

```
browser A ─┐
browser B ─┼─► Next.js (one IP) ─► Express  req.ip = proxy
attacker  ─┘
login key  = `${proxyIp}|${email}`   → effectively email-only
write key  = proxyIp                 → one bucket for the whole user base
```

Ten failed logins for `admin@demo.com` from anywhere lock the real admin out for 15 minutes. That's a targeted lockout anyone can trigger, and the correct password is refused too, as `security.test.ts` asserts. The 300-writes-per-15-minutes write limit becomes a ceiling for all users combined. The fix is to set `TRUST_PROXY` to the real hop count and confirm `req.ip` on the deployed chain. Setting the count too high is just as bad: clients could then spoof `X-Forwarded-For` and pick their own bucket. The Phase 7 checklist has "Cookie and CSRF checked through the proxy" but no `TRUST_PROXY` / `req.ip` item, so the only record of this is a note in `phase3-verification.md`.

The login limiter has no per-IP ceiling either (confirmed). Changing the email on each attempt gives each attempt a new key. A single IP can then spray one password across many accounts at the write limiter's rate of 300 per 15 minutes.

### Pre-auth transport guards and the documented check order

In `app.ts`, CORS, `csrfProtection` (403 `CSRF_REJECTED` / 415), `express.json` (413 / 400 `INVALID_JSON`) and the `/api/v1` write limiter (429) all run before any router's `authenticate` (confirmed). Two examples: an unauthenticated `text/plain` POST to a future admin route gets 415, not 401, and a cookie-less POST with a foreign Origin gets 403, not 401. Rejecting cross-site requests before body parsing and DB work is deliberate, but ARCHITECTURE §7 presents the order as starting at authenticate (401).

### Bcrypt cost coupling for login timing

If the dummy hash's cost and the real hashes' cost drift apart, unknown-email logins become measurably faster or slower than wrong-password logins (confirmed: two separate cost-12 literals today). No test would catch it, because `test/helpers/auth.ts` hashes at cost 4.

### Test coverage

Not tested: ownership through HTTP (`findTaskInScope` is only called directly); the 401 → 403 → 400 ordering on a route that has all three, since none exists yet; PUT/PATCH/DELETE through the CSRF guard; login timing parity, which I checked by hand above.

</details>

<details>
<summary>File map</summary>

- `apps/api/src/lib/jwt.ts`: HS256 sign/verify via `jose`, duration parser
- `apps/api/src/lib/auth-cookie.ts`: `tas_token` set/clear with shared attributes
- `apps/api/src/lib/password.ts`: bcrypt compare with cost-12 dummy hash
- `apps/api/src/middleware/authenticate.ts`: cookie → verify → DB reload → `req.user`
- `apps/api/src/middleware/require-role.ts`: 401/403 role gate
- `apps/api/src/middleware/csrf.ts`: Origin / Sec-Fetch-Site check, JSON-only bodies (415)
- `apps/api/src/middleware/rate-limit.ts`: login (IP+email) and write (IP) limiters
- `apps/api/src/middleware/validate.ts`: Zod body validation
- `apps/api/src/controllers/auth.controller.ts`, `routes/auth.routes.ts`: login / logout / me
- `apps/api/src/controllers/users.controller.ts`, `routes/users.routes.ts`, `services/users.service.ts`: admin `GET /users`, safe DTO select
- `apps/api/src/services/auth.service.ts`: credential check, identical 401
- `apps/api/src/services/task-access.ts`: query-level task scope, 404 helper
- `apps/api/src/types/express.d.ts`, `packages/shared/src/types.ts`: `req.user`, `UserDto`
- `apps/api/src/app.ts`: CORS, CSRF, cookie-parser, trust proxy, limiters, routers
- `apps/api/src/config/env.ts`, `prisma/seed.ts`, `.env.example`: `NODE_ENV` required, `TRUST_PROXY`, origin normalization
- `apps/api/src/errors/app-error.ts`: new codes and helpers
- `apps/api/src/server.ts`, `packages/shared/src/index.ts`: env passed to `createApp`; IDE import/export reordering (no runtime effect)
- `apps/api/test/{auth,security,users,task-access}.test.ts`, `test/helpers/auth.ts`, `test/env.test.ts`: 42 new tests
- `apps/api/package.json`, `pnpm-lock.yaml`: `jose`, `cookie-parser`, `cors`, `express-rate-limit` and types, pinned; `eslint-plugin-import` snapshot key churn
- `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_CHECKLIST.md`, `docs/phase3-verification.md`: Phase 3 notes, ticks, evidence

Full diff: `git diff HEAD` plus untracked files listed by `git status`.

</details>
