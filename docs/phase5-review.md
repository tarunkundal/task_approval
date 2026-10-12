# Accessibility, polish, screenshots and full e2e for the Phase 5 frontend

Chunk D finishes the Phase 5 frontend. It adds an axe-core WCAG 2.0/2.1 A+AA scan of every main screen with no rule or selector exclusions, keyboard-only tests for the skip link, login form, reject dialog, Status select and account menu, a 390 px responsive spec, and a browser test for the error-boundary Retry follow-up from chunk A. A screenshot spec writes 10 PNGs to `docs/screenshots/phase5/`. The only product change is the dashboard card grid (`2xl:grid-cols-6`), which fixes wrapped labels at 1280 px. The recorded evidence is complete: web unit 61/61, API 201/201, e2e 80/80, and every `pnpm -r` typecheck/lint/build plus `format:check` exits 0. All four security invariants hold, and I re-ran the `.next/static` grep myself.

Watch for: the screenshot spec runs inside every `pnpm test:e2e` and rewrites the tracked PNGs (confirmed). Two screenshots show leftover e2e test data (confirmed). On the 390 px dashboard, Approve/Reject in the approval queue sit off-screen inside the scrolling table (confirmed). None of these block.

**Verdict**: APPROVED

## High-level view

The a11y spec is strict where it counts. It scans every page in the plan, plus dialog-open, inline-error, delete-alertdialog, not-found and mobile-sheet states. It asserts one `<h1>` and a `… · Task & Approval` title on each page, and a planted unlabelled input shows the harness actually reports violations. `settle()` waits for skeletons and finite animations to finish, so axe scans the final DOM, not a loading frame. The keyboard tests cover every interaction in D1. The Status select test starts from `.focus()` instead of tabbing to the control, which is a small gap in an otherwise complete set.

The chunk A error-boundary follow-up is now checked in a real browser. A second `next start` of the e2e build has its runtime `API_URL` pointed at a port with nothing listening, so `/admin` renders the root boundary. Then an API starts on that port behind the same `_test` DB guard, and Retry renders the dashboard on the same URL.

None of the 10 images has overlap, clipped content or broken layout, and badge contrast reads well. Two issues remain with the deliverable. The PNGs are regenerated as a side effect of the normal e2e suite. And the employee dashboard and employees screenshots show `E2E 1791…` tasks and `e2e-…@demo.com` accounts left by earlier runs.

The security posture is unchanged and verified. The client uses relative `/api/v1` paths only. There's no `localStorage`/`sessionStorage`/`dangerouslySetInnerHTML`, and the only `document.cookie` write is shadcn's `sidebar_state`. `server.ts` imports `server-only`, and the only server-side `localhost` is its dev fallback. The `.next/static` and `.next-e2e/static` greps for `localhost:4000|4100|4101` find no matches. Role separation is tested end to end by `expectNoAdminControls`, the cross-employee "Task not found" tests in both directions, and the employee→admin route redirects.

<details>
<summary>Issues (5)</summary>

1. **Screenshot spec runs in the default e2e suite** — `screenshots.spec.ts` matches the `chromium` project's `.*\.spec\.ts`, so every `pnpm test:e2e` (including CI) rewrites 10 tracked PNGs in `docs/`. Gate it behind an env var (e.g. `SCREENSHOTS=1` with `test.skip`) or a separate Playwright project and a `pnpm screenshots` script.
2. **E2E noise in submission screenshots** — `employee-dashboard.png` shows seven `E2E 1791…` rows and `admin-employees.png` shows four `e2e-…@demo.com` accounts. Before the final submission, re-capture against a freshly reset and seeded test DB, or run the screenshot spec first, so the images show only the seed and the Northwind demo data.
3. **Approval actions off-screen on mobile** — in `mobile-admin-dashboard.png` the approval queue's Review column (Approve/Reject) is past the right edge of the scroll container, with no visible scroll cue. Consider stacking the review buttons under the title on small screens, or linking queue rows to the detail page where the actions fit (`responsive.spec` already checks this).
4. **Manual dev-DB walkthrough not done** — plan D4's click-through on :3000 against the dev DB wasn't performed. The verification doc and checklist say so. Do it in Phase 6, where "Manual end-to-end" is still open.
5. **Status select reached by `.focus()`, not Tab** (likely reachable, not asserted) — the a11y keyboard test focuses the trigger programmatically. Tab to it from the search box so the test also proves it's reachable.

</details>

<details>
<summary>Details</summary>

### Status select reachability gap in the keyboard set

`a11y.spec.ts` calls neither `exclude()` nor `disableRules()`, so no exclusions need recording. In the keyboard set, the Status select test calls `status.focus()` before ArrowDown. That proves the open, move and choose steps work from the keyboard, but it doesn't prove the control is reachable by Tab (likely reachable, since it's a native-focusable Radix trigger with a passing focus-ring check, but this isn't asserted). Tabbing from the search box to the trigger would close the gap.

### Error-boundary Retry in a real browser

```
browser ──/admin──▶ next start :3101 (.next-e2e)
                     ├─ server render: requireUser → API_URL=:4101  (down → root error.tsx)
                     └─ /api/v1 rewrite → :4100 (shared e2e API, baked in at build)
spec starts e2e/start-api.mjs :4101 (loadTestEnv guard, NODE_ENV=test)
Retry ──▶ server render succeeds → header "Alex Admin", Dashboard h1, numeric Total
```

The test only works because the runtime `API_URL` (used by the server-only fetch) and the build-time rewrite are separate settings. The spec relies on that split on purpose and documents it. A layout-level failure goes to the root `error.tsx`, not `(app)/error.tsx`, and the assertions check for that (no app header in the error state).

### Screenshot data and mobile approval queue

I opened all 10 PNGs. `login`, `admin-tasks`, `admin-task-detail`, `admin-reject-dialog`, `employee-task-feedback`, `mobile-nav` and the fixed 3×2 `admin-dashboard` have no visual defects. The two data-quality issues are in `employee-dashboard.png` (rows like "E2E 1791792478713 mobile with a fairly long title…", "…stale", "…not-yours") and `admin-employees.png` (two "E2E Assignee" and two "E2E Employee" accounts). The cause is confirmed: the screenshot spec only removes its own `Northwind` tasks, and it runs alphabetically after the a11y, admin, auth and employee specs, which leave their data in the shared test DB.

In `mobile-admin-dashboard.png`, the approval queue shows Task, Assignee and a clipped Priority badge. Approve/Reject need a horizontal scroll inside the table container, and nothing on screen signals that. The page itself doesn't overflow, which is what the plan asked for, so this is a UX refinement, not a defect.

The spec writes into `docs/` on every run because `playwright.config.mts` has a single `chromium` project matching all `*.spec.ts` (confirmed). The PNGs are tracked (`docs/screenshots` isn't in `.gitignore`), so routine e2e runs create binary diffs, and the dashboard counts in the images drift with whatever the test DB holds.

</details>

<details>
<summary>File map</summary>

- `apps/web/e2e/a11y.spec.ts` — axe WCAG A/AA scans (19 tests), h1/title checks, harness check, keyboard tests
- `apps/web/e2e/responsive.spec.ts` — 390×844 no-overflow, table container scroll, sheet nav, detail readability
- `apps/web/e2e/error-boundary.spec.ts` — Retry recovery with a second web server and a late-started API
- `apps/web/e2e/start-api.mjs` — guarded test-env API launcher for the error-boundary spec
- `apps/web/e2e/screenshots.spec.ts` — Northwind demo data and 10 full-page captures
- `apps/web/e2e/helpers.ts` — `settle()`, `startAndSubmit()`
- `apps/web/e2e/{auth,admin,employee,workflow}.spec.ts` — login error toasts, delete from detail, cross-employee access, comment on a deleted task, URL-filter step
- `apps/web/src/features/dashboard/components/summary-cards.tsx` — grid breakpoint `xl` → `2xl`
- `apps/web/package.json`, `pnpm-lock.yaml` — `@axe-core/playwright` 4.13.0 (exact)
- `docs/screenshots/phase5/*.png` — 10 screenshots
- `docs/phase5-verification.md`, `docs/IMPLEMENTATION_CHECKLIST.md`, `docs/ARCHITECTURE.md` — chunk D evidence and Phase 5 notes

Full diff: all web code is untracked on `main` relative to `22750d8`. Use `git status --porcelain apps/web docs` to see the scope.

</details>
