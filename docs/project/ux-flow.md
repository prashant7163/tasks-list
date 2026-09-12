# Personal Task List — UX Flow

## Purpose and status

This artifact defines the affected user flows and observable interaction states for the settled first-version scope. Statements under **Settled behavior** are requirements. Statements under **Implementation-neutral guidance** describe accessible interaction outcomes without prescribing components, routes, styling systems, or frontend architecture.

No new product features, external actions, visual branding, touch reorder, or implementation details are introduced here.

## 1. Navigation and session flow

### Settled behavior

| Starting state | User or system event | Result |
| --- | --- | --- |
| Unauthenticated | Open Sign Up or Login | Requested public authentication view opens. |
| Unauthenticated | Open protected task content | Login opens; protected content is not shown. |
| Authenticated | Open Sign Up or Login | The application may redirect to the protected task view. |
| Login | Submit valid credentials | A session is created and the protected task view opens on Active. |
| Any protected view | Log out | The session is invalidated and Login opens; protected content is no longer accessible. |
| Any protected view | Session is missing, invalid, or expires during a protected request | Login opens and protected content is no longer shown. |

The protected task view always exposes the signed-in user's display name, Logout, task-creation access, Active and Completed tabs, both tab counts, and independent sort controls for each tab. Active is the post-login landing tab.

### Implementation-neutral guidance

- Do not briefly reveal protected content while authentication state is being resolved; show a neutral loading state instead.
- When expiry interrupts an attempted action, return to Login with a concise session-ended message. Do not claim that an unconfirmed mutation succeeded.
- After logout or expiry, browser navigation back to a protected location must not restore usable protected content.

## 2. Registration and login

### Registration — settled behavior

1. Sign Up presents labeled Display name, Email, and Password fields and a submit action.
2. Blank or whitespace-only values are rejected at their fields. Email is trimmed and compared case-insensitively; there is no product-level email-format rule. Password strength or complexity rules are not added.
3. A normalized duplicate email is rejected without account creation using a clear “email already registered” error associated with Email.
4. Successful submission creates the account, creates no authenticated session, gives a success indication, and redirects to Login.
5. An unexpected failure leaves the user unauthenticated, preserves already entered non-secret values where safe, and shows a generic retry message without technical details.

### Login — settled behavior

1. Login presents labeled Email and Password fields and a submit action.
2. Blank required values receive field-level errors.
3. Any invalid email/password combination receives the same generic credentials error; the UI does not disclose whether an account exists.
4. Valid credentials create the session and open Active.
5. An unexpected failure shows a generic retry message and does not imply successful authentication.

### Implementation-neutral guidance

- On submit, prevent duplicate submissions while the request is pending and expose a textual pending state.
- Put validation summaries or action errors where they are encountered in reading order, associate field errors with their inputs, and move focus to the first invalid field or an actionable error summary.
- A registration success message may be presented on Login after redirect; its exact placement and timing are presentation choices as long as success is perceptible and no session is created.

## 3. Protected task-view frame

### Settled behavior

- Active and Completed are separate, mutually exclusive views; each shows only tasks of its status.
- Each tab label exposes its current count. Both counts update after create, delete, complete, and reactivate without a full-page reload.
- Each tab retains its own allowed sort controls. Changing sort affects presentation only and never changes saved priority.
- Timestamps are shown in a readable frontend-formatted form; creation time is immutable, and completion time appears only for Completed tasks.

### Shared list states

| State | Required observable result |
| --- | --- |
| Initial loading | Identify which task view is loading; do not show a false empty state or stale actions as current. |
| Loaded with tasks | Show the selected tab's tasks in its selected order with the fields and actions defined below. |
| Empty | State that the selected view has no tasks. Active retains clear creation access; Completed does not add creation or other features. |
| Mutation pending | Identify the affected action, prevent accidental repeat activation, and keep success unannounced until confirmed. |
| Mutation success | Reflect the authoritative returned state in the list and both counts without a full-page reload; provide a concise status announcement. |
| Recoverable error | Keep previously confirmed data intact and show a generic retry message associated with the failed action. |
| Not found / not owned | Use the same non-disclosing not-found presentation; do not reveal foreign task existence. |
| Invalid transition or stale state | Apply no apparent success; explain that the action could not be completed and refresh or reconcile to authoritative state. |

## 4. Active flow

### Active landing and list — settled behavior

Active defaults to **Creation date — newest first**. Each Active task exposes:

- a completion checkbox;
- title and description;
- creation date;
- Edit and Delete actions.

Creation access is visible from Active. Active task priority is unique and contiguous per user, with position 1 highest.

### Create — settled behavior

1. Open or use the add-task form.
2. Enter Title and Description. Both are required and nonblank; Title is at most 120 characters and Description at most 1,000.
3. Field violations are rejected with clear field-level errors. Backend errors remain authoritative even when the UI also validates early.
4. On success, the new task is Active with backend-assigned creation time and highest priority. The Active list and count update immediately without a full-page reload.
5. On failure, no success is shown and the previously confirmed list remains intact.

### Edit — settled behavior

1. Edit is available only for an Active task and exposes its current Title and Description.
2. The same required and maximum-length rules apply.
3. Save success updates Title and Description only; creation time and priority remain unchanged.
4. A validation or server failure keeps the edit recoverable and does not show unconfirmed values as saved.

### Delete confirmation — settled behavior

1. Delete is available only for an Active task and opens a confirmation dialog identifying the task clearly enough to avoid accidental deletion.
2. Cancel closes the dialog and leaves the task unchanged.
3. Confirm permanently deletes the task, closes any saved priority gap, updates the Active count, and closes the dialog after success.
4. A failure leaves the task present and the user informed; it must not look deleted.

### Complete — settled behavior

Selecting an Active task's completion checkbox requests completion. On success, the task leaves Active, receives a backend-assigned completion time, loses priority, appears in Completed, and both counts update. Title, description, creation time, and owner do not change. A failure restores or retains the checkbox's authoritative state and shows a retry message.

### Active sort — settled behavior

| Sort key | Directions |
| --- | --- |
| Creation date | Newest first; oldest first |
| Priority | Highest first; lowest first |
| Title | A–Z; Z–A, case-insensitive |

### Reorder — settled behavior and limitation

- Reorder is required **only** in Active when sort is **Priority — highest first**.
- In that view, a user presses and holds an Active task with the mouse, drags it up or down, and releases it at the intended position.
- A successful reorder visibly adopts the authoritative contiguous order and persists across reload and later login.
- A rejected reorder changes no saved positions; the UI restores or reloads the last confirmed order and presents a generic retry message.
- Other Active sorts, including **Priority — lowest first**, do not require drag-and-drop. Changing to another sort does not mutate priority.
- Touch reorder and a keyboard reorder mechanism are not specified. They must not be inferred as first-version requirements. This is a known interaction limitation of the settled scope; all non-reorder actions remain keyboard operable.

### Implementation-neutral guidance

- In the reorder-enabled view, visually and textually distinguish the draggable target and available drop position; mouse cancellation should leave order unchanged.
- Do not display a reorder affordance in views where reorder is unavailable, or clearly present it as unavailable rather than allowing a failed attempt.
- After create, edit, complete, delete, sort, or reorder, keep focus in a predictable nearby location and announce the confirmed outcome and updated count where relevant.

## 5. Completed flow

### Completed list — settled behavior

Completed defaults to **Completion date — newest first**. Completed tasks use muted grayscale styling that remains readable. Each task exposes title, description, creation date, completion date, and Reactivate. It has no priority and exposes no Edit or Delete action.

### Completed sort — settled behavior

| Sort key | Directions |
| --- | --- |
| Completion date | Newest first; oldest first |
| Creation date | Newest first; oldest first |
| Title | A–Z; Z–A, case-insensitive |

### Reactivate — settled behavior

1. Reactivate is the only mutation available for a Completed task.
2. On success, the task leaves Completed, becomes Active at highest priority, loses its completion time, and updates both tab counts. Title, description, creation time, and owner do not change.
3. A failure keeps the task in Completed and shows a generic retry message without suggesting success.

### Implementation-neutral guidance

- Read-only status must be conveyed through available actions and clear labeling, not by low contrast or disabled-looking content alone.
- After successful reactivation, focus may remain on the Completed context at the next logical control; the status announcement should identify that the task moved to Active so the user need not infer where it went.

## 6. Responsive behavior

### Settled behavior

Sign Up, Login, Active, and Completed remain readable and operable at ordinary desktop and mobile viewport sizes. Signed-in identity, Logout, tabs with counts, selected sort, creation access on Active, task content, and applicable actions remain reachable without a viewport-blocking layout failure.

On mobile-sized viewports, controls and task content may reflow or stack. Active and Completed remain distinct tabs; content is not removed merely to fit. Mouse drag-and-drop remains required only in the normal highest-first Priority view; mobile usability does not create a touch-reorder requirement.

### Implementation-neutral guidance

- Preserve a logical reading and focus order when content stacks. Avoid horizontal page scrolling for ordinary task content and controls; long text should wrap.
- Keep labels adjacent to their controls and actions distinguishable when rows become stacked cards.
- Do not rely on hover to reveal an action that must be reachable on touch-sized or keyboard-driven layouts.

## 7. Keyboard, focus, and accessible feedback

### Settled behavior

- All controls except the specifically mouse-only reorder interaction are reachable and operable by keyboard using conventional behavior.
- Every input and action has a clear accessible label. Visible focus is retained against all backgrounds and states.
- Active/Completed tabs communicate selected state, counts, and their relationship to the visible panel.
- Validation, success, loading, and failure feedback is available as text and does not rely on color alone.
- Completed muted styling retains readable contrast.
- The delete confirmation has a clear accessible name and exposes Cancel and Confirm without requiring pointer input.

### Implementation-neutral guidance

- Use semantic controls with expected Enter/Space behavior; maintain logical DOM and focus order across desktop and mobile layouts.
- If edit is presented in a dismissible surface, cancellation leaves the task unchanged.
- Keep focus within the delete confirmation while it is open. On close, return focus to Delete when the task remains, or to a logical nearby target when deletion succeeds.
- Announce asynchronous results without unexpectedly moving focus unless the next required correction would otherwise be missed.
- During form correction, preserve user-entered values except secrets where retention would be unsafe.
- During list changes, avoid resetting focus to the page start. If the focused task moves to another tab or is deleted, place focus on the next task, the prior task, the selected tab, or the empty-state/create control as context permits.

## 8. Interaction evidence checklist

Evidence should demonstrate the observable outcomes, not prescribe a test framework:

- public/protected routing, registration success without auto-login, duplicate registration, field validation, generic login failure, valid login, expiry, and logout;
- Active default, populated and empty states, create/edit validation and success, delete cancel/confirm/failure, completion, every sort direction, and both counts after mutations;
- mouse drag-and-drop success, persistence, and atomic failure recovery specifically in Priority — highest first, plus absence or unavailability of reorder in other sorts;
- Completed default, populated and empty states, readable muted styling, every sort direction, absence of edit/delete, and reactivation success/failure;
- loading, pending, success, not-found, invalid-transition, and generic retry states without stale or partial success;
- representative desktop and mobile widths, keyboard traversal and activation, visible focus, dialog focus behavior, labels, text-based feedback, and readable contrast.

## 9. Ambiguity record

No genuine unresolved product ambiguity was found in the settled source. Exact layout, whether create/edit uses an inline region or dialog, authenticated handling of public auth routes, success-message placement, focus destination among equivalent logical targets, and defensive size limits for registration fields remain implementation-neutral choices. None may change the required outcomes above or add product scope.
