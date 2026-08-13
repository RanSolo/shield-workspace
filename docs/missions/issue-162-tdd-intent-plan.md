# Issue #162 — TDD mission states and intent-preservation plan

## Frozen mission identity

- Lane: Bravo Lane Hill
- Repository: `RanSolo/shield-workspace`
- Worktree: `/private/tmp/shield-162-bravo.yMZTJ7`
- Branch: `agent/issue-162-tdd-intent`
- Planning base and planning HEAD: `f639e89cee448f8e254fb738d52b0a08c6c304c8`
- Planning tree: `dd57ea4e691ddc507d59a3317d96f7814ea01bd9`
- Issue: `#162`
- Parent operation: `#271`
- Authority: planning and reconnaissance only. No implementation, publication,
  merge, deployment, release, or Guided QA `#238` effect is authorized.

## Objective and boundary

Add one host-neutral, pure Team System contract that makes risk-selected TDD,
Red, Green, Refactor, expectation amendments, acceptance-criterion
traceability, and packet sizing explicit and fail closed. Prove the contract
with the package's existing `node:test` framework.

This slice does not add a runner, journal store, CLI, UI, test framework,
Guided QA flow, or production-effect executor. It does not implement the
pre-authority Mack dispatch lifecycle proposed by `#247`; it models and
validates the acceptance contract and its evidence so that later lifecycle
work can consume it without reinterpreting #162.

## Observed repository facts

- `@shield/team-system` uses pure, versioned TypeScript contracts in
  `packages/shield-team-system/src`, public wrappers in `public`, package
  subpath exports, and `node:test` contract tests.
- `mack.validation.v0` already distinguishes non-authoritative validation
  evidence from advancement authority, but it does not model pre-implementation
  acceptance contracts, Red, Green, Refactor, expectation amendments, or
  criterion-to-packet traceability.
- `feature.operation.v1` already provides stable acceptance-criterion IDs, but
  it does not define criterion-level TDD strategy or implementation packet
  contracts.
- The canonical Lane Hill guidance contains the governing prose for risk-based
  TDD, one-criterion packet defaults, the three-criterion ceiling, and the
  expectation-rewrite gates. The implementation must encode those rules rather
  than create a competing policy.
- The Alpha six-packet run shows that one-criterion packets with narrow path
  exposure can work. It is observational evidence only; it does not prove this
  contract or prescribe six packets.

## Frozen acceptance criteria

### AC-162-1 — risk-selected strategy

Every acceptance criterion has a stable ID and an explicit strategy of
`tdd_selected` or `tdd_declined`, a nonempty rationale, and risk factors.
Selecting TDD requires an executable pre-implementation contract; declining it
is valid for documented unsuitable cases and never skips later validation.

### AC-162-2 — traceability and packet sizing

The contract preserves the spine
`criterion -> plan requirement -> Mack checkpoint -> May packet -> revision -> validation evidence -> Fury/human review`.
Each criterion receives exactly one disposition. A packet contains one
criterion by default; two or three require a tight-coupling rationale; four or
more are ineligible and produce a Feature Hill packet-size-exception stop.

### AC-162-3 — reviewed Red, not scaffold PASS

For selected TDD, Red requires agreed behavior, Mack-owned executable test or
checkpoint identity, exact revision, observed failure evidence, one expected
failure classification, and Fury disposition of the intended contract. The
observed failure must match the expected classified reason. A prepared Mack
scaffold is `contract_prepared`, never PASS and never implementation authority.

Closed failure classifications are `missing_behavior`, `product_defect`,
`stale_expectation`, `environment_failure`, `harness_defect`,
`authority_failure`, and `insufficient_evidence`. Wrong-reason or missing
failure evidence cannot establish Red.

### AC-162-4 — expectation amendment gate

Changing or removing an expectation is ineligible without the original
addressable evidence, explicit failure classification, written
intent-preservation rationale, Fury contract disposition when applicable,
Fitz verification, and fresh exact-revision evidence. Difficulty or a failing
test is never amendment authority. An approved amendment returns the criterion
to the reviewed-Red boundary before implementation continues.

### AC-162-5 — smallest Green and separate Refactor

Only May may produce Green, after Red and implementation authority for selected
TDD or after the recorded non-TDD strategy and implementation authority.
Green carries the smallest correct implementation revision and focused Mack
evidence. Refactor is optional, starts only after Green is proven, uses a
separate revision/evidence record, and must preserve the same acceptance
contract. Behavior, failure-semantic, authority, persistence, or risk changes
return to planning instead of being labeled refactor.

### AC-162-6 — exact evidence and terminal routing

The evaluator returns deterministic `eligible`, `blocked`, or
`packet_size_exception_required` results with stable reason codes and no side
effects. Evidence binds mission, plan digest, criterion, packet, seat, runtime,
executor, repository, branch, exact revision/tree, command/checkpoint, outcome,
failure classification when applicable, source references, and successor or
stop condition. A lane cannot complete while a criterion lacks one of
`implemented_and_proven`, `deferred_with_linked_issue`,
`not_applicable_with_evidence`, or `blocked_pending_explicit_decision`.

## Contract and transition design

Add `tdd.mission.v1` as a closed, host-neutral contract. It validates immutable
inputs and returns a frozen decision; it does not append evidence, dispatch a
seat, grant authority, edit code/tests, or report human approval.

The closed input contains:

- mission/repository/branch/plan identity and exact planning revision/tree;
- criterion records with strategy, rationale, risks, requirement, disposition,
  and checkpoint contract;
- packet records with one-to-three criterion IDs, exact minimal paths,
  coupling rationale when needed, required interfaces, allowed effects,
  focused validation, expected output, stop conditions, and successor;
- state evidence for `strategy_recorded`, `contract_prepared`,
  `red_established`, `implementation_authorized`, `green_proven`, and optional
  `refactor_proven`;
- expectation-amendment evidence when an assertion changes or is removed; and
- the exact traceability/evidence records required by AC-162-6.

The evaluator applies this dependency order:

1. Validate closed shapes, unique IDs, exact bindings, plan digest, and
   criterion dispositions.
2. Validate criterion-to-packet total coverage and packet size. Duplicate or
   missing ownership blocks; a packet over three criteria returns only the
   packet-size exception result.
3. For `tdd_selected`, require `contract_prepared`, matching expected and
   observed classifications, executable failure evidence, and Fury contract
   review before Red is established. For `tdd_declined`, require rationale and
   continue without manufacturing Red.
4. Require explicit implementation-authority evidence before any Green
   transition. Red or a failing test contributes evidence only.
5. Admit Green only with May attribution, the packet's bounded paths/effects,
   an exact implementation revision, and focused Mack evidence.
6. Admit Refactor only after proven Green, on a separate revision, with the
   unchanged contract digest and fresh behavior-preservation evidence.
7. If an expectation changed or was removed, stop until AC-162-4 is complete.
   Any amendment creates a new acceptance-contract digest and invalidates all
   prior `implementation_authorized`, Green, Refactor, Mack-validation, and
   conformance receipts for that criterion; an evaluator must reject those
   receipts as stale even if their repository revision still matches. A
   `tdd_selected` criterion returns to `contract_prepared` and must establish
   fresh reviewed Red against the amended digest. A `tdd_declined` criterion
   returns to `strategy_recorded`, must preserve or freshly justify its
   non-TDD selection against the amended behavior, and does not manufacture a
   Red transition. Both branches require fresh Coulson implementation authority
   bound to the amended contract digest before May resumes.
8. Admit terminal completion only after all criteria have explicit
   dispositions and all implemented criteria have exact Mack evidence and Fury
   conformance evidence. `blocked_pending_explicit_decision` is an explicit
   accounting disposition but is nonterminal: evaluation returns `blocked`
   with the named decision owner and cannot report lane completion. Human review
   references are required only where the frozen criterion or amendment
   contract names them.

Stable blocking reasons include malformed input, binding/digest mismatch,
strategy rationale missing, validation contract missing, Red not established,
wrong failure reason, scaffold treated as PASS, implementation authority
missing, seat ownership mismatch, packet criterion missing/duplicated, packet
coupling rationale missing, expectation amendment incomplete, Green evidence
missing, Refactor not behavior-preserving, stale exact-revision evidence,
criterion disposition missing, and review evidence missing.

## Seat ownership and gates

- Hill freezes criteria, packet order, stop conditions, and routes terminal
  events; Hill does not create specialist or human verdicts.
- Mack owns the pre-implementation validation contract and failure
  classification evidence, then independently validates Green/Refactor at the
  exact revision. A scaffold is not a PASS.
- Fury reviews the exact plan, Red contract/failure semantics, expectation
  amendments when contract-relevant, and exact implementation conformance.
- Coulson alone may grant implementation Wheels Up. Fury PASS and Red evidence
  do not grant it.
- May alone implements Green and any separately authorized Refactor. May may
  not weaken the acceptance contract.
- Fitz verifies every changed or removed expectation. The contract records a
  reference to real Fitz evidence; it cannot synthesize that evidence.

## Dependency-ordered implementation packets

All packets remain unauthorized until exact-plan Fury PASS and Coulson Wheels
Up. Each packet exposes only its listed paths. Packet commits are clean
checkpoints; later packets depend on the exact accepted predecessor.

### P1 — AC-162-1: risk strategy contract

- Paths: `packages/shield-team-system/src/tdd-mission-v1.mts`,
  `packages/shield-team-system/tests/tdd-mission-v1.test.mjs`
- Effect: add the closed criterion strategy/risk/rationale types and validator.
- Focused proof: selected TDD requires an executable contract; declined TDD
  requires rationale and does not imply skipped validation.
- Stop: any need for repository-specific testing assumptions or a new test
  framework.
- Successor: P2.

### P2 — AC-162-2: traceability and packet throttle

- Paths: the two P1 paths only.
- Effect: add exact criterion ownership, disposition, traceability, and
  one/default, three/max packet rules.
- Focused proof: one-criterion packet passes; coupled two/three require
  rationale; missing/duplicate criteria block; four criteria return the
  exception result.
- Stop: no truthful split for four or more criteria; raise the prescribed
  Feature Hill packet-size exception without implementation.
- Successor: P3.

### P3 — AC-162-3: Red contract and classification

- Paths: the two P1 paths only.
- Effect: add Mack scaffold, Red evidence, classification matching, and Fury
  review requirements.
- Focused proof: expected missing behavior establishes Red only when the exact
  run fails for missing behavior; wrong-reason failure and scaffold-as-PASS
  block.
- Stop: Red would require production edits, rewritten expectations, or an
  invented command.
- Successor: P4.

### P4 — AC-162-4: expectation amendment gate

- Paths: the two P1 paths only.
- Effect: add changed/removed expectation evidence and downstream evidence
  invalidation.
- Focused proof: missing rationale, Fury disposition when applicable, Fitz
  verification, original evidence, or fresh rerun blocks; a complete amendment
  invalidates prior authority and downstream receipts. Selected-TDD amendments
  return through fresh reviewed Red; declined-TDD amendments return through a
  freshly justified strategy. Both require fresh digest-bound Coulson authority
  and neither proceeds directly to Green.
- Stop: unavailable Fitz verification or disputed intended behavior.
- Successor: P5.

### P5 — AC-162-5: Green and Refactor transitions

- Paths: the two P1 paths only.
- Effect: add implementation-authority, May ownership, smallest-Green, and
  separate behavior-preserving Refactor rules.
- Focused proof: Red without authority blocks Green; non-May implementation
  blocks; cleanup bundled with Green blocks; changed contract during Refactor
  returns to planning.
- Stop: authority, scope, public behavior, failure semantics, persistence, or
  risk differs from the reviewed contract.
- Successor: P6.

### P6 — AC-162-6: evidence, public surface, and bounded proving mission

- Paths: `packages/shield-team-system/src/tdd-mission-v1.mts`,
  `packages/shield-team-system/tests/tdd-mission-v1.test.mjs`,
  `packages/shield-team-system/public/tdd-mission.mjs`,
  `packages/shield-team-system/public/tdd-mission.d.mts`,
  `packages/shield-team-system/package.json`,
  `packages/shield-team-system/tests/package-surface.test.mjs`
- Effect: finish stable decisions/reasons and exact evidence schema; expose one
  public subpath; update the existing public-surface test.
- Focused proof: one bounded fixture traverses strategy -> prepared contract ->
  expected Red -> authorized May Green -> optional separate Refactor -> exact
  Mack/Fury completion. Negative fixtures prove stale evidence and incomplete
  criterion dispositions cannot complete. A
  `blocked_pending_explicit_decision` fixture returns `blocked`, never terminal
  completion.
- Validation: package-manager-prefixed Nx build and test targets discovered at
  execution time; use the existing `node:test` suite through Nx. No new runner,
  dependency, project, generator, or framework.
- Stop: Nx target discovery disagrees with the reviewed commands, unrelated
  tests fail, or the package export requires a broader compatibility change.
- Successor: exact-head Mack validation, then Fury conformance, then existing
  human review/publication gates.

No packet combines multiple acceptance criteria, so no packet-size exception
is presently required. The shared source/test paths are intentional: one small
contract is extended in dependency order, while each commit remains a focused,
independently reviewable behavior checkpoint.

## Validation and evidence contract

Preflight at the implementation gate must resolve the package manager and Nx
project/targets rather than guess flags. Expected validation categories are:

- focused existing-framework test for `tdd-mission-v1.test.mjs`;
- `@shield/team-system` build;
- `@shield/team-system` test;
- exact changed-path and clean-worktree check;
- Mack exact-head validation followed by Fury exact-head conformance.

Every receipt records command, cwd, start/end revision and tree, exit code,
test counts where available, cache evidence exactly as emitted, runtime/model,
executor identity, source references, and criterion/packet IDs. Unavailable,
misconfigured, environment-failed, wrong-reason, stale, or inconclusive results
are never PASS.

## Stop and amendment conditions

Stop before edits for stale plan/base/tree, dirty or conflicting paths, missing
or malformed authority, runtime substitution, path/effect/capability widening,
packet size above three, unresolved intended behavior, expectation amendment
without Fitz evidence, need for a second framework, or scope expansion into
`#238`/`#247` implementation. Any material contract, scope, risk, runtime,
path, effect, or capability change requires a revised plan, fresh Fury review,
and fresh human authority where applicable.
