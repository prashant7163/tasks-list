# Priority Reorder Discoverability Design

**Status:** Approved design; pending exact-specification review  
**Studio run:** `ux-priority-reorder-discoverability`  
**Owner:** Application Owner  
**Baseline:** Merged `master` at `b97672580313c79124f5fe1bf0155536a1e90181`

## Desired outcome

Active tasks open in saved priority order, highest priority first, with an unmistakable mouse drag grip on every reorderable task. Users can immediately see how to change priority without first discovering a particular sort combination. Completed tasks continue to open by completion date, newest first.

## Root cause

The current frontend initializes Active sorting as `createdAt/desc`, while it mounts the reorderable list only for `priority/asc`. The drag affordance therefore does not exist on initial load. When it does render, the affordance is an absolutely positioned, low-emphasis `⋮⋮` glyph marked `aria-hidden`; the entire task item is draggable and carries the grab cursor, so the glyph is decorative rather than a dedicated drag origin. Existing tests assert the old default and exercise dragging through draggable ancestors, but do not prove handle visibility or exclusivity.

## Users and journey

The affected persona is the existing personal task-list user.

1. Open the protected task view or sign in.
2. Land on Active with `Priority` and `Highest first` selected.
3. See active tasks in ascending numeric priority and a visible grip on each task.
4. Press and hold a grip, drag the task to another position, and release.
5. Receive the existing saving, success, cancellation, or restoration feedback.
6. Reload or sign in later and see the authoritative saved order.
7. Select another Active sort when desired; reordering and grips disappear outside Priority highest-first.
8. Open Completed and retain its `Completion date` and `Newest first` default.

## Scope

Included:

- Change only the frontend Active default tuple to `{ key: 'priority', direction: 'asc' }`.
- Keep the Completed default `{ key: 'completedAt', direction: 'desc' }` and independent per-tab sort state.
- Make a visible grip the sole mouse drag source while retaining each priority item as a drop target.
- Preserve the current mouse-only interaction boundary, status announcements, pending locks, failure rollback, authoritative refresh, focus restoration, API payload, and persisted ordering behavior.
- Preserve the Active empty state when the priority list is mounted by default.
- Add unit and browser regression coverage for defaults, grip discoverability, exclusive drag initiation, alternate sorts, persistence, and rollback.
- Reconcile open GitHub issues #4 through #7 against exact completed or new evidence.

Excluded:

- Backend, REST, authorization, database, migration, or priority-invariant changes.
- Changing the backend default used when sort query parameters are omitted.
- New sort choices or persistence of a user's last presentation sort.
- Keyboard, touch, or native-mobile reordering.
- A UI framework, broad card redesign, generic drag-and-drop abstraction, or unrelated accessibility refactor.
- Rewriting prior approved Milestone 2 or Milestone 3 snapshots.

## Architecture and contracts

This is a frontend presentation and pointer-interaction refinement. `TaskPage` continues to send explicit typed sort tuples, so initial Active data will be requested as `GET /api/tasks?status=ACTIVE&sort=priority&direction=asc`; initial Completed data remains `GET /api/tasks?status=COMPLETED&sort=completedAt&direction=desc`. The backend's omitted-query default remains unchanged.

`PriorityTaskList` retains its existing `onReorder(orderedIds, draggedId, setMessage)` callback and authoritative reconciliation flow. The grip owns `draggable`, `dragstart`, and `dragend`; the surrounding priority item retains `dragenter`, `dragover`, and `drop`. `TaskCard` and its article are not draggable, ensuring checkbox, Edit, Delete, and content interactions cannot accidentally initiate a reorder.

No public API, database schema, persisted-data semantic, authorization rule, or trust boundary changes. Browser-provided task IDs remain untrusted input and the server continues to validate the complete owner-scoped active-task set transactionally.

This specification supersedes only the prior `task-sorting-active` frontend-default clause that said Active initially uses creation newest-first. It preserves all other approved Milestone 3 sorting, priority, mouse-only, reconciliation, and persistence requirements.

## Interaction and visual behavior

- Each reorderable Active task has one dedicated, clearly bounded grip.
- The grip is at least 24 by 24 CSS pixels; approximately 44 by 44 pixels is preferred where layout permits.
- Its graphic has at least 3:1 contrast against the card background. Any visible instructional text retains at least 4.5:1 contrast.
- The grip uses `cursor: grab` and `cursor: grabbing`; the rest of the card does not advertise drag behavior.
- The grip is not presented as a button because keyboard reorder is outside scope.
- Existing visible “Mouse only” guidance remains and is associated with the priority list where practical.
- Disabled or pending state prevents drag initiation and communicates that state without exposing a misleading active grip.
- Alternate Active sorts, Priority lowest-first, and Completed show neither a grip nor reorder guidance.
- Desktop and mobile layouts retain readable content, unobstructed task controls, visible focus, and no horizontal overflow. Mobile does not imply touch reorder.

## Requirements and acceptance criteria

### Active default priority

- The initial Active request uses exactly `status=ACTIVE`, `sort=priority`, and `direction=asc`.
- Active controls initially show `Priority` and `Highest first`.
- Active initially renders the reorder guidance and one grip per task without a sort interaction.
- Tasks render in the ascending priority order returned by the backend.
- A newly created or reactivated task remains visibly highest priority after authoritative refresh.

### Completed default preserved

- The initial Completed request remains `status=COMPLETED`, `sort=completedAt`, and `direction=desc`.
- Completed controls initially show `Completion date` and `Newest first`.
- Active and Completed sort changes remain independent.

### Dedicated mouse drag grip

- Only a task's grip has `draggable="true"`; neither the priority wrapper nor task article is draggable.
- Starting a drag from task content, completion checkbox, Edit, or Delete does not initiate a reorder.
- Grip drag from one item to another submits the complete reordered task-ID list exactly once.
- Cancelling a grip drag submits no reorder request and clears drag presentation.
- Reordering remains unavailable outside Active Priority highest-first.
- The grip meets the target-size, contrast, cursor, and non-overlap requirements above.

### Existing behavior preserved

- Pending load or mutation state prevents conflicting actions and drag initiation.
- Successful reorder reloads authoritative lists and counts, reports success, and restores stable focus.
- Rejected or stale reorder reloads the authoritative order and reports restoration without showing a partial local state.
- Saved priority order survives reload and later login through the unchanged API.
- An empty Active list displays its existing empty-state copy rather than a blank list.

### Verification

- Frontend unit tests first fail for the old Active default and ancestor-driven drag behavior, then pass after the change.
- The complete frontend unit suite and production build pass on the exact candidate.
- Existing backend ordering regression tests pass, proving no contract regression.
- Desktop Chromium browser verification proves visible grip, successful grip drag, persistence, and rollback.
- Representative mobile-width verification proves readability, grip layout, and absence of horizontal overflow without claiming touch reorder.
- Computed-style or equivalent evidence confirms the minimum target size and contrast values.

## GitHub reconciliation

Issue updates are idempotent and based on a fresh read immediately before mutation.

- Close #4 with Milestone 2 final review/checkpoint, accepted backend lifecycle gates, merged PR #9, and merge commit `1281b38` evidence.
- Close #5 with Milestone 2 final review/checkpoint, accepted frontend lifecycle gates, merged PR #9, and merge commit `1281b38` evidence.
- Close #6 with Milestone 3 final review/checkpoint, accepted backend ordering gates, merged PR #10, and merge commit `b976725` evidence.
- Update #7 to record this discoverability regression and the superseding Active-default decision. Keep it open until the new exact candidate passes review, build, quality verification, and independent audit; close it only with the fix and verification evidence.
- If an issue is already closed at mutation time, verify its evidence instead of duplicating comments or transitions.

No credentials, session identifiers, CSRF values, private task content, or runtime user data may be persisted in Studio or GitHub evidence.

## Risks and mitigations

- A nested draggable element could leave ancestor dragging enabled. Remove draggable behavior from the wrapper/article and test both permitted and forbidden drag origins.
- Defaulting to the priority list could hide the empty state. Render and test the established Active empty-state copy.
- Moving drag events could break drop targeting or focus restoration. Keep wrapper drop handlers and existing article refs, then exercise success, cancellation, and failure paths.
- A stronger grip could overlap content at narrow widths. Verify both desktop and mobile breakpoint layouts.
- Visual emphasis alone might remain insufficient. Record computed target dimensions and contrast rather than relying on subjective inspection.
- The new default could disturb confirmed-sort race protection. Retain and rerun stale-load and rejected-load tests.
- GitHub state may change during implementation. Read live state immediately before each idempotent reconciliation action.

## Affected files

Expected production changes:

- `frontend/src/tasks/TaskPage.jsx`
- `frontend/src/tasks/PriorityTaskList.jsx`
- `frontend/src/tasks/TaskList.jsx`
- `frontend/src/styles.css`

Expected test changes:

- `frontend/src/tasks/TaskOrdering.test.jsx`
- `frontend/e2e/tasks.spec.js`

Governance and evidence files will be run-specific under `docs/project/` and `docs/superpowers/`. No backend production file is expected to change.

## Settled decisions

- Lower numeric priority remains higher priority; the frontend Active default is therefore Priority ascending.
- Completed remains completion-date descending by default.
- The grip is the sole mouse drag origin and the task item remains the drop surface.
- Mouse-only reorder remains intentional; keyboard and touch reorder are not implied.
- Existing backend ordering and reorder contracts are sufficient and remain authoritative.
- Existing announcements and failure reconciliation remain unchanged.
- The smallest sufficient mutation is preferred; broader persistence, framework, or backend work requires a new approval boundary.

## Open questions

None.
