# Issue #162 — proportionate corrective plan

## Exact mission identity

- Lane: Bravo Lane Hill correction 2
- Mission: `mission:issue-162-bravo-correction-2`
- Subject: `github:RanSolo/shield-workspace/issue/162`
- Worktree: `/private/tmp/shield-162-bravo.yMZTJ7`
- Branch: `agent/issue-162-tdd-intent`
- Preserved implementation revision: `87c889769093fe000d4bb0ef45c1da80bdb6f321`
- Preserved implementation tree: `4053d95c87485d55c99e2c92ab1d27d229e25b74`
- Corrective brief: `docs/missions/issue-162-tdd-intent-corrective-brief.json`
- Original plan: `docs/missions/issue-162-tdd-intent-plan.md`

This revision replaces the oversized correction-1 execution route. It preserves
the original implementation and all Fury/Mack evidence as historical input; it
does not retrospectively authorize prior commits. The plan grants no production
edit, test rewrite, publication, merge, deployment, release, final acceptance,
or human decision.

## Preserved evidence and useful implementation

- Preserved implementation: eight issue #162 commits ending at `87c8897...`.
- Mack evidence at that exact revision: focused `35/35`, Nx build PASS, full Nx
  test `1224/1224`, combined exit `0`.
- Fury complete conformance verdict at that revision: `REVISE`, eleven findings.
- Useful behavior retained: risk-selected strategy, criterion traceability,
  packet-size limits, reviewed Red classification, scaffold-not-PASS,
  amendment evidence, authority-gated Green, optional separate Refactor,
  immutable decision output, stable reason codes, public package export, and
  exact-evidence foundations.

Prior mission journals and correction-1 planning commits remain evidence only.
Correction-2 requires exact-plan Fury PASS and fresh Coulson authority before
May may edit production code or tests.

## Proportionate scope

Correct only the seven defects that directly prevent the original frozen
AC-162-4 through AC-162-6 behavior from being truthful and complete:

| Finding | Original intent | Required result |
| --- | --- | --- |
| F6 | Acceptance-contract identity and stale-evidence closure | Derive the digest canonically from behavior-bearing contract content and reject caller substitution |
| F3 | Expectation amendment gate | A complete amendment enters generation `N+1` and can complete only with fresh strategy/Red, authority, and downstream evidence |
| F4 | Bounded Green and focused validation | Enforce observed paths/effects and exact configured checkpoint/command evidence |
| F7 | Separate Green and Refactor | Require distinct exact authority and focused proof for Green and optional Refactor |
| F2 | Exact terminal routing | Final cumulative Mack and Fury receipts equal the current mission HEAD/tree |
| F8 | Truthful executable evidence | Contradictory PASS exit/count combinations fail closed |
| F11 | Public package contract | Document `/tdd-mission` and prove documentation/export agreement |

AC-162-1 through AC-162-3 receive regression coverage only. No existing useful
behavior is redesigned merely to support the correction.

## Explicit exclusions

- F5 hosted-Mack producer/store/readback or any other durable-Mack platform
  capability; #162 remains the pure evaluator slice and does not enter #247.
- Generalized F9 runtime/model/executor domain hardening or pairwise-identity
  policy beyond preserving existing exact metadata checks.
- Generalized F10 hostile proxy hardening beyond preserving existing immutable
  input and revoked-proxy behavior.
- A runner, mission journal store, CLI, UI, new test framework, model invocation,
  Guided QA #238, external effect executor, or unrelated cleanup.
- Publication execution, PR creation/update, external communication, merge,
  deployment, release, final acceptance, or changed/removed expectations.

F1 is not a product packet. It is satisfied operationally only by this fresh
mission, exact-plan Fury PASS, fresh Coulson Wheels Up, and current May binding.

## Contract boundaries shared by all packets

- Keep `tdd.mission.v1` pure, host-neutral, deterministic, side-effect-free,
  non-authoritative, and backwards compatible for valid existing fixtures.
- Preserve closed shapes, stable reason codes, frozen outputs, seat ownership,
  one-to-three criterion packet policy, and original amendment/Fitz gates.
- Use the repository's existing canonical JSON and SHA-256 conventions. The
  acceptance digest excludes evidence IDs, outcomes, and repository revisions.
- A test change may add the reviewed regression contract; it may not weaken or
  remove an expectation. Any changed/removed expectation stops for Fitz.
- Each packet receives complete Fury review after focused Mack validation. Fury
  review has no finding-count cutoff.

## Dependency-ordered behavioral packets

### Packet A — acceptance identity and amendment re-entry (F6 + F3)

- Acceptance criteria: AC-162-4 and AC-162-6.
- Invariant: behavior-bearing acceptance material has one content-derived
  identity, and amendments complete only through a fresh generation.
- Paths:
  - `packages/shield-team-system/src/tdd-mission-v1.mts`
  - `packages/shield-team-system/tests/tdd-mission-v1.test.mjs`
- Required behavior:
  - compute a framed canonical SHA-256 digest from normalized criterion and
    packet material;
  - reject a supplied/reviewed digest that does not match;
  - bind strategy, Red/declined strategy, authority, Green, Refactor, Mack,
    Fury, and disposition evidence to one nonnegative generation;
  - invalidate generation `N` receipts after amendment and allow both selected
    and declined strategies to complete through valid fresh `N+1` evidence.
- Focused proof: golden digest, permitted set reordering, behavior-bearing
  mutation, selected amendment re-entry, declined amendment re-entry, and stale
  generation substitution.
- Stop: changing the original Fitz gate or hashing evidence outcomes/IDs.
- Successor: complete focused Mack evidence, complete Fury packet review, then B.

F6 and F3 are coupled because generation freshness is defined by the same
content-derived acceptance identity; splitting them would create a temporary
caller-selected generation boundary.

### Packet B — bounded execution and distinct transition proof (F4 + F7)

- Acceptance criteria: AC-162-2 and AC-162-5.
- Invariant: Green and optional Refactor are separate exact transitions whose
  observed scope and validation are enforced by the packet contract.
- Paths: Packet A source and focused-test paths only.
- Required behavior:
  - represent focused validation as closed checkpoint/command entries;
  - require unique observed paths/effects to remain within packet bounds;
  - require executed checkpoint and command identity to match the packet;
  - require distinct Green and Refactor authority plus focused Mack proof;
  - preserve cumulative validation as a separate terminal stage.
- Focused proof: path/effect/command/checkpoint substitution, missing or replayed
  authority, Green-as-Refactor proof reuse, and valid Green-only/Green+Refactor
  flows.
- Stop: adding an executor or treating evaluator evidence as authority.
- Successor: complete focused Mack evidence, complete Fury packet review, then C.

F4 and F7 are coupled because the packet contract is the authority and proof
boundary for both transitions.

### Packet C — exact terminal closure and truthful outcomes (F2 + F8)

- Acceptance criterion: AC-162-6.
- Invariant: mission completion uses truthful executable evidence bound to the
  exact final HEAD and tree.
- Paths: Packet A source and focused-test paths only.
- Required behavior:
  - require cumulative Mack and Fury receipts at `headRevisionId` and
    `headTreeDigest`;
  - retain packet Green/Refactor revisions as traceability rather than treating
    them as final mission HEAD;
  - for PASS require exit `0`, no failed/cancelled tests, nonnegative counts,
    and an internally consistent total;
  - reject later-HEAD, tree substitution, bad sums, negative counts, and
    contradictory outcome/exit combinations.
- Focused proof: current exact final evidence completes; every listed stale or
  contradictory variant blocks deterministically.
- Stop: requiring a durable hosted-Mack store or changing runtime topology.
- Successor: complete focused Mack evidence, complete Fury packet review, then D.

F2 and F8 are coupled because both close the eligibility semantics of the same
terminal validation receipts.

### Packet D — public contract documentation (F11)

- Acceptance criterion: AC-162-6.
- Invariant: supported package exports and documented public specifiers agree.
- Paths:
  - `packages/shield-team-system/PUBLIC_API.md`
  - `packages/shield-team-system/tests/package-surface.test.mjs`
- Required behavior: document `@shield/team-system/tdd-mission` as a pure,
  host-neutral, non-authoritative evaluator with no signing, append, dispatch,
  test execution, publication, or human-decision effect; add executable
  documentation/export agreement coverage.
- Focused proof: package-surface test passes against the current build.
- Stop: package export or wrapper redesign; those already exist.
- Successor: cumulative exact-head Mack validation, then full Fury conformance.

## Validation contract

For Packets A-C, use:

1. `npm exec nx run @shield/team-system:build`
2. `node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs`

For Packet D, use:

1. `npm exec nx run @shield/team-system:build`
2. `node --test packages/shield-team-system/tests/package-surface.test.mjs`

At the exact final implementation HEAD, Mack independently runs:

1. `node --test packages/shield-team-system/tests/tdd-mission-v1.test.mjs`
2. `npm exec nx run @shield/team-system:build`
3. `npm exec nx run @shield/team-system:test`
4. exact branch/HEAD/tree, changed-path, and tracked-clean checks.

Record commands, cwd, exact start/end HEAD and tree, exit codes, available test
counts, cache disposition only when emitted, runtime/model/executor identity,
packet/criterion references, and source references. Focused PASS routes to a
complete Fury review of that packet. Final Mack PASS routes to complete Fury
conformance. Fury `REVISE` routes unchanged-scope corrections through the
smallest affected packet and fresh evidence.

## Fresh implementation authority envelope

- Base revision: `87c889769093fe000d4bb0ef45c1da80bdb6f321`.
- Authority HEAD: the exact Fury-approved commit containing this brief and plan.
- Approved paths:
  - `packages/shield-team-system/PUBLIC_API.md`
  - `packages/shield-team-system/src/tdd-mission-v1.mts`
  - `packages/shield-team-system/tests/package-surface.test.mjs`
  - `packages/shield-team-system/tests/tdd-mission-v1.test.mjs`
- Actions: `repository.git_commit`, `repository.run_validation`,
  `repository.write_file`.
- Effect classes: `behavioral_implementation`, `coordination`, `verification`.
- Effect keys: `effect:issue-162:implementation`,
  `effect:issue-162:packet-commits`, `effect:issue-162:validation`.
- Capabilities: `filesystem_write`, `git_write`, `process_execute`.
- May model/runtime/executor: `gpt-5.6-sol`,
  `runtime:codex-hosted-may-sol`,
  `executor:codex-hosted-workspace-tools`.
- Validation IDs: `validation:issue-162:focused-node-test`,
  `validation:issue-162:nx-build`, `validation:issue-162:nx-test`.

The one-passcode preparation may include only the exact two corrective planning
artifacts as initial draft-review publication paths because the supported
command derives that authority. No publication request or external effect is
part of this mission, and that dormant authority does not permit implementation
HEAD publication, PR updates, ready-for-review, merge, deployment, or release.

## Stop conditions

Stop before implementation for a non-PASS exact-plan Fury verdict, missing or
stale Coulson authority, wrong root/branch/HEAD, plan digest drift, unexpected
tracked changes, runtime substitution, scope widening, or any need to enter the
excluded F5/F9/F10 work. Stop after implementation for failed validation,
stale exact-head evidence, incomplete Fury review, or a material scope/risk/
authority change. Never rewrite, squash, reset, publish, merge, deploy, release,
or claim human acceptance.
