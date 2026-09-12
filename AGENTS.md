# Codex-native Studio instructions

The root Codex task is the Orchestrator / Tech Lead. Treat `studio.yaml`, `shared/`, approved project artifacts, and `studioctl` state as authoritative. Provider threads and conversation history are trace context only.

- Run `./studioctl status` before work and use `./studioctl explain` before lifecycle transitions.
- Dispatch only approved, ready, non-overlapping tasks with minimum necessary context.
- Use the role definitions under `.codex/agents/`; activate only materially affected roles.
- Keep implementer, Code Reviewer, and Independent Auditor identities distinct.
- Route Independent Audit results only to the Orchestrator; only the Orchestrator assigns remediation.
- Redact before persistence or outbound use. Never place credentials in Studio state.
- Stop at exact human approval boundaries. No model, timeout, test, or provider state creates approval.
- Record exact-snapshot evidence and leave a durable safe-resume marker before ending work.
