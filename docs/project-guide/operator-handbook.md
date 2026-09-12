# Operator handbook

This handbook is the project-local operating guide for the Codex-native Studio workflow.

## First run

1. Run `./studioctl bootstrap`; it verifies the bundled wheel and lock, installs only the exact
   runtime dependency closure with the lock's artifact hashes, and records installed-file
   provenance. It uses an
   already installed compatible `uv`, never downloads `uv`, and requires approval before any
   dependency retrieval.
2. Run `./studioctl doctor` and resolve affected-scope blockers.
3. Initialize a new run or import a complete, digest-bound pre-native manifest.
4. Run `./studioctl status`, open the [discovery guide](discovery.md), and use the
   [first discovery prompt](first-discovery-prompt.md).
5. Keep the specification in draft until the application owner explicitly approves its exact
   digest. Use [Codex runtime guidance](runtimes/codex.md) for bounded role activation.

## Command walkthrough

```text
./studioctl bootstrap
./studioctl doctor
./studioctl run initialize --run-id run-one --idempotency-key init-one
./studioctl specification submit --file docs/project/specification.json --idempotency-key spec-one
./studioctl plan submit --file docs/project/plan.json --idempotency-key plan-one
./studioctl evidence submit --file evidence/doctor.json --idempotency-key evidence-doctor-one
./studioctl readiness submit --file docs/project/readiness.json --idempotency-key readiness-one
./studioctl status
./studioctl history --limit 20
./studioctl explain blocked ready --evidence-id blocker-resolution
./studioctl progress --limit 20
./studioctl task submit --file docs/project/task.json --idempotency-key task-one
./studioctl result submit --file docs/project/result.json --idempotency-key result-one
./studioctl gate submit --kind code-review --file docs/project/code-review.json --idempotency-key review-one
./studioctl gate submit --kind build-verification --file docs/project/build-status.json --idempotency-key build-one
./studioctl gate submit --kind quality-review --file docs/project/quality-report.json --idempotency-key quality-one
./studioctl gate submit --kind independent-audit --file docs/project/audit.json --idempotency-key audit-one
./studioctl gate submit --kind milestone-review --file docs/project/milestone-review.json --idempotency-key milestone-review-one
./studioctl run approve --milestone-review-id milestone-review-one --milestone-review-sha256 <sha256> --decision approved --decided-by <human-id> --idempotency-key approval-one
./studioctl checkpoint create --file docs/project/checkpoint.json --idempotency-key checkpoint-one
./studioctl resume --file docs/project/resume-marker.json --idempotency-key resume-one
./studioctl retry --file docs/project/retry.json --idempotency-key retry-one
./studioctl cancel --file docs/project/cancel.json --idempotency-key cancel-one
./studioctl control apply --file docs/project/control.json --idempotency-key control-one
./studioctl control clear --control-id control-one --file docs/project/control-clearance.json --idempotency-key clear-one
./studioctl trust apply --file docs/project/capability.json --idempotency-key trust-one
./studioctl incident apply --file docs/project/incident.json --idempotency-key incident-one
./studioctl retention --file docs/project/retention.json --idempotency-key retention-one
./studioctl projection-rebuild
./studioctl context-index-rebuild
./studioctl export-state exports/state
./studioctl export-review exports/review
./studioctl conformance
```

## Control commands

The root launcher exposes run management, governed submissions, inspection, recovery,
retention, exports, doctor, operator controls, capability trust, incidents, and conformance.
Every mutation takes explicit input and an idempotency key. The append-only journal is
authoritative; projections and indexes are disposable views rebuilt from it. Task results enter
`implementation_complete`; only the declared, ordered gate chain can mark the task complete.
Code-producing tasks use exactly Code Review, Build Verification, Quality Review, and Independent
Audit. Documentation-only tasks use exactly Documentation Review and Independent Audit; submit
the documentation review with `gate submit --kind documentation-review`.

Register every readiness input with `evidence submit` before the readiness artifact refers to
its exact project-relative locator and digest.

## Approval and recovery

Specification and milestone approval always require a human decision bound to the exact
artifact digest. A project-specific skill, expanded agent envelope, or external capability requires
its own approval. After interruption, create a fresh checkpoint, then resume from an explicit
marker. Only `safe` continues immediately; `conditional` requires named resolution evidence,
and `invalid` stops. A revision-required task cannot be resubmitted directly: use `retry` to
schedule a new numbered attempt within its budget. Active pause or stop-all controls also deny
resume and retry until exact human clearance.

## Evidence flow

Implementation evidence proceeds through independent Code Review, applicable Build Manager verification, Quality Engineering, Independent Audit to the Orchestrator, and finally user review. A changed executable candidate repeats affected gates. Audit findings never route directly to an implementer.

## Safety

Keep secrets outside repository and Studio state. Operator controls deny new consequential
side effects until exact human clearance. State and review exports are project-relative,
digest-bound, redacted, and symlink-safe. Retention is recoverable-only and restores any
tombstone that lacks a matching journal event.

See the [contract guide](contracts.md) for authoritative artifacts.
