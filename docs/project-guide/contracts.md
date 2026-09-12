# Project contracts

Generated JSON Schemas under `shared/contracts/` are the runtime-neutral contract surface. Pydantic is the Studio source, while generated projects validate artifacts with the committed schemas.

Core flow: Project Specification → Milestone Plan and Readiness → Task and Handoff → exact-snapshot Result and assurance records → Milestone Review and human approval. Journal, checkpoint, context manifest, trust, and incident records preserve recovery and governance.

## Role capabilities

`shared/roles/capabilities.yaml` is the canonical vocabulary for role authorities and boundaries. Every capability has a stable ID, kind, definition, executable agent instruction, enforcement mechanisms, and applicable roles. `shared/roles/catalog.yaml` may reference only registered IDs. Runtime adapters translate the same provider-neutral policy into their native configuration; for Codex, that means valid `developer_instructions` plus applicable sandbox restrictions. Do not add provider-specific authority fields to agent files or introduce an unregistered policy label.

Return to the [operator handbook](operator-handbook.md).
