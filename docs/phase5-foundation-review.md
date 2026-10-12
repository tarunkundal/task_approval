# Phase 5 chunk A: web foundation (API client, session guards, login, app shell)

This is the third pass on chunk A, which lays the frontend foundation for the admin and employee screens. A relative-path browser API client goes through the Next.js `/api/v1` rewrite, so the httpOnly `tas_token` cookie stays first-party. A `server-only` module validates the session with `GET /auth/me`. A Next 16 `proxy.ts` does a cookie-presence pre-check, and the `(app)` layouts handle the authoritative session and role redirects. The chunk also adds the shared-schema login form, a shadcn sidebar shell, TanStack Query plumbing, loading/empty/error primitives and a Playwright harness against the guarded test DB. All three findings from the previous pass are fixed. Both error boundaries now use Next's `retry`, `afterTaskUpdated` refreshes the dashboard summary, and the `(app)` boundary has an `<h1>`.

On this pass I re-ran `web typecheck`, `lint` and `build` (`API_URL=http://localhost:4000`). All three exited 0, and the build lists `ƒ Proxy (Middleware)`. A grep of `.next/static` for `localhost:4000|4100` found nothing. `src/` has no `localStorage`, `sessionStorage` or `dangerouslySetInnerHTML`, and the only `document.cookie` write is shadcn's non-sensitive `sidebar_state`. `@/lib/api/server` is imported only by the five server files.

Watch for: the error boundaries' Retry has not been exercised in a browser against an API-down render (confirmed gap, acknowledged in the verification doc). The chunk D specs should cover it.

**Verdict**: APPROVED

## High-level view

The client's full-page jump to `/login?next=` fires only for a 401 `UNAUTHENTICATED`. Login's own `INVALID_CREDENTIALS` therefore stays an inline form error. Non-standard error bodies, such as the rewrite's non-JSON 500 when the API is down, become `HTTP_ERROR` instead of crashing the parser.

Session gating has three layers, and the API is the authority. The proxy only checks cookie presence and never redirects `/login`, so a stale cookie can't loop. `(app)/layout.tsx` validates with `/auth/me` once per request through React `cache()`, and the section layouts send a wrong role to its own home. Every `?next=` value, including the proxy-forwarded `x-pathname`, goes through `safeReturnPath`.

Errors in `getCurrentUser()` (API down, 5xx) during the `(app)` layout or login render land on the root boundary. Errors inside the shell land on the `(app)` boundary. Both now call `retry()`, which the bundled Next 16.4 docs describe as re-fetching and re-rendering. Whether that actually recovers once the API comes back is still untested.

The query-key factory and the `query-invalidation.ts` helpers now match plan P10, including the summary refresh after an edit. Nothing calls them yet, so their real verification comes with the chunk B mutations.

<details>
<summary>Issues (1)</summary>

1. **Boundary Retry unverified in a browser** (non-blocking) — the `retry` fix is confirmed against Next's docs and types but not exercised end to end. Add a chunk D e2e or a manual check: stop the API, load `/admin`, restart the API, click Retry, and confirm the shell renders.

</details>

<details>
<summary>Details</summary>

### Boundary placement and the untested Retry path

`next/dist/client/components/error-boundary.d.ts` declares the `retry: () => void` that both boundaries now use, and the bundled `error.md` marks it stable as of 16.3.0. The installed Next is 16.4.0. `(app)/error.tsx` sits at the `(app)` segment, so it doesn't catch errors thrown by `(app)/layout.tsx` itself. A failing `requireUser()`, the main real-world error, therefore falls through to the root boundary. That is the path where Retry has to re-run the `/auth/me` fetch, and no test exercises it yet.

### Test coverage

According to `phase5-verification.md`, the unit tests cover the client's request and error contract, the open-redirect guard, timezone-safe dates and form-error mapping (50 tests). The 17 e2e tests cover the return-path redirect, the stale-cookie case, both role redirects, login errors, `?next=`, logout and the mobile sheet. The e2e build on port 4100 also shows the bundle has no default-port assumption. The fix iteration re-ran typecheck, lint, unit tests, build and `format:check`. It did not re-run e2e. Neither the boundaries nor the invalidation helpers are on an e2e path.

Not tested: boundary Retry recovery (above); any toast (none fires on the chunk A paths, so this moves to chunk B); keyboard-only operation of the account menu and sidebar. Radix primitives make the keyboard behaviour likely fine, but the chunk D axe/keyboard specs need to cover it.

</details>

<details>
<summary>File map</summary>

- `apps/web/src/lib/api/client.ts`, `errors.ts`: relative `/api/v1` fetch wrapper, `ApiError` parsing, 401 → login redirect.
- `apps/web/src/lib/api/server.ts`: `server-only` `getApiBaseUrl`, cached `getCurrentUser`, `requireUser`, `requireRole`.
- `apps/web/src/proxy.ts`, `src/lib/auth-redirect.ts`: cookie-presence gate, `x-pathname` forwarding.
- `apps/web/src/lib/routes.ts`: `homeFor`, `safeReturnPath`, `loginPath`.
- `apps/web/src/lib/{query-client,query-keys,query-invalidation,form-errors,dates,labels,workflow}.ts`, `src/hooks/*`: Query defaults, key factory, cache effects (summary now refreshed on edit), RHF error mapping, date helpers, workflow adapter, debounce and `useIsMobile`.
- `apps/web/src/features/auth/**`: auth API, login/logout hooks, login form, current-user context.
- `apps/web/src/app/{layout,page,error,not-found}.tsx`, `(auth)/login/page.tsx`, `(app)/{layout,error}.tsx`, `(app)/{admin,employee}/{layout,page}.tsx`: providers, root redirect, guards, placeholders, boundaries (now `retry`, `(app)` sr-only `<h1>`).
- `apps/web/src/components/layout/*`, `components/common/*`, `components/providers.tsx`: sidebar shell, header, user menu, skip link; error/empty/loading/page-header primitives.
- `apps/web/src/components/ui/*` (18 new), `src/hooks/use-mobile.ts`: shadcn components (`cn` import fixed, sonner light-only, React Compiler lint fixes).
- `apps/web/e2e/*`, `playwright.config.mts`, `vitest.config.mts`: test-DB guard, migrate+seed, auth setup and spec; unit test config.
- `apps/web/{package.json,next.config.ts,eslint.config.mjs,tsconfig.json}`, root `package.json`, `.gitignore`, `.prettierignore`, `pnpm-lock.yaml`: exact-pinned deps, scripts, `distDir` override, ignores (incl. `e2e/.auth` storage states).
- `docs/phase5-plan.md`, `docs/phase5-verification.md`: P10 edit line corrected; evidence for the review-fix iteration.

Full diff: `git diff 22750d8` plus the untracked files under `apps/web`.

</details>
