# Employee screens and shared task-detail components (Phase 5, chunk C)

Chunk C adds the employee side of the app and finishes the shared task detail page for both roles. Employees get `/employee` (their own summary counts plus the assigned-task list, with status/priority/sort filters in the URL) and `/employee/tasks/[id]`, which reuses the admin `TaskDetailView`. Three new sections plug into that view for both roles: the rejection feedback alert, the comments thread with an add form, and the status history timeline. `TaskActions` now offers Start and "Submit for approval" to employees, filtered through the shared workflow helper and a second role allowlist. The e2e evidence covers the full create → start → submit → reject → comment → resubmit → approve cycle across two browser contexts, plus scope, overdue, filter and stale-action checks.

Watch for: a hidden `q`/`assignedToId` URL filter on the employee list (confirmed, minor). There are no blocking functional, security or accessibility defects.

**Verdict**: APPROVED

## High-level view

Both roles use one `TaskDetailView`. Its three default slots hold the feedback alert, comments and history, and the two role pages change only the back link. The alert title follows the viewer's role ("Admin feedback" or "Returned with feedback").

Employee controls are gated twice. The shared `getAvailableActions` decides which buttons appear. For non-admins the result is also filtered to `start`/`submit`, and Edit and Delete render only behind `user.role === ADMIN`. The employee list has no row actions, search, employee filter or assignee column. `expectNoAdminControls` checks all of this with exact-name matching.

Another employee's task (404) and a malformed id (400 `VALIDATION_ERROR`) both render `TaskNotFound` with its own h1. That happens before the comments and history queries start.

On a stale action (409 or 404), the UI toasts the API's message and refetches the whole detail-key prefix, which includes comments and history. Comment-add errors that aren't field errors use the same path.

The overdue logic and the dates helpers meet P13. The overdue e2e runs under `Pacific/Honolulu`.

<details>
<summary>Issues (2)</summary>

1. **Hidden URL filters on the employee list** — `/employee?q=…` or `?assignedToId=…` silently narrows the list with no visible control, and the empty state says "Try a different search". Drop the keys whose controls are hidden (or make the empty-state copy match the visible controls). Non-blocking.
2. **Comment 404 path untested** — the add-comment 404 (task deleted or reassigned mid-edit) → toast + refetch → "Task not found" path has no e2e. Add a case in chunk D. Non-blocking.

</details>

<details>
<summary>Details</summary>

### Role gating in `TaskActions`

```
availableActions(task, user)          // shared state machine + assignee check
  .filter(a => isAdmin || a ∈ {start, submit})
isAdmin && status !== COMPLETED → Edit link
isAdmin → Delete button + DeleteTaskDialog
```

Every workflow button, the reject trigger and Delete are disabled while `transition.isPending` is true. `onSuccess` returns the invalidation promise, so the buttons stay disabled until lists, summary and history have refetched.

### Employee list and URL state

The employee Overdue card shows the API's UTC-based count, while row badges use the viewer's local date. Plan §3 item 2 accepts this split.

`parseListParams` is shared and still accepts `q` and `assignedToId` on the employee route (**confirmed**: `use-task-list-params.ts` parses every whitelisted key, and `TaskListSection` forwards `params` regardless of `showSearch`/`showEmployeeFilter`). The API ANDs the caller's scope into the query, so this can't leak data. The UX effect is that a bookmarked or hand-edited `/employee?q=foo` filters rows with no visible search box. `filtered` turns true, so the "No tasks match these filters" state appears with copy that mentions a search. "Clear filters" does recover it. The cleanest fix is to strip `q`/`assignedToId` in `TaskListSection` when their controls are hidden.

### Feedback alert, comments and history

When a comment can't be posted because the task was deleted or reassigned away from the employee, the API returns 404. `reportTaskError` then shows a toast and refetches the detail, which switches the page to "Task not found". Not tested: that 404 path. The coder lists it as a known gap.

### Verification evidence

`docs/phase5-verification.md` (chunk C) records exit 0 for shared build, web typecheck, lint, unit tests (61/61), build with `API_URL` and `format:check`. `CI=1 pnpm test:e2e` ran 40/40, including the 8 employee.spec tests and the workflow.spec cycle, and the ports were confirmed closed afterwards. The plan asked for an assertion on the seeded past-due task. The spec creates its own past-due task instead, so it doesn't depend on seed age. I didn't re-run any suite because the evidence left no specific doubt.

### Security invariants

All four invariants hold. Client code uses only relative `/api/v1` paths. `apps/web/src` has no `localStorage`, `sessionStorage` or `dangerouslySetInnerHTML`. The only `document.cookie` write is shadcn's `sidebar_state` UI cookie. The only `localhost` is the dev fallback in the `server-only` `lib/api/server.ts`, and `.next/static` has none. The `dashboard.summary` key isn't scoped per user. That is safe only because logout calls `queryClient.clear()` and does a full navigation, so keep that in place.

</details>

<details>
<summary>Files changed (chunk C)</summary>

- `src/features/tasks/components/task-actions.tsx`: employee Start/Submit, role allowlist on top of the shared helper
- `src/features/tasks/components/task-feedback-alert.tsx`: new role-worded rejection feedback alert
- `src/features/tasks/components/task-comments.tsx`: thread + add form wired in; non-field errors via `reportTaskError`
- `src/features/tasks/components/task-history.tsx`: timeline with sr-only transitions and highlighted reasons
- `src/features/tasks/components/task-detail-view.tsx`: default slots for alert, comments, history
- `src/features/tasks/components/employee-task-list.tsx`: new employee list wrapper
- `src/features/dashboard/components/summary-cards.tsx`: `scope="own"` variant
- `src/features/tasks/lib/paths.ts`: `EMPLOYEE_HOME_PATH`, `employeeTaskHref`
- `src/app/(app)/employee/page.tsx`, `src/app/(app)/employee/tasks/[id]/page.tsx`: employee pages
- `e2e/workflow.spec.ts`, `e2e/employee.spec.ts`, `e2e/helpers.ts`: new specs and helpers
- `docs/phase5-verification.md`, `docs/IMPLEMENTATION_CHECKLIST.md`: chunk C evidence

Full diff: `git diff` plus untracked files under `apps/web` (uncommitted working tree on the current branch).

</details>
