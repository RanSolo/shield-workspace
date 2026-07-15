# tests

This folder contains focused framework checks.

Current coverage:

- `model-harness.test.mjs` verifies local-model role mapping, LM Studio native
  response parsing, and rejection of responses without an actionable message.
- `agent-boundaries.test.mjs` verifies that the core SHIELD prompt files encode
  the approved Hill, Daisy, and May boundaries along with the stuck protocol.
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
  risk classification, timeout and specialist-dispatch gates, and repair limits.
- `delivery-mode.test.mjs` verifies the planned-work workflow, Definition of
  Ready, role boundaries, implementation gate, validation flow, and mode
  registration.

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
```

Future coverage should add agent-prompt integrity, mode links, shell-script
behavior, stop conditions, and repository reference validation.
