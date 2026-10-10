# MASTER BUILD PROMPT — TASK & APPROVAL MANAGEMENT SYSTEM

## 1. Your role

Act as a senior full-stack TypeScript engineer, software architect, database designer, application security engineer, QA engineer and DevOps engineer.

Build a complete, working, deployment-ready Task & Approval Management web application for a Full Stack Developer assessment intended for a candidate with 5–6 years of experience.

AI coding tools are explicitly allowed for this assessment. Prioritize correctness, security, maintainability, a polished UI and demonstrable business logic over unnecessary complexity.

Do not build a static prototype. All essential features must work end to end with a real backend and a persistent MySQL database.

## 2. Mandatory technology stack

Use the following stack unless a technical incompatibility makes a change necessary. Explain any necessary change before proceeding.

- Frontend: React JS and TypeScript.
- Styling: Tailwind CSS and a consistent component system such as shadcn/ui.
- Backend: Node.js, Express and TypeScript in a separate application.
- Database: MySQL.
- ORM: Prisma.
- API: REST.
- Validation: Zod for request and form validation.
- Authentication: secure JWT-based authentication using HTTP-only cookies, or propose a secure server-side session implementation if that is more appropriate.
- Password hashing: bcrypt.
- Frontend forms: React Hook Form and Zod where useful.
- Package manager: pnpm.
- Version control: GitHub.
- Deployment: publicly accessible HTTPS frontend, backend API and persistent MySQL database.

Use compatible, stable dependency versions. Do not use deprecated APIs or assume that a package exists without checking the repository and its dependency versions.

Keep the application TypeScript-first and enable strict type checking.

## 3. Repository architecture

Use a pnpm monorepo with this structure:

task-approval-system/
  apps/
    web/
    api/
  packages/
    shared/
  README.md
  package.json
  pnpm-workspace.yaml
  .gitignore
  .env.example

Frontend responsibilities:
- Login and logout.
- Admin and Employee dashboards.
- Task lists, filters, details, forms and approval actions.
- Loading, success, error and empty states.
- Calling the REST API.

Backend responsibilities:
- Authentication and authorization.
- User management.
- Task CRUD.
- Task state transitions.
- Comments and task history.
- Dashboard aggregates.
- Input validation and consistent errors.
- Database operations and automated tests.

Shared package:
- Only add shared types or schemas when useful.
- Avoid unnecessary workspace complexity.

Use a clean backend structure such as:

apps/api/src/
  config/
  middleware/
  routes/
  controllers/
  services/
  validators/
  lib/
  errors/
  app.ts
  server.ts

Organize the frontend by feature and use reusable components.

Do not place all business logic in React components or Express route handlers.

## 4. Required roles and demo accounts

Implement exactly two roles:

ADMIN
EMPLOYEE

Seed three demo accounts:
- admin@demo.com — ADMIN
- employee1@demo.com — EMPLOYEE
- employee2@demo.com — EMPLOYEE

Generate clear demo passwords in the seed script and document the demo credentials in the README or submission instructions.

Passwords must be hashed. Never store plaintext passwords in the database.

Use idempotent seed logic where practical so rerunning the seed does not create duplicate users. The seed must not reset production user passwords unexpectedly.

Admins can create employee accounts. Employees cannot create users or change their own role.

Do not add public self-registration unless required for a technical reason. Login is sufficient for this assessment.

## 5. Required database models

Design a relational MySQL schema using Prisma.

### User
Fields:
- id
- name
- email, unique
- passwordHash
- role
- createdAt
- updatedAt

### Task
Fields:
- id
- title
- description
- priority
- status
- dueDate
- assignedToId
- createdById
- reviewedById, nullable
- reviewedAt, nullable
- createdAt
- updatedAt
- deletedAt, nullable if implementing soft deletion

### TaskComment
Fields:
- id
- taskId
- authorId
- body
- createdAt
- updatedAt if comment editing is supported

### TaskStatusHistory
Fields:
- id
- taskId
- fromStatus, nullable for initial creation
- toStatus
- actorId
- reason, nullable
- createdAt

Define proper relations, foreign keys, unique constraints, deletion policies and useful indexes.

Required indexes should support queries by assignee, status, priority, task ID and history/comment foreign keys.

Use migrations committed to GitHub. Never rely on an undocumented manual database setup.

Make due-date semantics consistent. Prefer a date-only database representation if the requirement is a calendar date, and avoid timezone-induced date changes.

Choose a deletion policy that does not accidentally destroy required audit history. Soft deletion is acceptable. If using soft deletion, ensure deleted tasks are excluded from ordinary task queries.

## 6. Task statuses and priorities

Use exactly these task statuses:

PENDING
IN_PROGRESS
PENDING_APPROVAL
COMPLETED

Use these priorities:

LOW
MEDIUM
HIGH

The only permitted status transitions are:

- Admin creates task: initial status PENDING.
- Assigned Employee starts a PENDING task: IN_PROGRESS.
- Assigned Employee submits an IN_PROGRESS task: PENDING_APPROVAL.
- Admin approves a PENDING_APPROVAL task: COMPLETED.
- Admin rejects a PENDING_APPROVAL task: IN_PROGRESS.

Do not allow employees to approve tasks.

Do not allow arbitrary status changes through generic PATCH requests.

Do not allow transitions from COMPLETED back to an active status unless an explicit, separately authorized reopening feature is added. It is not required for this assessment.

Validate each transition on the server using the current persisted status, actor identity and actor role.

Use database transactions for status changes and their associated history entries. Handle concurrent updates so two conflicting transitions cannot both succeed.

## 7. Authentication and application security

Implement:
- Login.
- Logout.
- Current-user endpoint.
- Protected frontend routes or layouts.
- Backend authentication middleware.
- Admin role middleware.
- Task ownership authorization.
- Secure password hashing.
- Request validation.
- Centralized error handling.
- Rate limiting on login and other sensitive endpoints.
- CORS configuration using explicit allowed origins.
- Safe cookie configuration.
- Environment-based secrets.
- Appropriate security headers.
- Protection against unauthorized object access and mass assignment.

If using JWT cookies:
- Put the token in an HTTP-only cookie.
- Use Secure cookies in production.
- Configure SameSite deliberately based on the deployment topology.
- Set appropriate token expiration.
- Verify signature and expiration on every protected request.
- Never store authentication tokens in localStorage.
- Address CSRF risks for cookie-authenticated state-changing requests.
- Configure credentialed CORS correctly for the actual frontend origin.

Never trust a user ID or role supplied in request bodies to establish identity.

Derive the actor's ID and role from verified authentication.

Validate every request body, path parameter and query parameter with Zod.

Use Prisma safely and never construct raw SQL using untrusted string interpolation.

Do not expose stack traces, password hashes, tokens or internal secrets in API errors or logs.

## 8. Admin features

Build a complete Admin dashboard.

The Admin must be able to:
- View all non-deleted tasks.
- Create tasks.
- Edit task title, description, priority, due date and assignee.
- Delete tasks with a confirmation dialog.
- View the employee list.
- Create Employee accounts.
- Assign tasks to existing employees.
- Filter tasks by status.
- Filter tasks by priority.
- Filter tasks by employee.
- View task details, comments and status history.
- See tasks awaiting approval.
- Approve submitted tasks.
- Reject submitted tasks with a required feedback reason.
- View dashboard status counts.

Do not allow changing task ownership to a nonexistent user or assigning a task to an invalid role.

Use server-side authorization even when the frontend hides administrative controls.

## 9. Employee features

Build a separate Employee dashboard.

An employee must be able to:
- View only their own assigned tasks.
- View task details and due dates.
- Filter by status and priority.
- Start a Pending task.
- Add comments to an accessible task.
- Submit an In Progress task for approval.
- View task history.
- See administrator feedback after rejection.
- Resume work after rejection and submit again.

An employee must never access another employee's task by modifying a task ID, employee ID or query parameter.

For unauthorized object access, use a consistent policy such as returning 404 to avoid disclosing the existence of another user's task.

Do not expose controls that allow employees to create, edit, reassign or delete tasks unless a requirement explicitly permits it.

## 10. Approval workflow

When an employee submits a task:
- Verify that the employee is the assignee.
- Verify that the task is IN_PROGRESS.
- Transition it to PENDING_APPROVAL.
- Record the actor, previous status, new status and timestamp.
- Make it visible in the Admin approval queue.

When an admin approves:
- Verify that the actor is an authenticated ADMIN.
- Verify that the task is PENDING_APPROVAL.
- Change the status to COMPLETED.
- Record reviewer ID and review timestamp.
- Add a history entry.
- Perform the related database changes atomically.

When an admin rejects:
- Require a non-empty rejection reason.
- Verify that the task is PENDING_APPROVAL.
- Change the status to IN_PROGRESS.
- Save the reason in the history record and/or a clearly identified feedback comment.
- Record the reviewer and timestamp.
- Perform related changes atomically.

Return clear validation errors for invalid transitions.

## 11. Comments and task history

Comments:
- Authorized task viewers can read comments.
- Employees can add comments to tasks assigned to them.
- Admins can add comments to tasks they are authorized to manage.
- Validate comment length and reject empty content.
- Return author details and timestamps without sensitive user information.

History:
- Record initial task creation.
- Record every successful status transition.
- Record the actor, previous status, new status and timestamp.
- Include rejection reason when applicable.
- Preserve history through ordinary application workflows.
- Do not let normal users modify or delete audit records.

If task edits or reassignment need history entries, implement them consistently or document the chosen audit scope.

## 12. REST API contract

Implement and document endpoints similar to the following:

POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/users
POST   /api/v1/users

GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id

POST   /api/v1/tasks/:id/start
POST   /api/v1/tasks/:id/submit
POST   /api/v1/tasks/:id/approve
POST   /api/v1/tasks/:id/reject

GET    /api/v1/tasks/:id/comments
POST   /api/v1/tasks/:id/comments
GET    /api/v1/tasks/:id/history

GET    /api/v1/dashboard/summary

Add status, priority and employee filters to GET /tasks as appropriate.

Implement pagination and sensible limits for task lists. Dashboard counts must be computed from the backend using the logged-in user's permissions.

For employee requests, enforce assigned-task scope in the database query itself. Do not fetch every task and filter it only in the frontend.

Document request bodies, response shapes, authorization rules and status codes.

Use consistent HTTP status codes, including:
- 200 for successful reads and updates.
- 201 for successful resource creation.
- 204 where a successful operation intentionally has no response body.
- 400 for invalid requests.
- 401 for missing or invalid authentication.
- 403 for forbidden role/action.
- 404 for missing or intentionally concealed inaccessible resources.
- 409 for genuine state conflicts or uniqueness conflicts where appropriate.
- 500 for unexpected server errors.

Use a consistent JSON error structure. Do not leak internal exception details.

## 13. Dashboard requirements

Admin dashboard:
- Total task count.
- Pending count.
- In Progress count.
- Pending Approval count.
- Completed count.
- Task table with assignee.
- Search and filters.
- Approval actions.

Employee dashboard:
- Counts for the employee's assigned tasks.
- Assigned task list.
- Filters by status and priority.
- Clear indication of overdue tasks.
- Accessible task details and comments.

Counts must be correct independently of pagination.

Define whether dashboard counts include deleted tasks; normally, exclude them.

Keep filters synchronized with URL query parameters where practical.

## 14. UI and UX quality

Create a polished, professional business application, not a bare scaffold.

Use:
- A consistent layout and typography.
- Sidebar navigation or an equivalent clear navigation system.
- Responsive layouts.
- Status badges with accessible contrast.
- Priority indicators.
- Task tables or well-designed task cards.
- Confirmation dialogs for destructive actions.
- Forms with inline validation.
- Toast notifications for success and failure.
- Loading skeletons or loading indicators.
- Empty states with useful guidance.
- Clear API error messages.
- Accessible labels, keyboard navigation and focus states.

Provide different navigation and screens for Admin and Employee.

Use realistic sample tasks only if they help demonstrate the workflow. The three required demo accounts must always be seeded.

Do not sacrifice working functionality for visual effects.

## 15. Automated tests

Use Vitest and Supertest for backend tests.

At minimum, test these scenarios:

1. An unauthenticated request cannot access a protected task endpoint.
2. An Employee cannot approve a task, and the task status remains unchanged.
3. An Admin can approve a task in PENDING_APPROVAL and the status history is persisted.
4. An Admin can reject a task and the status returns to IN_PROGRESS.
5. Employee 1 cannot access Employee 2's task.
6. Invalid status transitions are rejected.
7. Invalid task inputs are rejected.
8. A valid employee workflow moves PENDING → IN_PROGRESS → PENDING_APPROVAL.
9. Status and history changes roll back together when the transaction fails, where feasible to test.

Use a separate test database or another properly isolated database strategy. Never run destructive test cleanup against production data.

Tests must execute real application logic. Do not replace the business rules with mocked assertions that cannot detect authorization defects.

Ensure tests are deterministic and can run using documented commands.

## 16. Database setup and seeding

Provide:
- A complete Prisma schema.
- Committed migration files.
- An environment variable example file with names and placeholders only.
- A seed script for the three demo accounts.
- Instructions to initialize MySQL.
- Instructions to run migrations.
- Instructions to seed demo data.
- Instructions to run the application locally.
- Instructions to run tests.

Use environment variables such as:

DATABASE_URL
JWT_SECRET
JWT_EXPIRES_IN
FRONTEND_URL
API_URL
NODE_ENV
PORT

Add any additional variables required by the actual implementation.

Never commit real secrets. Validate required environment variables at application startup and fail with clear configuration errors.

## 17. README requirements

Create a thorough but concise README containing:

1. Project overview.
2. Feature list.
3. Architecture and folder structure.
4. Technology stack.
5. Prerequisites.
6. Local setup.
7. Environment variable names and descriptions, without secret values.
8. MySQL initialization instructions.
9. Migration commands.
10. Seed commands.
11. Demo account credentials for the deployed assessment.
12. Frontend and backend development commands.
13. Test commands.
14. API endpoint overview.
15. Authorization and workflow rules.
16. Deployment instructions.
17. Known limitations.
18. AI tools used and what the developer personally verified.

Do not claim tests passed or deployment succeeded unless you actually ran or verified them.

## 18. Deployment and submission

Prepare the project for deployment to a public HTTPS frontend and backend with a persistent MySQL database.

Provide:
- Production build scripts.
- Correct frontend API configuration.
- Correct CORS and cookie configuration.
- Database migration instructions for production.
- Seed instructions appropriate for the deployment.
- Health-check endpoint.
- Clear deployment configuration documentation.
- A final checklist for validating the public application.

Do not hardcode localhost into production API requests.

Do not use an ephemeral filesystem as the sole database.

Do not assume a free hosting plan will remain online for 14 days without checking its limits.

Never fabricate a live URL, repository URL or successful deployment result. If you cannot deploy directly, prepare the project and provide exact deployment instructions for me to execute.

## 19. Implementation workflow — follow these phases

Do not try to generate the entire project in a single unverified pass.

### Phase 1: Inspect and plan
Inspect the existing repository before making changes. If it is empty, initialize the proposed structure.

Return:
- Architecture overview.
- Data model and relationships.
- API contract.
- Authentication strategy.
- Authorization matrix.
- Folder structure.
- Implementation plan.
- Potential deployment risks.

Do not overwrite existing working files without understanding them.

### Phase 2: Foundation and database
Set up pnpm workspaces, frontend and backend apps, strict TypeScript, Prisma, MySQL schema, migrations, seed scripts and environment validation.

Run relevant checks and fix errors before moving forward.

### Phase 3: Authentication and permissions
Implement login, logout, current-user endpoint, secure cookies, authentication middleware, Admin role middleware and task ownership checks.

Test both valid and invalid access paths.

### Phase 4: Task APIs and workflow
Implement task CRUD, assignment, status transitions, comments, history and dashboard aggregation.

Ensure the backend enforces every business rule.

### Phase 5: Frontend
Build the login page, Admin dashboard, Employee dashboard, task management views, filters, comments, task history, approval actions and user creation.

Connect every functional screen to the real REST API.

### Phase 6: Testing and hardening
Run migrations, seed the test database, execute automated tests, fix TypeScript errors, run linting and production builds.

Test the required workflow end to end and test unauthorized actions.

### Phase 7: Deployment preparation
Prepare production configuration, verify environment variables and cookie/CORS settings, document deployment and run a public-URL verification checklist once deployment is available.

### Phase 8: Final review
Compare the completed implementation against every requirement in this prompt.

Provide a table containing:
- Requirement.
- Implementation location.
- Test or verification method.
- Actual result.
- Any remaining limitation.

## 20. Rules for working with me

- First inspect the repository and report what exists.
- If the repository is empty, initialize it.
- Work in small, coherent steps.
- Prefer readable, maintainable code over clever abstractions.
- Do not skip security or tests to save time.
- Do not silently omit requirements.
- Do not invent credentials, environment values, hosting URLs or test results.
- Do not stop after creating a UI scaffold.
- Run the available type checks, lint checks, tests and production builds.
- When a command fails, diagnose and fix the root cause rather than hiding the failure.
- If you cannot execute a command in your environment, tell me exactly what I must run.
- Before introducing a new library, check whether the existing stack already solves the problem.
- Avoid unnecessary features, microservices and infrastructure.
- Keep all implementation changes inside the intended project repository.
- Explain important architectural decisions briefly so I can understand and defend them in an interview.

Start with Phase 1 only. Inspect the current repository, propose the architecture and identify any decisions that need confirmation. Then proceed phase by phase, implementing and verifying each part before moving on.

The final deliverable must be a real, working, secure and deployable application that satisfies the assessment—not merely generated code or a visual prototype.