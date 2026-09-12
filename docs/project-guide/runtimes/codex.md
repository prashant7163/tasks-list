# Codex-native runtime

Codex uses the repository's `AGENTS.md` and generated `.codex/agents/*.toml` role definitions. The interactive root task remains Orchestrator / Tech Lead; Python does not orchestrate agents. `studioctl` owns lifecycle validation and durable state.

Role authority and boundary IDs are defined in `shared/roles/capabilities.yaml`; `shared/roles/catalog.yaml` assigns those IDs to roles. They are Studio policy identifiers, not native Codex TOML fields. During project generation, the Codex adapter compiles their definitions into the required `developer_instructions` field and applies native runtime restrictions such as read-only sandboxes where applicable. Conformance rejects undefined IDs, wrong kinds or role assignments, missing agent files, and any generated instruction drift from the canonical policy.

Use native delegation only for independent work that benefits from a specialist, fresh-context Code Review, or Independent Audit. Keep task paths non-overlapping, return audit evidence only to the root Orchestrator, and reconstruct resumptions from project-local state rather than provider memory.

See the [operator handbook](../operator-handbook.md).
