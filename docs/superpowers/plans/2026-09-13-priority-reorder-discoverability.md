# Priority Reorder Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved priority the initial Active ordering and expose a clearly visible dedicated mouse drag grip, while preserving authoritative reorder behavior and reconciling completed GitHub issues.

**Architecture:** Keep the backend and reorder API unchanged. Change the frontend default sort, move drag-source ownership from the task card/wrapper to a dedicated grip while retaining wrapper drop zones, and verify behavior at unit and browser levels before performing evidence-backed issue transitions.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, Playwright 1.55, plain CSS, Spring Boot backend regression suite, Studio CLI, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-09-13-priority-reorder-discoverability-design.md`

## Global Constraints

- Active frontend default is exactly `{ key: 'priority', direction: 'asc' }`; Completed remains `{ key: 'completedAt', direction: 'desc' }`.
- Do not change the backend omitted-query default, REST contract, authorization, database schema, or transactional priority semantics.
- Only the visible grip initiates mouse dragging; the priority item remains the drop surface and task controls remain ordinary keyboard-operable controls.
- Keyboard and touch reorder remain outside scope.
- The grip target is at least 24×24 CSS pixels and its graphic has at least 3:1 contrast against its background.
- Preserve pending locks, status announcements, authoritative refresh, rollback, focus restoration, alternate sorts, empty state, reload, and later-login persistence.
- Do not persist credentials, sessions, CSRF values, private task content, or runtime user data in Studio or GitHub evidence.
- Do not modify or stage unrelated existing untracked Studio artifacts.

---

### Task 1: Active priority default and empty-state regression

**Files:**

- Modify: `frontend/src/tasks/TaskOrdering.test.jsx:82-123`
- Modify: `frontend/src/tasks/TaskPage.jsx:10-14`
- Modify: `frontend/src/tasks/PriorityTaskList.jsx:67-90`

**Interfaces:**

- Consumes: existing `TaskPage` calls `api.list(status, { key, direction })` and mounts `PriorityTaskList` only for confirmed Active `priority/asc`.
- Produces: initial Active request and controls use `priority/asc`; empty Active still renders `No active tasks yet.`

- [ ] **Step 1: Write failing default and empty-state tests**

Update the independent-default test so its initial assertions are:

```jsx
expect(await screen.findByLabelText('Sort Active tasks by')).toHaveValue('priority')
expect(screen.getByLabelText('Active sort direction')).toHaveValue('asc')
expect(api.list).toHaveBeenCalledWith('ACTIVE', { key: 'priority', direction: 'asc' })
expect(api.list).toHaveBeenCalledWith('COMPLETED', { key: 'completedAt', direction: 'desc' })
expect(screen.getByText(/Drag tasks to change priority/)).toBeInTheDocument()
```

Add a focused empty-state test:

```jsx
it('shows the Active empty state in the default Priority view', async () => {
  render(<TaskPage api={fakeApi([])} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (0)' })
  expect(screen.getByText('No active tasks yet.')).toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Reorder status' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/tasks/TaskOrdering.test.jsx
```

Expected: failure because Active still initializes to `createdAt/desc` and the default priority component has no explicit empty-state branch.

- [ ] **Step 3: Implement the minimal default and empty-state behavior**

Change `DEFAULT_SORTS` in `TaskPage.jsx`:

```jsx
const DEFAULT_SORTS = {
  ACTIVE: { key: 'priority', direction: 'asc' },
  COMPLETED: { key: 'completedAt', direction: 'desc' },
}
```

At the start of `PriorityTaskList` rendering, preserve the established copy:

```jsx
if (!tasks.length) return <p className="empty-copy">No active tasks yet.</p>
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
cd frontend
npm test -- --run src/tasks/TaskOrdering.test.jsx
```

Expected: all ordering tests pass with the new initial Active tuple and unchanged Completed default.

- [ ] **Step 5: Commit the independently testable default change**

```bash
git add frontend/src/tasks/TaskOrdering.test.jsx frontend/src/tasks/TaskPage.jsx frontend/src/tasks/PriorityTaskList.jsx
git commit -m "fix: default active tasks to saved priority"
```

---

### Task 2: Dedicated visible drag grip

**Files:**

- Modify: `frontend/src/tasks/TaskOrdering.test.jsx:125-268`
- Modify: `frontend/src/tasks/PriorityTaskList.jsx:16-85`
- Modify: `frontend/src/tasks/TaskList.jsx:7-10`
- Modify: `frontend/src/styles.css:53-62,72`

**Interfaces:**

- Consumes: `PriorityTaskList` state functions `dragStart`, `dragEnter`, `drop`, and `dragEnd`; existing `onReorder(orderedIds, draggedId, setMessage)` callback.
- Produces: one `.drag-handle[draggable="true"]` per enabled priority item; non-draggable wrapper/article; unchanged complete-ID reorder callback and wrapper drop behavior.

- [ ] **Step 1: Write failing tests for exclusive handle ownership**

Refactor existing drag tests to locate the handle from the item and add explicit assertions:

```jsx
const first = screen.getByRole('article', { name: 'First' })
const firstItem = first.closest('.priority-item')
const firstHandle = firstItem.querySelector('.drag-handle')
const secondItem = screen.getByRole('article', { name: 'Second' }).closest('.priority-item')

expect(firstHandle).toHaveAttribute('draggable', 'true')
expect(firstItem).not.toHaveAttribute('draggable')
expect(first).not.toHaveAttribute('draggable')

fireEvent.dragStart(first)
expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Ready to reorder')
expect(api.reorder).not.toHaveBeenCalled()

fireEvent.dragStart(firstHandle)
expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Picked up First')
fireEvent.dragEnter(secondItem)
fireEvent.drop(secondItem)
await waitFor(() => expect(api.reorder).toHaveBeenCalledWith([2, 1]))
```

Update every existing success, cancellation, pending, and rollback drag start to use `.drag-handle`; keep drag-enter/drop on `.priority-item`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd frontend
npm test -- --run src/tasks/TaskOrdering.test.jsx
```

Expected: failure because the wrapper/article are currently draggable and the decorative span owns no drag handlers.

- [ ] **Step 3: Move drag-source behavior to the grip**

Keep drop handlers on the wrapper, remove wrapper `draggable`, `onDragStart`, and `onDragEnd`, and render the grip as the source:

```jsx
<div
  key={task.id}
  className={`priority-item ${draggedId === task.id ? 'dragging' : ''} ${dropTargetId === task.id ? 'drop-target' : ''}`}
  onDragEnter={() => dragEnter(task.id)}
  onDragOver={(event) => event.preventDefault()}
  onDrop={drop}
>
  <span
    className="drag-handle"
    draggable={!disabled}
    aria-hidden="true"
    title={`Drag ${task.title} to change priority`}
    onDragStart={(event) => dragStart(event, task)}
    onDragEnd={dragEnd}
  >
    <span className="drag-handle-icon">⠿</span>
  </span>
  <TaskCard task={task} status="ACTIVE" disabled={disabled} {...actions} />
</div>
```

Retain the existing `TaskCard` ref callback in the actual implementation. Remove `dragEnabled` from `TaskCard` parameters and remove its `draggable` attribute:

```jsx
export const TaskCard = forwardRef(function TaskCard({ status, task, disabled, onEdit, onDelete, onComplete, onReactivate }, ref) {
  return <article ref={ref} tabIndex="-1" className={`task-card ${status === 'COMPLETED' ? 'completed' : ''}`} aria-label={task.title}>{/* existing body */}</article>
})
```

- [ ] **Step 4: Style a bounded, high-contrast grip**

Replace whole-item cursor rules with dedicated grip styling:

```css
.priority-item { position: relative; min-width: 0; border-radius: 0.85rem; }
.priority-item .task-card { padding-left: 4.75rem; }
.priority-list.pending .drag-handle { cursor: wait; opacity: 0.65; }
.drag-handle {
  position: absolute;
  z-index: 1;
  left: 1rem;
  top: 1rem;
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  color: #173e30;
  background: #e8eeea;
  border: 1px solid #899e93;
  border-radius: 0.55rem;
  cursor: grab;
  user-select: none;
}
.drag-handle:active { cursor: grabbing; }
.drag-handle-icon { font-size: 1.4rem; line-height: 1; }
```

At the mobile breakpoint, keep the 2.5rem target and adjust only positioning/padding so it does not overlap the one-column card content.

- [ ] **Step 5: Run focused and full frontend unit tests**

Run:

```bash
cd frontend
npm test -- --run src/tasks/TaskOrdering.test.jsx
npm test -- --run
```

Expected: focused ordering tests and the complete frontend suite pass with no warnings or unhandled errors.

- [ ] **Step 6: Commit the independently testable grip change**

```bash
git add frontend/src/tasks/TaskOrdering.test.jsx frontend/src/tasks/PriorityTaskList.jsx frontend/src/tasks/TaskList.jsx frontend/src/styles.css
git commit -m "fix: expose a dedicated task drag grip"
```

---

### Task 3: Browser and exact-candidate regression verification

**Files:**

- Modify: `frontend/e2e/tasks.spec.js:28-155`
- Create: `docs/project/execution/ux-priority-reorder-test-evidence-attempt-1.json`

**Interfaces:**

- Consumes: `.drag-handle`, `.priority-item`, Active `priority/asc` default, unchanged REST endpoints, and existing Compose/Playwright configuration.
- Produces: exact-candidate unit, build, backend-regression, desktop-drag, mobile-layout, persistence, rollback, target-size, contrast, and overflow evidence.

- [ ] **Step 1: Write failing browser expectations before relying on the new UI**

Change the initial browser assertions and add concrete grip checks:

```js
await expect(page.getByLabel('Sort Active tasks by')).toHaveValue('priority')
await expect(page.getByLabel('Active sort direction')).toHaveValue('asc')
const grips = page.locator('.drag-handle')
await expect(grips).toHaveCount(3)
const firstGrip = grips.first()
const box = await firstGrip.boundingBox()
expect(box.width).toBeGreaterThanOrEqual(24)
expect(box.height).toBeGreaterThanOrEqual(24)
await expect(firstGrip).toHaveCSS('cursor', 'grab')
await expect(page.getByRole('article').first()).not.toHaveAttribute('draggable', 'true')
```

Retain alternate sort coverage, but remove now-redundant steps that select Priority/highest-first immediately after login, reload, or later login.

- [ ] **Step 2: Run the browser test and verify the old snapshot fails**

Run against the pre-implementation commit or use the Task 1 RED evidence:

```bash
cd frontend
npm run test:e2e -- --project=desktop-chromium --grep "full task ordering journey"
```

Expected before Tasks 1–2: failure on the Active default or dedicated handle assertions.

- [ ] **Step 3: Complete the browser test for supported viewports**

Calculate contrast from computed foreground/background RGB values in the test and assert a ratio of at least `3`. Keep the existing desktop mouse reorder, reload, later-login persistence, rejected-reorder restoration, focus, and horizontal-overflow checks. On the mobile project, assert layout and grip visibility but continue skipping touch reorder.

- [ ] **Step 4: Run exact-candidate verification**

Run:

```bash
cd frontend
npm test -- --run
npm run build
npm run test:e2e
cd ../backend
./mvnw -q -Dtest=TaskOrderingIntegrationTest test
```

Expected: all frontend unit tests, production build, all configured Playwright projects, and backend ordering regression tests pass.

- [ ] **Step 5: Record redacted exact-candidate evidence**

Record command, outcome, environment identity, candidate commit/tree or archive digest, grip size/contrast measurements, supported viewport results, exclusions, and no private runtime data in `docs/project/execution/ux-priority-reorder-test-evidence-attempt-1.json`; submit it with `./studioctl evidence submit` before any gate references it.

- [ ] **Step 6: Commit browser coverage and evidence**

```bash
git add frontend/e2e/tasks.spec.js docs/project/execution/ux-priority-reorder-test-evidence-attempt-1.json
git commit -m "test: verify priority drag discoverability"
```

---

### Task 4: Ordered assurance and GitHub issue reconciliation

**Files:**

- Create: `docs/project/execution/review-frontend-priority-reorder-attempt-1.json`
- Create: `docs/project/execution/build-frontend-priority-reorder-attempt-1.json`
- Create: `docs/project/execution/quality-frontend-priority-reorder-attempt-1.json`
- Create: `docs/project/execution/audit-frontend-priority-reorder-attempt-1.json`
- Create: `docs/project/execution/ux-priority-reorder-github-reconciliation.json`

**Interfaces:**

- Consumes: exact frontend candidate and accepted prior Milestone 2/3 review, gate, checkpoint, PR, and merge evidence.
- Produces: ordered Code Review → Build Verification → Quality Review → Independent Audit results, plus idempotent issue comments/state transitions for #4–#7.

- [ ] **Step 1: Run the independent ordered gates**

Dispatch distinct Code Reviewer, Build Manager, Quality Engineer, and Independent Auditor identities. Submit accepted results in this order:

```bash
./studioctl gate submit --kind code-review --file docs/project/execution/review-frontend-priority-reorder-attempt-1.json --idempotency-key review-frontend-priority-reorder-attempt-1
./studioctl gate submit --kind build-verification --file docs/project/execution/build-frontend-priority-reorder-attempt-1.json --idempotency-key build-frontend-priority-reorder-attempt-1
./studioctl gate submit --kind quality-review --file docs/project/execution/quality-frontend-priority-reorder-attempt-1.json --idempotency-key quality-frontend-priority-reorder-attempt-1
./studioctl gate submit --kind independent-audit --file docs/project/execution/audit-frontend-priority-reorder-attempt-1.json --idempotency-key audit-frontend-priority-reorder-attempt-1
```

If any gate rejects the candidate, stop, record the finding, and use the Studio retry flow; do not close #7.

- [ ] **Step 2: Read current issue state immediately before mutation**

```bash
gh issue view 4 --repo prashant7163/tasks-list --json number,state,comments,url
gh issue view 5 --repo prashant7163/tasks-list --json number,state,comments,url
gh issue view 6 --repo prashant7163/tasks-list --json number,state,comments,url
gh issue view 7 --repo prashant7163/tasks-list --json number,state,comments,url
```

Expected: use live state, not the earlier readback, to avoid duplicate comments or invalid transitions.

- [ ] **Step 3: Reconcile completed issues with concise evidence comments**

For each still-open issue, add one redacted completion comment and close it:

```bash
gh issue close 4 --repo prashant7163/tasks-list --comment "Completed in merged PR #9 (merge 1281b38). Studio Milestone 2 final review and accepted backend lifecycle review/build/quality/audit evidence confirm the owner-scoped transactional REST task is complete."
gh issue close 5 --repo prashant7163/tasks-list --comment "Completed in merged PR #9 (merge 1281b38). Studio Milestone 2 final review and accepted frontend lifecycle review/build/quality/audit evidence confirm the Active/Completed lifecycle UI is complete."
gh issue close 6 --repo prashant7163/tasks-list --comment "Completed in merged PR #10 (merge b976725). Studio Milestone 3 final review and accepted backend ordering review/build/quality/audit evidence confirm typed sorting and atomic contiguous reorder are complete."
fix_ref=$(git rev-parse HEAD)
gh issue close 7 --repo prashant7163/tasks-list --comment "Completed by commit ${fix_ref}: Active now opens Priority/highest-first, each task exposes a dedicated visible mouse grip, and exact-candidate unit/build/browser/backend-regression plus ordered Studio gates passed in Studio run ux-priority-reorder-discoverability."
```

If an issue is already closed with equivalent evidence, do not add a duplicate comment.

- [ ] **Step 4: Read back and record final issue state**

```bash
gh issue list --repo prashant7163/tasks-list --state all --limit 20 --json number,title,state,milestone,url,updatedAt
```

Record the exact issue URLs, final states, non-sensitive evidence references, and idempotency outcomes in `docs/project/execution/ux-priority-reorder-github-reconciliation.json`, then submit it as supporting evidence.

- [ ] **Step 5: Run final Studio status and repository checks**

```bash
./studioctl status
./studioctl doctor
git status --short
git log --oneline -8
```

Expected: Studio reflects accepted ordered gates and no unresolved blocker; only intended files are staged/committed, while unrelated pre-existing untracked artifacts remain untouched.

---

## Execution strategy

Use subagent-driven execution because the repository mandates distinct implementer, Code Reviewer, Build Manager, Quality Engineer, and Independent Auditor identities. Tasks are sequential where they share frontend files; assurance roles receive the exact candidate only after implementation is complete. The Orchestrator alone performs GitHub reconciliation after accepted audit evidence.
