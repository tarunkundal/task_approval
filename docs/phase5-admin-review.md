# Admin screens for the Task & Approval web app (Phase 5, chunk B)

This chunk adds the admin side of the Next.js app: the dashboard (six counts, approval queue, recent tasks), the URL-driven task list, create and edit forms, the task detail page with Approve and Reject, delete confirmation, and the Employees page. All data is fetched client-side with TanStack Query against relative `/api/v1` paths. Forms validate with the shared Zod schemas, and each mutation's cache effect lives in `lib/query-invalidation.ts`. The work matches plan items B1–B8. The recorded evidence supports the claimed behaviour: typecheck, lint, 61/61 unit tests, build, format, and 31/31 Playwright tests, including a Honolulu-timezone date check and a stale-approve 409.

Watch for: the task form can fail silently on a `VALIDATION_ERROR` that has no `details` (confirmed, rare in practice). The 400-details → field-error path and the edit-save `TASK_COMPLETED` race have no browser coverage (confirmed; the coder disclosed both). The Assignee label points at nothing while employees are loading, failed or empty (confirmed, minor). None of these block the chunk.

**Verdict**: APPROVED

## High-level view

The admin section is a set of client components under `features/{tasks,users,dashboard}`, mounted by thin server pages behind `requireRole('ADMIN')`. The only server-side fetch is still `/auth/me`. All four security invariants hold:

- No `localStorage`, `sessionStorage` or `dangerouslySetInnerHTML`. The only JS-written cookie is the non-sensitive `sidebar_state`.
- `@/lib/api/server` is imported only by server files.
- The only `localhost` in `src/` is the dev fallback in `server.ts`.
- The recorded grep shows no `localhost:4000`/`4100` in `.next/static`.

List state lives in the URL and is validated key-by-key against the shared strict query schema, so a hand-edited URL can't produce a 400. Filters replace the history entry and reset to page 1, pagination pushes a new entry, and search is debounced 300 ms.

Create and edit share one `TaskForm` on `createTaskSchema`. Edit sends only dirty fields, and Save stays disabled until something changes. The date input's `YYYY-MM-DD` value goes to the API untouched and is displayed without `new Date(string)`. The Honolulu e2e test proves there's no day shift. The error path has one gap: a detail-less `VALIDATION_ERROR` is neither mapped to a field nor toasted.

Mutations follow plan P10, including summary invalidation on create, edit and delete. Stale 409/404 responses toast the API message and refetch. Transition and delete `onSuccess` handlers return their invalidation promise, so buttons stay disabled until the queue has refetched, which closes the double-approve window. Edit is hidden for COMPLETED tasks in the row menu and on the detail page, and the edit route shows a read-only notice instead of the form.

Accessibility meets the plan's invariants: Radix triggers carry the label `id`, errors use `aria-invalid` plus `role="alert"`, badges show icon and text (-900 text on -100 fills), every table has an sr-only caption, and there's one `h1` in every state, including loading, error and not-found. The only gap is the Assignee label in its non-select states.

<details>
<summary>Issues (6)</summary>

1. **Silent detail-less VALIDATION_ERROR on the task form**: `toastUnlessInline` skips every `VALIDATION_ERROR`, but `applyApiErrorToForm` maps nothing when `details` is absent, so the user gets no feedback. Toast whenever `applyApiErrorToForm` returns `false` (as `CreateEmployeeDialog` already does) instead of keying on the code alone.
2. **Assignee label without a target**: while employees load, fail or are empty, `FieldLabel htmlFor={id}` points at no element. Give the placeholder/message that `id`, or render a non-`<label>` heading in those states.
3. **API 400 → field mapping untested in the browser**: only `form-errors.test.ts` covers it. Add one e2e case (for example `page.route` returning a 400 with `details`), or record in chunk D that unit coverage is accepted.
4. **Edit-save `TASK_COMPLETED`/404 races untested**: the toast → refetch → navigate path in `EditTaskView` has no e2e. Cover it like the stale approve (approve or delete via the API, then click Save).
5. **Detail-page delete untested**: only the row-menu delete runs in e2e. The detail page's delete (navigate to `/admin/tasks`, then remove the cached detail) has no test. Add one case.
6. **Priority filter has no e2e assertion**: it shares code with the Status filter. One assertion that `priority=HIGH` reaches the URL would lock it in.

</details>

<details>
<summary>Details</summary>

### Task form error mapping and the silent case

The form's `catch` calls `applyApiErrorToForm` and ignores its boolean result. The views then decide whether to toast with a code-only check:

```ts
// create-task-view.tsx
export const INLINE_FORM_CODES = new Set(['VALIDATION_ERROR', 'INVALID_ASSIGNEE']);
export function toastUnlessInline(error, fallback) {
  if (isApiError(error) && INLINE_FORM_CODES.has(error.code)) return;
  toast.error(apiErrorMessage(error, fallback));
}
```

The API sends `VALIDATION_ERROR` without `details` from two places in `error-handler.ts`: the body-parser 4xx fallback ("Invalid request body") and the generic Prisma `P2003` mapping. In those cases `validationIssues` returns `[]`, so nothing is set on the form and nothing is toasted. Submit re-enables and the screen doesn't change (confirmed by reading the code). Client validation mirrors the API, so a normal user is unlikely to hit this. `CreateEmployeeDialog` already uses the right pattern (`if (applyApiErrorToForm(...)) return; toast.error(...)`), and the task form should do the same.

### Edit-save races

When a task is approved while the edit form is open, the save gets 409 `TASK_COMPLETED`. `EditTaskView` then toasts, awaits `refreshStaleTask` and pushes to the detail page. When the task is deleted while the form is open, the save gets 404, the detail refetches, and the view becomes `TaskNotFound`. Both paths read correctly, but neither has an e2e test (confirmed; disclosed in the verification doc). Only the stale-approve 409 on the detail page is exercised in a browser.

### Assignee field labelling

`AssigneeField` always renders `<FieldLabel htmlFor={id}>Assignee</FieldLabel>`, but the element with that `id` exists only in the success branch (the `SelectTrigger`). In the loading skeleton, the `ErrorState` and the "Create an employee first" message, the label has no target (confirmed). Screen readers announce an orphan label, and clicking it does nothing. The impact is minor, but it falls short of the plan's "every input has a `<Label htmlFor>`" invariant in those states.

### Test coverage

The admin spec drives every screen through the real UI against the guarded test DB. That includes the Honolulu date check, filters surviving reload, invalid URL params, delete Cancel/Confirm, the reject reason rules, stale approve, and the duplicate-email field error. Not tested: the Priority filter, API 400 `details` → field errors, the edit-save `TASK_COMPLETED`/404 races, and delete from the detail page. Keyboard and axe checks are scheduled for chunk D.

### Unwired chunk-C components in the diff

`task-comments.tsx` and `task-history.tsx` came from the failed first iteration and aren't imported anywhere. They typecheck and lint, but this review didn't cover them, so chunk C's review should treat them as new code.

</details>

<details>
<summary>File map</summary>

- `src/app/(app)/admin/{page,tasks/page,tasks/new/page,tasks/[id]/page,tasks/[id]/edit/page,employees/page}.tsx`: thin server pages (metadata, `PageHeader`, `Suspense` for the list).
- `src/features/tasks/api/tasks-api.ts`: typed REST calls, ids encoded, bodyless transitions.
- `src/features/tasks/lib/{list-params,list-params.test,paths}.ts`: URL ↔ query validation, sort options, admin hrefs, `isTaskNotFoundError`.
- `src/features/tasks/hooks/{use-task-queries,use-task-mutations,use-task-list-params}.ts`: queries, mutations with toasts and cache effects, URL state.
- `src/features/tasks/components/{task-form,create-task-view,edit-task-view}.tsx`: create/edit form and views.
- `src/features/tasks/components/{task-detail-view,task-actions,task-not-found,delete-task-dialog,reject-task-dialog}.tsx`: detail page, workflow buttons, dialogs.
- `src/features/tasks/components/{task-table,task-filters,task-list-section,admin-task-list,task-row-actions,approval-queue,recent-tasks}.tsx`: lists, filters, row menu, dashboard sections.
- `src/features/tasks/components/{task-comments,task-history}.tsx`: not wired in yet, for chunk C.
- `src/features/dashboard/**`: summary API, hook, `SummaryCards`.
- `src/features/users/**`: employees API/hooks, `EmployeesTable`, `CreateEmployeeDialog`.
- `src/components/common/{status-badge,priority-badge,overdue-badge,due-date,stat-card,table-skeleton,pagination-controls}.tsx`: shared display pieces.
- `e2e/admin.spec.ts`, `e2e/auth.spec.ts`: admin e2e, plus employee → admin sub-route redirects.
- `docs/phase5-verification.md`, `docs/IMPLEMENTATION_CHECKLIST.md`: chunk B evidence.

Full diff: `git status` / `git diff` on the working tree (chunk B is uncommitted, mostly untracked files under `apps/web/src`).

</details>
