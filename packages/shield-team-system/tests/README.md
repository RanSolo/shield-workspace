# tests

This folder contains focused framework checks.

Current coverage:

- `model-harness.test.mjs` verifies local-model role mapping, LM Studio native
  response parsing, and rejection of responses without an actionable message.
- `agent-boundaries.test.mjs` verifies that the core SHIELD prompt files encode
  the approved Hill, Daisy, and May boundaries plus evidence-based iteration.
- `mode-request.test.mjs` verifies that the mode-request protocol is encoded in
  the charter, the orchestrator and specialist prompts, the mission-mode docs,
  and the scorecard template.
- `manual-mode-select.test.mjs` verifies that manual character and mode
  selection are documented as an optional override that preserves the normal
  Hill-driven workflow.
- `backlog-refinement.test.mjs` verifies that backlog refinement is documented
  as a no-mutation planning playbook with clear Hill/Fury/Coulson
  responsibilities.
- `dynamic-mission-modes.test.mjs` verifies that the repo documents
  identity-vs-mode separation, per-seat mode attachments, and mission-record
  requirements for dynamic composition.
- `begin-mission-intake.test.mjs` verifies the canonical intake workflow,
  Mission Brief artifact, and the Hill/Coulson dispatch gate.
- `mission-policy.test.mjs` verifies executable mission decisions, fail-closed
  risk classification, timeout and specialist-dispatch gates, and Hill's closed
  evidence-based specialist-iteration eligibility.
- `delivery-mode.test.mjs` verifies the planned-work workflow, Definition of
  Ready, role boundaries, implementation gate, validation flow, and mode
  registration.
- `workspace-contract.test.mjs` verifies strict workspace input validation,
  GitHub content safety, risk handling, and deterministic PR body generation.
- `github-pr-workspace.test.mjs` verifies the injected command boundary,
  idempotent draft-PR creation and reuse, GitHub readback, and fail-closed
  behavior without calling GitHub or the network.
- `fury-plan-gate-v1.test.mjs` verifies the pure exact-binding Fury gate,
  bounded reconciliation, derived seats, replay/staleness handling, and hostile
  input safety.
- `delivery-workspace.test.mjs` verifies pre-command structural rejection,
  explicit `workspace_ready`, exact Fury eligibility, and unchanged PR reuse.
- `adapter-v1.test.mjs` verifies the closed host-neutral candidate and
  communication request contracts, exact revision identifiers, and stable
  failure reasons.
- `github-adapter-v1.test.mjs` verifies journal-gated GitHub delivery, exact-head
  publication through the existing PR workspace, and candidate-only evidence
  translation.
- `mission-record.test.mjs` verifies versioned mission and event schemas,
  deterministic policy-backed replay, chronology and sequence rules, and
  fail-closed validation of malformed or inherited records.
- `mode-runtime.test.mjs` verifies versioned mode manifests, deterministic
  exact-version registry construction, mission schema v2 integration, and
  isolated per-seat context resolution.
- `mission-journal.test.mjs` verifies closed journal entries, deterministic
  governance/execution replay, evidence projections, and recovery diagnostics.
- `journal-fs.test.mjs` verifies repository-confined JSONL persistence,
  single-writer locking, durable append/read behavior, and partial-tail safety.

Run the current checks with:

```bash
node --test tests/model-harness.test.mjs
node --test tests/agent-boundaries.test.mjs
node --test tests/mode-request.test.mjs
node --test tests/manual-mode-select.test.mjs
node --test tests/backlog-refinement.test.mjs
node --test tests/dynamic-mission-modes.test.mjs
node --test tests/mission-policy.test.mjs
node --test tests/begin-mission-intake.test.mjs
node --test tests/delivery-mode.test.mjs
node --test tests/workspace-contract.test.mjs
node --test tests/github-pr-workspace.test.mjs
node --test tests/fury-plan-gate-v1.test.mjs
node --test tests/delivery-workspace.test.mjs
node --test tests/adapter-v1.test.mjs
node --test tests/github-adapter-v1.test.mjs
node --test tests/mission-record.test.mjs
node --test tests/mode-runtime.test.mjs
node --test tests/mission-journal.test.mjs
node --test tests/journal-fs.test.mjs
```

Future coverage should add agent-prompt integrity, mode links, shell-script
behavior, stop conditions, and repository reference validation.
