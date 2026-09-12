# tasks-list

This project uses Agentic Development Studio's Codex-native Stage One workflow.

Bootstrap the pinned local runtime with `./studioctl bootstrap`, run
`./studioctl doctor`, then initialize or explicitly import a run. Inspect it with
`./studioctl status` and follow `docs/project-guide/first-discovery-prompt.md`. Bootstrap installs
the exact dependency closure with locked artifact hashes and doctor rechecks installed-file
provenance. Final milestone approval uses the explicit, digest-bound `./studioctl run approve`
command described in the operator handbook.
