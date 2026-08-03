# Issue #174 scope freeze

## Identity

- Mission: `mission:issue-174`
- Mission revision: `sha256:F83zJdbORCh9gIUGremVJrZPDpS9_gcYicWFsS_j4JQ`
- Subject: `github:RanSolo/shield-workspace/issue/174`
- Base revision: `d5bde71e969d9615decdd577aad2cb84132914df`
- Branch: `agent/issue-174-micro-context`
- Mode: Delivery
- Authorization: supervised and authorized

## Objective

Fix the interactive passcode prompt lifecycle while using disposable local Daisy and May runs to measure the smallest context packet that retains implementation quality.

## Frozen boundaries

1. Change only interactive stdin lifecycle behavior required by issue #174.
2. Do not change signer cryptography, evidence shapes, journal semantics, authorization classes, seat authority, dispatch contracts, or V0.3 sequencing.
3. Preserve `--passcode-stdin` behavior.
4. Do not reuse or overwrite the dirty primary checkout. The immutable implementation code baseline is `d5bde71e969d9615decdd577aad2cb84132914df`; mutable branch references are not authority.
5. Local Daisy and May output is non-authoritative specialist evidence. Hill checks it; Fury reviews the exact plan and implementation.
6. No implementation begins without a Fury-approved exact blueprint and explicit Wheels Up. No merge, deployment, or release is included.
7. Future Wheels Up evidence must name the corrected Fury-approved plan commit. May must fail closed unless HEAD equals that exact plan commit and the isolated worktree is clean.

## Exact implementation paths

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

Planning and experiment evidence remain under `docs/missions/issue-174-*`.
