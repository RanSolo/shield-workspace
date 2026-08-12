# Issue #226 — Deterministic child integration plan

Status: frozen for exact-plan Fury review; implementation is not authorized.

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Issue: `#226`, **Integrate child missions sequentially through a governed feature branch**
- Predecessor: `#225`, merged by PR `#273`
- Required predecessor merge: `f639e89cee448f8e254fb738d52b0a08c6c304c8`
- Planning base and initial HEAD: `f639e89cee448f8e254fb738d52b0a08c6c304c8`
- Planning base tree: `dd57ea4e691ddc507d59a3317d96f7814ea01bd9`
- Planning branch: `agent/issue-226-feature-integration-plan`
- Planning worktree: `/private/tmp/shield-226.9YHR4a/worktree`
- Plan path: `docs/missions/issue-226-feature-integration-plan.md`
- Target package: `@shield/team-system`

This plan is non-authoritative until Fury passes its exact committed bytes and Coulson later signs a separate schema-9 implementation authority. The issue and Flight 1 run board do not grant authority.

## Objective and exclusions

Implement a deterministic, replayable workflow that advances one authorized child at a time from the exact current feature head, publishes only draft workspaces, integrates only into the feature branch, records exact-tree transition receipts, runs cumulative validation, and fails closed on drift or uncertainty.

The implementation must not represent or perform:

- merge, force-push, or direct commit to `main`;
- marking the feature PR ready or merging it;
- deployment or release;
- policy bypass, branch-protection weakening, or generic stacked-PR behavior;
- implicit authority from a branch, PR, issue, plan, journal, receipt, or run-board entry;
- child implementation, validation, review, or configured-human acceptance on behalf of the owning mission;
- automatic synchronization with a changed `main` or feature head;
- material conflict repair inside Hill or the integration controller.

## Evidence and decisions

### Reconnaissance

Daisy inspected the clean planning revision in a small packet. The accepted evidence is:

- `feature-operation.v1` already closes canonical plan and authority validation, Coulson signature verification, trusted replay context, stage-specific eligibility, amendment lineage, authoritative head transitions, and latest-integration rollback constraints.
- It deliberately performs no host effects and does not create the operation journal or replay context.
- Reusable seams exist in the schema-9 atomic mission store, Feature Flight step/claim store, GitHub adapter and PR workspace, Mack evidence contracts, and the `feature-operation.v1` eligibility API. None is sufficient by itself.
- Missing production surfaces are an operation journal/store, exact branch observation and creation, draft feature/child PR delivery, a child evidence bridge, integration and rollback reconciliation receipts, cumulative validation, and a sequential controller.

### Store ownership

Create a feature-operation-specific append-only journal and store. Do not extend the schema-9 mission journal and do not generalize the existing Feature Flight claim store in this issue.

Reason: schema-9 records mission authority and execution lifecycle, while this journal records one feature operation's trusted host observations, accepted transitions, effect attempts, child inventory, and cumulative validation. Combining them would couple distinct sequence spaces and authority rules. Generalizing the claim store would widen a proven contract before #226's effect lifecycle is known. The new store will reuse the existing atomic-file, exact-digest, lock, no-follow, and fault-classification implementation patterns without reusing either schema as authority.

### First prerequisite and easy-win leverage

The first lane is the pure closed journal/replay/projection contract, before persistence or GitHub effects. It is a hard prerequisite: every later candidate must be evaluated against a trusted `FeatureOperationReplayContextV1`, and only replay of accepted journal entries may create that context. It is also the easiest high-leverage seam naturally available because it reuses #225 validators, can be proved in one focused package test, resolves receipt and state-machine decisions once, and produces the API directly consumed by every successor. It is first because dependency and risk require it, not merely because it is easy.

### Effect claims and reconciliation

Every host mutation owned by #226 uses one operation-specific effect lifecycle in the same journal. Independently governed child implementation is the observation-only exception defined below; #226 never prepares or invokes that child effect.

1. Purely derive and validate a stage candidate from a trusted replay projection.
2. Append an immutable `effect_prepared` entry binding the candidate digest, effect key, expected journal sequence, expected remote identities, and exact prior head/tree.
3. Invoke the single permitted host effect once.
4. Observe the host independently.
5. Append either a terminal accepted exact observation/transition receipt, terminal `effect_not_applied`, or a nonterminal `effect_uncertain` observation marker.

Every terminal outcome references exactly one existing `effect_prepared`; replay rejects an orphan terminal, a second terminal for one preparation, or any terminal whose request/effect identity differs. `effect_not_applied` is permitted only when a trusted independent observation proves that the invocation was rejected or did not apply. `effect_uncertain` is not terminal and may be followed only by observation-based reconciliation to one terminal accepted or not-applied outcome. Replay of `effect_prepared` without a terminal outcome, including any uncertain observation, prohibits re-execution. Absent, ambiguous, conflicting, or unverifiable observations remain blocked.

A #225-derived retry is never an overwrite. It requires a distinct unused effect key already enumerated by the active #225 plan, must remain within that plan's attempt bound, and must pass a newly derived candidate against the replayed terminal `effect_not_applied`. A caller cannot create an effect key because a request changed. A changed request without a separately authorized key is a material amendment and waits for a valid successor plan plus fresh Coulson-signed authority. Cumulative-validation keys use only the separate authority and inventory below.

## Closed production model

### Journal envelope

`FeatureOperationJournalV1` is a closed, canonical, append-only envelope binding:

- schema and operation IDs;
- active plan digest and verified signed-authority digest;
- repository identity, feature branch, target base branch, and authorized base head/tree;
- monotonically contiguous append-entry sequence;
- separately named active-authority journal sequence, active-authority operation sequence, and terminal head-transition operation sequence;
- previous-entry digest and current entry digest;
- canonical entry payload;
- genesis digest and latest accepted entry digest.

Journal and entry digests use this exact framing:

- ASCII domain separator: `shield.feature-integration.journal.v1`;
- framed bytes: `UTF8(domain) || 0x00 || UTF8(entryKind) || 0x00 || UTF8(canonicalJson(recordWithoutOwnDigest))`;
- the literal entry kind is mandatory; the journal envelope uses `journal`;
- only the record's own digest field is omitted; nested and predecessor digests remain;
- canonical JSON recursively orders object keys by ascending UTF-16 code-unit sequence, with no locale collation; contract-declared semantic sets are arrays sorted by their canonical identity using the same comparator, while sequence/history arrays preserve order;
- numbers are finite safe integers where admitted, strings are emitted as JSON UTF-8, and no insignificant whitespace is emitted;
- output is `sha256:` followed by exactly 64 lowercase hexadecimal characters.

Validators reject unknown keys, proxies/accessors, duplicate semantic identities, non-canonical set order, malformed digests, noncontiguous sequence, and broken digest lineage. Fixed tests must prove cross-process stability and that identical payload bytes under different entry kinds produce different digests.

The four sequence domains never alias:

- `entrySequence` is the zero-based append position and increments for every journal entry.
- `activeAuthorityJournalSequence` equals the active signed authority's `journalSequence`; it remains stable across all ordinary entries under that authority and is projected as #225 `currentJournalSequence`.
- `activeAuthorityOperationSequence` equals the active signed authority's `operationSequence`; it remains stable across ordinary entries and is projected as #225 `acceptedAuthorityOperationSequence`.
- `headTransitionOperationSequence` is the zero-based sequence of accepted genesis/integration/rollback transitions and equals the terminal transition's `operationSequence`.

`authority_successor_accepted` is legal only at a safe boundary with no prepared/uncertain effect. Before append, the successor plan must have `planSequence = prior.planSequence + 1` and `predecessorPlanDigest = prior.planDigest`; its freshly verified authority must have `journalSequence = activeAuthorityJournalSequence + 1` and `operationSequence = activeAuthorityOperationSequence + 1`. The successor entry itself consumes only the next `entrySequence`. After acceptance, replay replaces both active-authority sequences with the signed successor values; it does not renumber entries or head transitions. Candidate verification always receives the two active-authority values, never the append tip.

### Closed entry union

The journal entry union is stage-discriminated and exhaustive:

- `operation_genesis_accepted`: verified initial signed authority plus trusted exact authorized-base head/tree observation; acceptance additionally requires `activePlan.baseBranch === "main"`; this pre-effect record establishes the #225 genesis anchor, authority, and sequence but does not claim that the feature branch exists;
- `authority_successor_accepted`: a contiguous plan successor and fresh verified Coulson-signed authority, accepted only after #225 lineage/amendment validation and never implicitly activated;
- `effect_prepared`: one validated derived candidate and its execute-once effect identity;
- `effect_not_applied`: trusted terminal proof that exactly one prepared effect was rejected or did not apply;
- `effect_uncertain`: a prepared effect whose host result cannot yet be proven;
- `feature_branch_creation_accepted`: exact feature ref/head/tree observation and branch-creation terminal receipt after creation or reconciliation; its head/tree must equal the operation genesis anchor;
- `feature_workspace_accepted`: one draft feature PR with exact source feature branch and target exactly `main`;
- `child_initiation_accepted`: exact child branch genesis head/tree created from the replay-derived terminal feature head/tree;
- `child_implementation_accepted`: observation-only acceptance of an independently governed child mission's exact completion head/tree and source-authority/effect receipt identities; no local preparation or child effect occurs;
- `child_publication_accepted`: one observed draft child PR from the exact child branch/head to the feature branch;
- `child_evidence_accepted`: exact-head Mack, Fury, and configured-human evidence digests required by the active plan;
- `integration_accepted`: immutable integration transition and receipt;
- `rollback_workspace_accepted`: observation-only acceptance of an independently schema-9-authorized rollback mission's exact completion receipt, branch, restored tree, draft PR, review evidence, and distinct source-effect identities;
- `rollback_accepted`: immutable rollback transition and receipt;
- `cumulative_validation_accepted`: trusted terminal passing result for the exact terminal feature head/tree and configured validation evidence;
- `cumulative_validation_failed`: trusted terminal non-passing result for the exact terminal feature head/tree and configured validation evidence;
- `operation_paused`, `operation_resumed`, `operation_cancelled`, `operation_split`, `operation_completed`, and `operation_superseded`: non-authoritative lifecycle dispositions constrained by the active plan and verified authority;
- `final_gate_evidence_accepted`: independently verified final Fitz, conditional Simmons, or Coulson evidence bound to the operation, active plan/authority, terminal head/tree, and source-record digest.

Entries may contain trusted observations and verified evidence only. A candidate cannot assert host state, evidence acceptance, resulting heads/trees, timestamps, attempt counts, or receipt acceptance.

### Replay projection

Pure replay returns either a closed invalid result with deterministic reason precedence or an immutable `FeatureOperationReplayContextV1` accepted by #225. It derives, rather than accepts from callers:

- active plan/authority lineage and accepted amendments;
- lifecycle, next append-entry sequence, stable active-authority sequence pair, and terminal head-transition sequence;
- genesis and terminal accepted feature head/tree;
- ordered accepted genesis/integration/rollback transition chain;
- separate integrated-child and reverted-integration histories;
- child/effect-key inventory and attempt counts;
- accepted review and configured-human evidence inventory;
- pending/uncertain effect state;
- latest host-observed time;
- cumulative-validation projection `pending | passed | failed` for the terminal head/tree;
- the single next stage that can legally be considered.

No successor stage is eligible while a prepared/uncertain effect lacks an accepted reconciled receipt or while a rollback receipt is pending. After every accepted integration or rollback, cumulative projection is `pending` until one trusted terminal result is accepted. Another child or completion requires `passed`. From `failed` after an integration, only a latest-integration rollback handoff, a freshly authorized cumulative rerun, or lifecycle disposition is eligible; after a failed rollback validation, only a freshly authorized cumulative rerun or lifecycle disposition is eligible. Operation genesis, feature-branch creation, initial feature workspace, and first-child initiation are explicitly exempt unless a future separately authorized baseline-validation contract is reviewed. Replay preserves history; rollback never erases an integration.

The mapping into #225 is exact:

- `operation_genesis_accepted` plus the latest valid `authority_successor_accepted` derive active plan/authority lineage, accepted amendments, lifecycle sequence, the two stable active-authority sequences, and the authoritative genesis head/tree;
- `operation_genesis_accepted`, `integration_accepted`, and `rollback_accepted` alone form the ordered accepted head-transition chain and derive genesis/latest accepted resulting head/tree; `feature_branch_creation_accepted` proves the feature ref exists at that genesis without inventing another transition;
- child initiation, independently governed implementation completion, publication, and evidence records derive their corresponding stage inventory; no later stage can stand in for a missing earlier stage;
- accepted integration and rollback records derive separate integrated and reverted histories;
- every accepted `effect_prepared` for one of #225's seven derivations immediately and permanently adds its plan-authorized key to #225 `consumedEffectKeys` and increments exactly one applicable child or operation attempt counter; terminal and reconciliation records never release the key or increment the attempt;
- cumulative-validation preparation adds its separately authorized key only to #226's append-only `consumedCumulativeValidationEffectKeys` and increments its separate attempt inventory; cumulative keys are never projected into #225 `consumedEffectKeys` and can never substitute for a #225 derivation key;
- a child lease may exist only before preparation while its effect key is unconsumed; preparation closes/removes that lease because #225 forbids an active lease for a consumed key, while #226's own pending-effect projection remains until a terminal outcome;
- only trusted accepted observation records derive host-observed time and observation provenance;
- lifecycle and trusted-time records derive only #225 lifecycle values according to the closed table below;
- the next-stage projection is a closed union of initiation, implementation handoff, child publication, integration, rollback, cumulative validation, lifecycle-only, completed, or blocked, selected solely from contiguous replay.

Replay fixtures must cover multiple prepare/terminal entries under one stable authority sequence pair, successor-authority activation, and prepared-only, uncertain, not-applied, accepted, and retry-with-a-new-preauthorized-key histories. Rollback fixtures include direct prepared-to-not-applied and uncertain-to-not-applied reconciliation, proving no ref/head/tree transition, preserved key/counter consumption, cleared pending state, and retry eligibility only through a new preauthorized key.

### Closed lifecycle transition table

Replay emits only #225 lifecycle states. `operation_split` is an audit entry that maps to `superseded`; `operation_completed` maps to `integrated` only after its predicate succeeds.

| Current state | Accepted trigger | Next state | Conditions |
|---|---|---|---|
| `active` | `operation_paused` | `paused` | no prepared/uncertain effect |
| `paused` | `operation_resumed` | `active` | same unexpired active authority, no pending effect, and no terminal/successor disposition |
| `active` or `paused` | trusted time reaches authority expiry | `expired` | derived from trusted observed time; no caller timestamp |
| `active` or `paused` | `operation_cancelled` | `cancelled` | no pending effect; preserves all history |
| `active` | accepted rollback preparation | `rollback_pending` | exactly the latest unreverted integration and its authorized rollback key |
| `rollback_pending` | terminal rollback `effect_not_applied` | `active` | trusted observation proves feature ref/head/tree never changed; preserve consumed key and attempt, clear only #226 pending state, and require no cumulative validation for the nonexistent transition |
| `rollback_pending` | terminal accepted rollback plus required cumulative validation | `active` | exact restored tree and no pending effect |
| `rollback_pending` | trusted time reaches authority expiry | `expired` | preserves unresolved recovery evidence |
| `rollback_pending` | `operation_cancelled` | `cancelled` | explicit disposition preserves unresolved recovery evidence |
| `rollback_pending` | `operation_split` or `operation_superseded` | `superseded` | independently valid successor binds and preserves unresolved recovery evidence |
| `active` or `paused` | `operation_split` or `operation_superseded` | `superseded` | binds an independently valid successor operation/plan/authority; no implicit activation here |
| `active` | `operation_completed` | `integrated` | all children accepted and not reverted, cumulative validation current for the terminal head/tree, no pending effect/rollback, and verified configured final Fitz, conditional Simmons when invoked, and Coulson evidence |

`cancelled`, `expired`, `integrated`, and `superseded` are terminal in this journal. They cannot resume or reactivate. `rollback_pending` cannot resume; it can return to `active` only through accepted rollback plus cumulative validation or trusted terminal proof that rollback was not applied, or reach `expired`, `cancelled`, or `superseded` through an explicit valid entry that preserves unresolved recovery evidence. Any other source/trigger pair is contract-invalid.

### Child implementation handoff and completion observation

When #225 selects `child_implementation`, the controller returns `implementation_handoff_ready` containing the exact child ID, branch/base, candidate and replay digests, required independent mission identity, source-authority requirements, and plan-authorized implementation effect key. This outcome performs no append, dispatch, repository edit, or child effect. The owning child mission must obtain and consume its own schema-9 source authority outside #226.

Lane 4 owns `acceptGovernedChildCompletionV1`. It validates an immutable independently governed child completion receipt against the ready handoff, trusted child mission journal, exact repository/branch/base/head/tree, signed source authority, runtime/executor provenance, and the same unused #225 `child_implementation` effect key. This observation is outside #226's local `effect_prepared` lifecycle. On acceptance, and only then, `child_implementation_accepted` permanently adds the source effect key to #225 `consumedEffectKeys` and increments that child's `implementationAttempts` exactly once. Duplicate, stale, uncertain, unaccepted, differently keyed, or merely caller-asserted completion is rejected without state change. The controller then projects child publication as the next possible stage.

### Integration receipt

`FeatureIntegrationReceiptV1` binds:

- operation, plan, authority, child mission, repository, and journal lineage;
- effect key, attempt number, integration method, and reconciliation state;
- prior feature head/tree;
- child branch/head/tree and child PR identity with exact target feature branch;
- exact Mack, Fury, configured-human, check, and CI evidence digests required by the active plan;
- host-observed integration result;
- resulting feature head/tree and receipt digest;
- the SHIELD seat identity, reasoning runtime/model identity, host-tool executor identity, trusted observation provenance, and host-observed timestamp.

Seat, reasoning runtime/model, and host-tool executor are separate closed identity fields. Their IDs must be pairwise distinct; a runtime or executor ID cannot equal or use a seat ID. Observation provenance identifies the trusted adapter/host response and challenge used to establish the result. A genuinely unavailable runtime/model or executor uses an explicit closed `unavailable` variant with a reason code; it is never represented by omission, conflation, or a seat identity. Context size, elapsed time, and similar measurement fields remain nullable when not observed.

Acceptance requires a host-observed resulting feature ref whose head/tree exactly matches the receipt, whose transition is permitted by the reviewed integration method, and whose child/effect identity is not already accepted or reverted inconsistently.

### Rollback receipt

Rollback is restricted to the latest non-reverted accepted integration. Its expected prior state is the current terminal feature head/tree and its expected restored tree is exactly that integration receipt's prior tree.

The controller's rollback selection is an observation-only `rollback_mission_handoff_ready` outcome. It binds the latest integration receipt, current feature head/tree, expected restored tree, rollback branch and draft-PR target requirements, exact review policy, and the reserved #225 `child_revert_on_feature` key, but performs no append, dispatch, branch creation, revert production, publication, or other child effect. A separate rollback mission must obtain its own schema-9 source authority and use source-mission effect keys that are distinct from every #225 and #226 key.

Lane 5 validates that independent mission's immutable completion receipt and trusted journal: exact source authority, latest integration, current feature base, rollback branch, produced restored tree, draft PR targeting only the feature branch, exact-head review evidence, runtime/executor provenance, and distinct consumed source keys. Only then may `rollback_workspace_accepted` append. The reserved #225 rollback key remains unused until #226 prepares the single final effect that merges the verified rollback PR into the feature branch. Its accepted rollback receipt appends the rollback transition; it never deletes or rewrites history. A nonterminal, conflicting, stale, duplicated, source-key-colliding, or tree-mismatched rollback completion is rejected.

### Cumulative validation

`SignedFeatureCumulativeValidationAuthorityV1` is a separate closed Coulson-signed source authority because #225 does not authorize cumulative command execution. Its payload binds schema/kind, mission and operation IDs, active plan and feature-authority digests, repository and terminal feature head/tree, triggering integration/rollback receipt digest, exact Mack request/configuration digest, ordered command IDs, canonical target IDs, validation IDs, exactly one cumulative effect key, `maxAttempts: 1`, `maxRetries: 0`, the active-authority sequence pair, issue/expiry times, human binding/signing-key references, and its own digest. Validation, digest, signature verification against exactly one trusted Coulson binding, and candidate evaluation APIs are pure. The request must be an exact subset of both this authority and the later schema-9 implementation authority; neither authority can widen the other. A proven-not-applied validation attempt requires a fresh signed cumulative authority with a distinct key; the prior key remains consumed.

Its dedicated candidate/evaluator verifies current replay, terminal head/tree, transition receipt, the separate #226 consumed-key/attempt inventory, exact Mack request/configuration, commands/targets, one-attempt/zero-retry bounds, and expiry. This stage does not call `evaluateFeatureOperationDerivedCandidateV1`, whose seven derivations remain the only #225 candidate variants. Tests cover prepared, uncertain, not-applied, accepted, duplicate, and fresh-authority-after-not-applied histories.

`FeatureCumulativeValidationReceiptV1` binds the terminal feature head/tree, active plan/authority, signed cumulative authority/request digests, transition receipt, configured target IDs and commands, exact Mack evidence digest, CI/check observations, terminal outcome `passed | failed`, effect/reconciliation state, runtime attribution, host-observed time, and receipt digest. Both outcomes require trusted complete execution evidence; infrastructure uncertainty remains `effect_uncertain`, not `failed`. The evidence bridge accepts only repository-defined Mack evidence whose revision equals the terminal feature head and whose configured validation identities equal the signed cumulative authority. Evidence from a child head, prior feature head, cache-only claim without an accepted task result, or synthetic/untrusted source is rejected.

Each preparation permanently consumes its #226 cumulative key and increments its attempt inventory regardless of terminal outcome. `failed` never releases either. A rerun requires a fresh signed cumulative authority for the same terminal head/tree and transition receipt with a distinct unused key; it replaces the projection only after its own trusted terminal result. The controller may select another child or complete only when the current projection is `passed`.

## Sequential implementation lanes

Each lane is a separate implementation packet, exact commit, Mack validation, and Fury conformance checkpoint. A successor starts only after its predecessor is accepted and the refresh rule below is satisfied.

### Lane 1 — Pure journal, receipt, and replay contracts

Deliver:

- closed journal entry, effect lifecycle, integration/rollback receipt, cumulative-validation receipt, replay result, and blocked-reason contracts;
- closed signed cumulative-validation authority/request/candidate contracts plus validate, digest, verify, and evaluate APIs;
- canonical validators and digest functions;
- pure replay that derives the #225 `FeatureOperationReplayContextV1`;
- deterministic reason precedence and fixtures for malformed lineage, duplicate effects, stale heads, missing evidence, uncertain effects, latest-only rollback, preserved integrated/reverted histories, cumulative `pending | passed | failed`, and substituted genesis/feature-workspace targets.

Exact paths:

- `packages/shield-team-system/src/feature-integration-v1.mts` (new)
- `packages/shield-team-system/tests/feature-integration-v1.test.mjs` (new)

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs`

No filesystem, GitHub, branch, PR, integration, validation-runner, or controller effect is permitted in this lane.

### Lane 2 — Durable operation journal/store

Deliver:

- safe canonical read, initialize, append, and replay APIs for the Lane 1 contract;
- one writer lock, regular-file/no-follow checks, exact expected sequence/digest compare, atomic same-directory replacement, mode preservation, fsync/close ordering, and deterministic fault classification;
- idempotent identical append and conflict rejection;
- validation, lock-acquisition, and pre-replacement staging failures preserve the baseline;
- after replacement may have occurred, readback, file-fsync, directory-fsync, close, or durability-proof failure returns `recovery_required`/uncertain and never claims no mutation;
- recovery classification observes bytes and distinguishes unchanged baseline, complete accepted candidate, and unverifiable state without blind retry.

Exact paths:

- `packages/shield-team-system/src/feature-integration-store-v1.mts` (new)
- `packages/shield-team-system/tests/feature-integration-store-v1.test.mjs` (new)

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-store-v1.test.mjs`

This lane performs only test-fixture filesystem effects. It performs no repository-host effect.

### Lane 3 — Exact branch and draft-workspace delivery

Deliver:

- challenge-bound observations of repository identity, full refs, heads, trees, branch protection, and draft PR inventory;
- feature branch creation only from the exact authorized genesis head after genesis proves `baseBranch === "main"`;
- child branch creation only from the replay-derived terminal feature head;
- one draft feature PR from feature branch to target exactly `main`;
- one draft child PR from child branch to the feature branch;
- execute-once prepare/invoke/observe/reconcile behavior backed by Lane 2;
- fail-closed handling for stale base, substituted/non-`main` genesis or feature-workspace target, wrong child target, non-draft state, ambiguous PRs, branch drift, uncertain creation, or policy mismatch.

Exact paths:

- `packages/shield-team-system/github/feature-integration-workspace-v1.mjs` (new)
- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/public/github.mjs`
- `packages/shield-team-system/public/github.d.mts`
- `packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs` (new)

The adapter exposes only bounded feature/child branch observation and creation plus draft PR observation/creation. It does not expose feature-to-main merge, ready-for-review, deploy, release, force, or protection-bypass operations.

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-store-v1.test.mjs packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs`

### Lane 4 — Child completion and evidence bridge

Deliver:

- a pure bridge from exact child mission, PR, Mack, Fury, configured-human, check, and CI evidence into the #225 integration candidate;
- an observation-only `implementation_handoff_ready` contract and `acceptGovernedChildCompletionV1` API for independently authorized child completion, including exact source receipt/journal verification and one-time #225 counter/effect consumption;
- exact equality checks for repository, feature target, child branch/head/tree, reviewed revision, evidence IDs/digests, configured gates, and active plan/authority lineage;
- rejection of premature, stale, synthetic, advisory, duplicated, inapplicable, or caller-asserted evidence;
- accepted `child_evidence_accepted` append input, without integration effects.

Exact paths:

- `packages/shield-team-system/src/feature-integration-evidence-v1.mts` (new)
- `packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs` (new)

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs`

This lane consumes existing schema-9 completion and Mack/Fury evidence APIs; it does not dispatch/implement a child, alter their schemas, or accept evidence on their behalf.

### Lane 5 — Integration and latest-only rollback

Deliver:

- exact policy/method observation and one bounded child-PR integration adapter targeting only the feature branch;
- prepare/invoke/observe/reconcile behavior with no blind retry;
- host-observed exact-head/tree integration receipt append;
- observation-only latest-integration rollback mission handoff, exact independent schema-9 completion-receipt validation, `rollback_workspace_accepted` append, and final verified rollback-PR merge/receipt using only the reserved #225 key;
- deterministic stops for failed checks, branch drift, merge conflict, wrong target, method mismatch, ambiguous/unknown result, receipt mismatch, nonterminal rollback, or changed policy.

Exact paths:

- `packages/shield-team-system/github/feature-integration-workspace-v1.mjs`
- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/public/github.mjs`
- `packages/shield-team-system/public/github.d.mts`
- `packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs`

The independently governed rollback mission must use a separately reviewed rollback branch and draft PR into the feature branch. #226 never performs those source-mission effects, writes directly to the protected feature ref, or synthesizes a tree through low-level Git object APIs. Source-mission keys, #226 cumulative keys, and the reserved #225 final rollback key are pairwise distinct.

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-store-v1.test.mjs packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs`

### Lane 6 — Cumulative validation and one-stage controller

Deliver:

- a bounded production API for configured cumulative-validation request, execution observation, execute-once reconciliation, projection, and accepted receipt append;
- a controller that replays trusted state, verifies current repository/authority freshness, selects at most one next stage, uses #225 evaluation only for its seven derivations, uses the dedicated signed cumulative-validation evaluator for that stage, and delegates to exactly one bounded stage-owner API from Lanes 2-6;
- deterministic `blocked`, `ready`, `implementation_handoff_ready`, `rollback_mission_handoff_ready`, `completed`, `paused`, `cancelled`, `split`, and `recovery_required` outcomes;
- no loops that execute multiple stages or children in one invocation;
- package surface and operations documentation.

Exact paths:

- `packages/shield-team-system/scripts/operations/feature-integration-controller-v1.mjs` (new)
- `packages/shield-team-system/tests/operations-feature-integration-controller-v1.test.mjs` (new)
- `packages/shield-team-system/src/feature-integration-validation-v1.mts` (new)
- `packages/shield-team-system/tests/feature-integration-validation-v1.test.mjs` (new)
- `packages/shield-team-system/public/feature-integration.mjs` (new)
- `packages/shield-team-system/public/feature-integration.d.mts` (new)
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/PUBLIC_API.md`
- `packages/shield-team-system/docs/operations/feature-integration.md` (new)
- `docs/operations/feature-integration.md` (new canonical mirror)

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-store-v1.test.mjs packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs packages/shield-team-system/tests/feature-integration-validation-v1.test.mjs packages/shield-team-system/tests/operations-feature-integration-controller-v1.test.mjs packages/shield-team-system/tests/package-surface.test.mjs`

Package-surface and pack tests must assert the new `./feature-integration` runtime export, declarations, controller distribution, `PUBLIC_API.md`, and both synchronized operation documents.

## Nx-boundary decision and affected validation

Decision: do not create a new Nx library/project for #226.

The capability has an independent contract and focused tests, but all current producers and consumers belong to `@shield/team-system`: `feature-operation.v1`, schema-9 persistence patterns, SHIELD review evidence, GitHub workspace adapters, and operation controllers. A new project would require a broad public dependency split and package-linking work without an independent owner or downstream consumer. The coherent boundary is the existing package with a dedicated `./feature-integration` subpath export and focused test files.

The fresh planning worktree has no installed `node_modules`, so `nx show project` correctly failed rather than producing guessed resolved metadata. Repository scripts establish the exact package targets `@shield/team-system:build` and `@shield/team-system:test`, with `@shield/multiband` as a downstream package to verify through the affected graph after implementation dependencies are installed.

For every implementation-lane exact head, Mack must run:

1. the lane's mandatory focused `node --test` command listed above;
2. `npx nx build @shield/team-system`;
3. `npx nx affected -t build,test --base=<lane-base> --head=<lane-head>` and retain the reported project/target set;
4. if the graph reports `@shield/multiband` affected, its exact affected build/test targets; otherwise retain graph evidence that it was unaffected;
5. by Lane 6, `npx nx test @shield/team-system` and `npm pack --dry-run --workspace @shield/team-system` as proportional cumulative/package-surface checks.

Cache hits are recorded as cache hits, not as graph-proven unaffected results. Failure to resolve the Nx graph is a validation blocker.

## Refresh-on-merge and amendment rule

The planning base already equals current `origin/main` and contains the required #225 merge. Before each future implementation lane, and whenever any depended-on SHIELD capability merges:

1. stop at the next safe boundary with no prepared/uncertain host effect;
2. fetch current `origin/main` and verify the required predecessor merge remains an ancestor;
3. reconcile/rebase the dedicated #226 lane onto the exact current base without merging `main` into it;
4. install/refresh dependencies and rebuild generated/package surfaces through repository-supported commands;
5. verify repository root, branch, clean HEAD/tree, plan digest, signed authority, runtime/executor binding, path scope, and journal sequence;
6. run focused and exact affected Nx validation on the refreshed revision;
7. route any plan/path/contract change to Fury and require fresh Coulson authority before implementation resumes.

No old worktree or stale generated surface may be treated as containing a newly merged capability by assumption. A semantic scope, destination, graph, risk, lineage, adapter method, journal union, or authorized-path change is material; it cannot activate implicitly.

## Review and publication gates

- Fury reviews this exact committed plan first, including lane order, boundaries, coupled contracts, packet sizing, Nx decision, per-lane evidence, and cumulative coverage.
- `PASS` freezes the plan. `REVISE` permits only the smallest exact plan correction and a new exact-plan review.
- After plan PASS, Coulson must authorize a schema-9 implementation mission that binds the exact plan digest, current base/head/tree, runtime/executor, capabilities, actions, effects, validations, and authorized path set.
- May implements one authorized lane at a time. Mack validates each exact head. Retained Fury reviews conformance at each exact head before the next lane.
- Publication requires separate exact reviewed-head authority and can create/update only the authorized draft PR.
- Integration into a feature branch requires the operation authority and journal state defined here. Merge to `main`, ready state, deployment, and release remain separate and unrepresentable.

## Packet record

- Planning packet: small
- Daisy packet: small; expansion not reported
- Daisy seat/runtime/model: `daisy` / hosted / `gpt-5.6-sol`
- Daisy executor and context size: `null`
- Daisy elapsed time: `null`
- Hill interventions before plan freeze: one carrier correction after an unavailable Spark launch; Mission Control dispatched the registered Sol Daisy
- Rediscovery: one failed direct carrier inspection was rejected as non-Daisy evidence and not used as authoritative recon
- Corrections: removed the proposed separate intake huddle per Feature Hill/Coulson process simplification; first Fury review required closed authority/lifecycle/stage transitions, terminal not-applied effects, truthful post-replacement recovery, exact digest framing, separated seat/runtime/executor identities, and an explicit cumulative-validation API plus complete public/documentation paths; second Fury review required separated sequence domains, a #225-compatible lifecycle table, permanent effect consumption at preparation, and separately signed cumulative-validation authority without genesis deadlock; third Fury review required rollback not-applied recovery to active, a separate one-attempt cumulative key inventory, and an observation-only independently governed child-implementation handoff/acceptance boundary; final review of `fad7950` required observation-only independently authorized rollback workspace preparation, terminal non-passing cumulative projection, and exact `main` genesis/workspace targeting
- Mack findings: `null` (planning only)
- Fury findings: four exact-plan reviews returned `REVISE`; all sixteen required corrections are incorporated in this successor plan revision
- Accepted output so far: exact-base Daisy reconnaissance summarized above
- Next legal action: exact committed-plan Fury review only
