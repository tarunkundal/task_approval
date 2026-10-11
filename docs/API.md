# REST API

Base path: `/api/v1`. All bodies are JSON (`Content-Type: application/json`). Authentication is the httpOnly `tas_token` cookie set by `POST /auth/login`; the browser sends it automatically (same-origin through the Next.js proxy, D1).

Shared request schemas and response types live in `packages/shared` (`schemas/*.ts`, `types.ts`).

## Conventions

### Error shape

Every error, whatever the status:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [{ "path": "title", "message": "Title is required" }] } }
```

`details` is present only for validation errors (Zod issues as `{ path, message }`) and invalid transitions (`{ action, currentStatus }`). Responses never contain stack traces, database messages, password hashes or tokens.

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body, path param or query fails its schema; unknown keys (all schemas are strict); a referenced row is missing (Prisma P2003) |
| 400 | `INVALID_JSON` | body isn't valid JSON |
| 400 | `INVALID_ASSIGNEE` | assignee doesn't exist or isn't an EMPLOYEE |
| 401 | `UNAUTHENTICATED` | no cookie, bad / expired token, or the user no longer exists |
| 401 | `INVALID_CREDENTIALS` | login with an unknown email or wrong password (same response for both) |
| 403 | `FORBIDDEN` | the role may not use this endpoint |
| 403 | `CSRF_REJECTED` | unsafe method from a foreign `Origin` / `Sec-Fetch-Site` |
| 404 | `NOT_FOUND` | unknown route, or a task that is missing, soft-deleted or outside the caller's scope (another employee's task looks exactly like a missing one) |
| 409 | `INVALID_TRANSITION` | workflow action not allowed from the task's current status |
| 409 | `TASK_COMPLETED` | edit of a COMPLETED task |
| 409 | `EMAIL_TAKEN` | `POST /users` with an existing email |
| 409 | `CONFLICT` | any other unique-constraint conflict (Prisma P2002) |
| 413 | `PAYLOAD_TOO_LARGE` | body over 100 kb |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | an unsafe request with a non-JSON body |
| 429 | `RATE_LIMITED` | rate limit exceeded |
| 500 | `INTERNAL_ERROR` | anything unexpected (logged server-side without request values) |

### Check order

1. **Transport guards**, app-wide, before any route:
   - CORS: only `FRONTEND_URL` origins get `Access-Control-Allow-*` headers.
   - CSRF (POST/PUT/PATCH/DELETE): foreign `Origin` → 403 `CSRF_REJECTED`. A non-JSON body → 415.
   - Body parsing: over 100 kb → 413, malformed JSON → 400 `INVALID_JSON`.
   - Rate limits → 429.
2. **Authenticate** → 401.
3. **Role** → 403.
4. **Validation** of params, query and body → 400.
5. **Scope**: the task is loaded inside the caller's visibility → 404.
6. **State rules** (workflow status, completed task) → 409.

So an unauthenticated request with a foreign `Origin` gets 403, not 401, and an employee calling `approve` with a malformed id gets 403, not 400.

Step 4 covers schema validation only. Checks that need the database run after scope: `INVALID_ASSIGNEE` on `PATCH /tasks/:id` comes after 404 and 409 (see that endpoint).

### Rate limits (per API instance, in memory)

| Limiter | Applies to | Limit |
|---|---|---|
| Login per IP | `POST /auth/login` | 50 / 15 min per client IP, whatever the email |
| Login per IP + email | `POST /auth/login` | 10 / 15 min per client IP and normalized email |
| Writes | every POST/PUT/PATCH/DELETE under `/api/v1` | 300 / 15 min per client IP |

The client IP depends on `TRUST_PROXY` (see ARCHITECTURE §14).

### Shared shapes

```ts
UserDto        { id, name, email, role: 'ADMIN' | 'EMPLOYEE' }
TaskDto        {
  id, title, description,
  priority: 'LOW' | 'MEDIUM' | 'HIGH',
  status: 'PENDING' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED',
  dueDate: 'YYYY-MM-DD',
  assignedTo: { id, name, email },
  createdBy:  { id, name, email },
  reviewedBy: { id, name } | null,       // last admin who approved or rejected
  reviewedAt: ISO-8601 | null,
  latestRejectionReason: string | null,  // see below
  createdAt: ISO-8601, updatedAt: ISO-8601
}
CommentDto     { id, body, author: { id, name, role }, createdAt }
TaskHistoryDto { id, fromStatus: Status | null, toStatus, reason: string | null, actor: { id, name, role }, createdAt }
```

`latestRejectionReason` is the reason on the newest history row when that row is a rejection (PENDING_APPROVAL → IN_PROGRESS) and the task is still IN_PROGRESS. After the employee resubmits, or once approved, it is `null`; the reason stays in the history.

Ids are cuids. A malformed `:id` gives 400 `VALIDATION_ERROR`.

## Auth

### `POST /auth/login` (public)
Body `{ email, password }` (strict; email trimmed and lower-cased; password 1–200 chars).
- **200** `UserDto`, plus `Set-Cookie: tas_token=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=<JWT_EXPIRES_IN>` (and `Secure` in production). The token is never in the body.
- **400** validation, **401** `INVALID_CREDENTIALS`, **429** `RATE_LIMITED`.

### `POST /auth/logout` (public)
No body. **204**, clears the cookie. Idempotent.

### `GET /auth/me` (authenticated)
**200** `UserDto` (role always read from the database), **401** otherwise.

## Users (ADMIN only)

### `GET /users`
**200** `{ data: UserDto[] }`: employees only, ordered by name. **401**, **403**.

### `POST /users`
Body (strict):

| Field | Rules |
|---|---|
| `name` | trimmed, 1–100 chars |
| `email` | trimmed, lower-cased, valid email, ≤ 254 chars |
| `password` | ≥ 8 chars and ≤ 72 **UTF-8 bytes** (bcrypt's limit) |

A `role` key (or any other key) → 400. The account is always an `EMPLOYEE`. The password is hashed with bcrypt at `BCRYPT_COST` (12).
- **201** `UserDto`.
- **400** validation, **401**, **403**, **409** `EMAIL_TAKEN`.

```http
POST /api/v1/users
{ "name": "Sam Rivera", "email": "sam@demo.com", "password": "Welcome@12345" }

201 { "id": "cm…", "name": "Sam Rivera", "email": "sam@demo.com", "role": "EMPLOYEE" }
```

## Tasks

Scope: an ADMIN sees every non-deleted task. An EMPLOYEE sees only tasks assigned to them. The scope is part of every database query, so tasks outside it give 404 (detail and actions) or are simply absent (lists and counts).

### `GET /tasks` (authenticated)
Query (strict; unknown parameters → 400):

| Param | Default | Rules |
|---|---|---|
| `page` | 1 | integer ≥ 1 |
| `pageSize` | 20 | integer 1–100 |
| `status` | – | `PENDING` · `IN_PROGRESS` · `PENDING_APPROVAL` · `COMPLETED` |
| `priority` | – | `LOW` · `MEDIUM` · `HIGH` |
| `assignedToId` | – | cuid. Admin filter; for an employee it can only narrow their own tasks (another id → empty list) |
| `q` | – | title contains, trimmed, ≤ 100 chars, case-insensitive; `%` and `_` match literally |
| `sort` | `createdAt` | `createdAt` · `updatedAt` · `dueDate` · `priority` (LOW < MEDIUM < HIGH) |
| `order` | `desc` | `asc` · `desc` (ties broken by id, so pages are stable) |

**200**:
```json
{ "data": [TaskDto], "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
```
`total` counts every matching task, not just the page. **400**, **401**.

### `POST /tasks` (ADMIN)
Body (strict):

| Field | Rules |
|---|---|
| `title` | trimmed, 1–200 chars |
| `description` | optional, trimmed, ≤ 5000 chars, default `""` |
| `priority` | `LOW` · `MEDIUM` · `HIGH` |
| `dueDate` | `YYYY-MM-DD`, a real calendar date (`2026-02-30` → 400) |
| `assignedToId` | cuid of an existing EMPLOYEE |

`status`, `createdById` or any other key → 400. The task starts as `PENDING`, `createdBy` is the caller, and a history row (`null → PENDING`) is written in the same transaction.
- **201** `TaskDto`.
- **400** `VALIDATION_ERROR` / `INVALID_ASSIGNEE`, **401**, **403**.

```http
POST /api/v1/tasks
{ "title": "Prepare onboarding pack", "priority": "HIGH", "dueDate": "2026-11-01", "assignedToId": "cm…" }

201 { "id": "cm…", "title": "Prepare onboarding pack", "description": "", "priority": "HIGH", "status": "PENDING",
      "dueDate": "2026-11-01", "assignedTo": { "id": "cm…", "name": "Jordan Lee", "email": "employee1@demo.com" },
      "createdBy": { "id": "cm…", "name": "Alex Admin", "email": "admin@demo.com" },
      "reviewedBy": null, "reviewedAt": null, "latestRejectionReason": null,
      "createdAt": "2026-10-11T09:00:00.000Z", "updatedAt": "2026-10-11T09:00:00.000Z" }
```

### `GET /tasks/:id` (authenticated, in scope)
**200** `TaskDto`. **400** malformed id, **401**, **404**.

### `PATCH /tasks/:id` (ADMIN)
Body (strict, at least one field): any of `title`, `description`, `priority`, `dueDate`, `assignedToId`, with the same rules as create. `status`, `createdById`, `reviewedById`, `reviewedAt`, `deletedAt` or unknown keys → 400.
- Reassignment keeps the current status; the previous assignee loses access.
- Edits aren't written to the status history (audit scope D4).
- Check order after the schema check (400 `VALIDATION_ERROR`): scope (404) → COMPLETED (409 `TASK_COMPLETED`) → assignee (400 `INVALID_ASSIGNEE`). So a bad `assignedToId` gives 409 on a completed task and 404 on a missing or deleted one.
- The write is a conditional update on `status ≠ COMPLETED`. If an approval or delete commits while the edit is in flight, the edit isn't applied and the response is 409 `TASK_COMPLETED` or 404, never a 200 with stale data.
- **200** `TaskDto`.
- **400** validation / `INVALID_ASSIGNEE`, **401**, **403**, **404**, **409** `TASK_COMPLETED` (or `CONFLICT` if the task changed underneath the edit in any other way).

### `DELETE /tasks/:id` (ADMIN)
Soft delete (`deletedAt` set). The task disappears from lists, detail, comments, history, actions and dashboard counts. Its history and comments stay in the database.
- **204** (no body).
- **401**, **403**, **404** (already deleted or unknown).

## Workflow actions

Every action runs one conditional update plus one history insert in a single transaction. Of two conflicting concurrent requests, exactly one succeeds and the other gets 409. Each success returns **200** with the updated `TaskDto`.

| Endpoint | Role | From → To | Body | Extra effects |
|---|---|---|---|---|
| `POST /tasks/:id/start` | EMPLOYEE (assignee) | PENDING → IN_PROGRESS | none or `{}` | history row |
| `POST /tasks/:id/submit` | EMPLOYEE (assignee) | IN_PROGRESS → PENDING_APPROVAL | none or `{}` | history row |
| `POST /tasks/:id/approve` | ADMIN | PENDING_APPROVAL → COMPLETED | none or `{}` | `reviewedBy`, `reviewedAt`, history row |
| `POST /tasks/:id/reject` | ADMIN | PENDING_APPROVAL → IN_PROGRESS | `{ "reason": "…" }`, trimmed, 1–1000 chars, required | `reviewedBy`, `reviewedAt`, history row with the reason (no extra comment) |

Errors:
- **400**: malformed id, unexpected body keys, missing or blank `reason`.
- **401**.
- **403**: wrong role. An ADMIN calling start/submit, or an EMPLOYEE calling approve/reject; the status is unchanged.
- **404**: task missing, deleted, or (for employees) not assigned to them.
- **409** `INVALID_TRANSITION`: wrong current status. COMPLETED is final.

```http
POST /api/v1/tasks/cm…/approve        (task is IN_PROGRESS)

409 { "error": { "code": "INVALID_TRANSITION",
                 "message": "Task cannot be approved while its status is IN_PROGRESS",
                 "details": { "action": "approve", "currentStatus": "IN_PROGRESS" } } }
```

## Comments and history

The task must be in the caller's scope; otherwise **404**. Neither resource has edit or delete endpoints.

### `GET /tasks/:id/comments`
**200** `{ data: CommentDto[] }`, oldest first. Authors show `{ id, name, role }` only.

### `POST /tasks/:id/comments`
Body (strict) `{ "body": "…" }`, trimmed, 1–2000 chars. The author is the caller.
- **201** `CommentDto`.
- **400**, **401**, **404**.

### `GET /tasks/:id/history`
**200** `{ data: TaskHistoryDto[] }`, oldest first (ties broken by id). The first row is the creation (`fromStatus: null`). Rejections carry `reason`.

## Dashboard

### `GET /dashboard/summary` (authenticated)
Aggregate queries over the caller's scope (admin: all non-deleted tasks; employee: their own). Independent of list pagination; soft-deleted tasks are excluded.

```json
{ "total": 5, "byStatus": { "PENDING": 1, "IN_PROGRESS": 2, "PENDING_APPROVAL": 1, "COMPLETED": 1 }, "overdue": 1 }
```

All four status keys are always present. `overdue` = `dueDate` before today's **UTC** date and status ≠ COMPLETED. The UI may recompute overdue per task against the viewer's local date.

## Health

`GET /health` and `GET /api/v1/health` (public): **200** `{ "status": "ok", "checks": { "database": "ok" } }`, or **503** `{ "status": "unavailable", "checks": { "database": "down" } }` when the database ping fails.
