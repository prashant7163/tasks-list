# Personal Task List — Discovery Specification

## 1. Document purpose

This document defines the complete discovery scope for a small full-stack application. It is the handoff artifact for a new Studio project. The implementation team or discovery agent should treat the product decisions below as settled and should not repeat product discovery unless a genuine technical blocker appears.

The target is intentionally basic. Do not add speculative features, scalability work, or product ceremony beyond this specification.

## 2. Product summary

Build a personal task-list application in which a user can:

1. Register with a display name, email, and password.
2. Sign in with email and password.
3. View only their own active and completed tasks.
4. Create, edit, delete, complete, sort, and prioritize active tasks.
5. View completed tasks separately and reactivate them.
6. Log out and return to the login page.

The application runs locally through Docker Compose. Users, tasks, and task state are stored in PostgreSQL and persist across ordinary container recreation through a named Docker volume.

## 3. Approved technology and architecture

### 3.0 Project mapping and delivery tracking

- Canonical GitHub repository: <https://github.com/prashant7163/tasks-list>
- The AI Dev Studio project must be mapped to this repository.
- GitHub Issues and Milestones are the records for appropriate project artifacts and delivery progress for future reference.
- Create one or more milestones that represent the agreed delivery stages for the first version.
- Track implementable work, defects, decisions requiring action, and acceptance follow-ups as GitHub issues rather than leaving them only in chat or agent output.
- Each issue must have a clear title, scoped description, acceptance criteria, and milestone assignment when applicable.
- Link relevant implementation artifacts—such as branches, commits, pull requests, test evidence, and decision notes—to the issue they satisfy.
- Keep issue and milestone status current so the repository reflects what is planned, in progress, blocked, and complete.
- Do not create ceremonial documents or duplicate tracking artifacts that add no value; record only artifacts appropriate to the work.

### 3.1 Technology stack

- Frontend: React with Vite
- Frontend styling: plain CSS; no component library
- Backend: Spring Boot REST API
- Authentication and authorization: Spring Security with server-side sessions
- Persistence: PostgreSQL
- ORM: JPA/Hibernate
- Schema management: Flyway migrations
- Local orchestration: Docker Compose
- Human readable clean logging with rolling logs

Use stable, mutually compatible releases available when implementation begins. Exact version selection is an implementation decision and should not trigger further product discovery.

### 3.2 Repository and runtime structure

Use one repository containing:

- `frontend/` for the React application
- `backend/` for the Spring Boot application
- Docker Compose configuration for the frontend, backend, and PostgreSQL services

The backend is the authority for authentication, task ownership, field validation, status changes, timestamps, and priority ordering. The frontend must not be trusted to enforce business rules by itself.

Docker Compose must:

- Start all required services locally.
- Start from an empty database on the first run; do not seed demo users or tasks.
- Mount a named volume at PostgreSQL's data directory so data survives ordinary container replacement.
- Apply Flyway migrations automatically as part of backend startup.

Cloud deployment, hosting, and multi-server architecture are not required.

## 4. User interface and navigation

### 4.1 Visual direction

- Clean, minimal, and responsive.
- Usable on ordinary desktop and mobile viewport sizes.
- No elaborate branding or decorative product work.
- Use clear labels, visible focus states, and conventional form and button behavior.

### 4.2 Public routes

- **Sign Up**: display name, email, and password fields.
- **Login**: email and password fields.

An authenticated user who opens a public authentication route may be redirected to the task list. An unauthenticated user who opens a protected route must be redirected to Login.

### 4.3 Protected task view

The signed-in task view contains:

- The signed-in user's display name.
- A Logout action.
- An add-task form or clearly visible action that opens the form.
- Two separate tabs: **Active** and **Completed**.
- A task count and independent sort controls on each tab.

The Active tab is the landing tab after login.

## 5. Account requirements

### 5.1 Registration

Registration requires:

- Display name
- Email
- Password

All three values are required and must not be blank or whitespace-only.

There is no email-format validation and no password-strength rule. This means the app does not require verification links, domain checks, minimum complexity, uppercase characters, digits, or special characters. Normal defensive input-size limits may be selected during implementation without adding product-level restrictions.

Email comparison is case-insensitive. Trim surrounding whitespace and normalize the email for lookup and uniqueness. Registrations such as `User@example.com` and `user@example.com` refer to the same account and cannot both exist.

Passwords must never be stored in plaintext. Store only a hash generated through Spring Security's adaptive password encoder.

On successful registration:

1. Create the account.
2. Do not create an authenticated session.
3. Show a success indication.
4. Redirect the user to Login.

A duplicate email produces a clear "email already registered" error.

### 5.2 Login and session

- Login uses email and password.
- Invalid credentials produce one generic error and do not reveal whether the email exists.
- Successful login creates a server-side session and redirects to the Active tab.
- The session is carried in an HTTP-only cookie.
- Use appropriate same-site cookie settings and CSRF protection for state-changing requests.
- There is no "remember me" feature.
- Logout invalidates the server-side session and returns the user to Login.
- An expired or invalid session returns the user to Login when protected content is requested.

### 5.3 Account authorization

Every task read or mutation must be scoped to the authenticated user. A user can never view or change another user's task. A request for a task not owned by the current user should behave as not found rather than disclosing its existence.

### 5.4 Account features explicitly excluded

- Email verification
- Password reset or recovery
- Profile editing
- Account deletion
- Administrative accounts or screens

## 6. Task data model

Each task contains:

- Unique ID
- Owning user ID
- Title
- Description
- Status: `ACTIVE` or `COMPLETED`
- Active priority position, nullable when completed
- Creation timestamp
- Completion timestamp, nullable while active

### 6.1 Field rules

- Title is required, nonblank, and limited to 120 characters.
- Description is required, nonblank, and limited to 1,000 characters.
- Creation timestamp is assigned by the backend and never changes.
- Completion timestamp is assigned by the backend when a task becomes completed.
- Timestamps are stored in UTC and formatted for display by the frontend.
- There is no audit trail or state-change history.

## 7. Active-task behavior

### 7.1 Display

Each active task displays:

- Completion checkbox
- Title
- Description
- Creation date
- Edit action
- Delete action

### 7.2 Create

- Both title and description must pass the field rules.
- A new task is `ACTIVE`.
- A new task receives the highest active priority.
- Creating a task must update the visible Active count and list without requiring a full page reload.

### 7.3 Edit

- Only active tasks can be edited.
- Both title and description remain required after editing.
- Editing does not change the creation timestamp or priority.

### 7.4 Delete

- Only active tasks can be deleted.
- The UI must show a confirmation dialog before deletion.
- Cancelling the dialog leaves the task untouched.
- Confirming permanently removes the task and closes any gap in active priority positions.

### 7.5 Complete

Selecting the completion checkbox on an active task must:

1. Change its status to `COMPLETED`.
2. Set its completion timestamp to the backend's current time.
3. Remove its active priority position.
4. Remove it from Active and add it to Completed.
5. Update both tab counts.

The task's title, description, creation timestamp, and owner do not change.

### 7.6 Priority and drag-and-drop

- Priority applies only to active tasks.
- A lower numeric position represents a higher priority; the highest task has position 1.
- Users can press and hold an active task with the mouse, drag it up or down, and release it to change priority.
- Drag-and-drop is enabled in the normal Priority view, ordered highest to lowest.
- The backend validates that every reordered task is active and belongs to the authenticated user, then saves the order transactionally.
- Priority positions must remain unique and contiguous within each user's active tasks.

When displaying the reverse Priority sort, the list is a reverse view of the saved priority order; drag-and-drop may be disabled to avoid ambiguous rank changes.

### 7.7 Active sorting

The Active tab defaults to **Creation date — newest first**.

Supported sort keys and directions:

- Creation date: newest first or oldest first
- Priority: highest first or lowest first
- Title: A–Z or Z–A, using case-insensitive comparison

Changing sort mode changes the presentation only, except for explicit drag-and-drop priority changes.

## 8. Completed-task behavior

### 8.1 Display

- Completed tasks appear only in the Completed tab.
- They use muted grayscale styling while remaining readable.
- Each completed task displays its title, description, creation date, completion date, and a Reactivate action.
- Completed tasks have no priority.
- Completed tasks cannot be edited or deleted.

### 8.2 Completed sorting

The Completed tab defaults to **Completion date — newest first**.

Supported sort keys and directions:

- Completion date: newest first or oldest first
- Creation date: newest first or oldest first
- Title: A–Z or Z–A, using case-insensitive comparison

### 8.3 Reactivate

Reactivating a completed task must:

1. Change its status to `ACTIVE`.
2. Clear its completion timestamp.
3. Assign it the highest active priority.
4. Remove it from Completed and add it to Active.
5. Update both tab counts.

Its title, description, creation timestamp, and owner remain unchanged.

## 9. Required REST capabilities

The exact route naming may follow established Spring conventions, but the API must provide these capabilities:

- Register an account.
- Log in and create a session.
- Log out and invalidate a session.
- Retrieve the current authenticated user's basic identity.
- List active tasks with an allowed sort key and direction.
- List completed tasks with an allowed sort key and direction.
- Create an active task at highest priority.
- Edit an active task.
- Delete an active task.
- Complete an active task.
- Reactivate a completed task at highest priority.
- Persist an active-task priority reorder.

One conventional route layout is:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/tasks?status=ACTIVE&sort=createdAt&direction=desc`
- `GET /api/tasks?status=COMPLETED&sort=completedAt&direction=desc`
- `POST /api/tasks`
- `PATCH /api/tasks/{taskId}`
- `DELETE /api/tasks/{taskId}`
- `POST /api/tasks/{taskId}/complete`
- `POST /api/tasks/{taskId}/reactivate`
- `PUT /api/tasks/reorder`

The listing response must provide the tasks and enough count information for the two tab counters. The implementation may return both counts with list responses or expose an equivalent small summary capability.

## 10. Validation and error behavior

The backend is authoritative for all validation. The frontend should mirror the rules for immediate feedback but must display backend errors safely.

Required cases:

- Missing or blank required values: reject with a clear field-level error.
- Title or description over its maximum length: reject with a clear field-level error.
- Duplicate normalized email: reject without creating an account.
- Invalid login: show a generic credentials error.
- Missing or expired session: reject the request and return the UI to Login.
- Task not found or not owned: respond as not found.
- Editing or deleting a completed task: reject the operation.
- Completing an already completed task or reactivating an active task: reject the invalid transition.
- Invalid sort key or direction: reject rather than constructing an unsafe dynamic query.
- Invalid reorder payload: reject the entire update without partially changing priority.
- Unexpected server or database error: preserve existing data and show a generic retry message; do not expose stack traces to the user.

State changes and priority updates must be transactional.

## 11. Acceptance criteria

The implementation is acceptable when all of the following observable outcomes hold:

1. `docker compose up` starts the frontend, backend, and PostgreSQL services locally after required configuration is supplied.
2. The first startup contains no user or task data.
3. A user can register, is redirected to Login, and can log in with the new email and password.
4. Differently capitalized forms of the same email cannot create separate accounts.
5. Two registered users cannot see or mutate one another's tasks.
6. A signed-in user can create a task only when title and description meet the required rules.
7. A new or reactivated task is assigned the highest active priority.
8. Active tasks can be edited and deleted; deletion requires confirmation.
9. Active tasks can be reordered by mouse drag-and-drop in the normal Priority view, and the order survives reload and later login.
10. Active tasks support reversible sorting by creation date, priority, and title, defaulting to newest creation date first.
11. Completing a task moves it to Completed, applies muted styling, records completion time, and removes priority.
12. Completed tasks support reversible sorting by completion date, creation date, and title, defaulting to newest completion date first.
13. Completed tasks cannot be edited or deleted.
14. Reactivating a completed task clears completion time and returns it to Active at highest priority.
15. Logging out invalidates access to protected pages and returns the user to Login.
16. Users and tasks survive ordinary Docker Compose service restarts and container recreation through the PostgreSQL named volume.
17. The AI Dev Studio project is mapped to the canonical GitHub repository, and appropriate work is traceable through current GitHub issues and milestones.

AI Dev Studio may select its own unit, integration, component, or end-to-end testing strategy. This document prescribes the required outcomes, not a test-framework mandate.

## 12. Explicit exclusions

Do not add these features in the first version:

- Cloud deployment or production hosting
- Seeded or demo data
- Due dates or user-entered completion dates
- Audit logs, tracking history, or analytics
- Tags, categories, projects, or subtasks
- Search or filters beyond the specified sort controls and Active/Completed tabs
- Pagination or infinite scrolling
- Reminders or notifications
- Attachments or rich text
- Collaboration, task sharing, or multiple assignees
- Account verification, recovery, profile management, or deletion
- Administrative screens
- Social login or third-party integrations
- Elaborate branding or a UI component framework
- Prescribed performance, capacity, or multi-server targets
- A prescribed automated-test suite or test framework

## 13. Final decision record

- The deliverable is a discovery handoff, not an implementation request.
- The application is deliberately small and local-first.
- Server-side session authentication was selected over JWT authentication.
- Active and completed tasks use separate tabs and separate sorting behavior.
- Completion is reversible; reactivation returns a task at highest active priority.
- Completed tasks are read-only except for reactivation.
- Completion timestamps are required for Completed ordering and display; there is no historical tracking beyond the current timestamp.
- PostgreSQL data is volume-backed for reliable Docker persistence.
- The canonical repository is `https://github.com/prashant7163/tasks-list`, and the Studio project must be mapped to it.
- Appropriate project artifacts and delivery progress are tracked through GitHub issues and milestones without unnecessary duplicate documentation.
- No unresolved product questions remain within the stated scope.
