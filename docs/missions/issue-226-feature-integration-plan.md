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

Every host mutation uses one operation-specific effect lifecycle in the same journal:

1. Purely derive and validate a stage candidate from a trusted replay projection.
2. Append an immutable `effect_prepared` entry binding the candidate digest, effect key, expected journal sequence, expected remote identities, and exact prior head/tree.
3. Invoke the single permitted host effect once.
4. Observe the host independently.
5. Append either an accepted exact observation/transition receipt or `effect_uncertain`.

Replay of `effect_prepared` without a terminal receipt, or any `effect_uncertain`, prohibits re-execution. Only observation-based reconciliation may append the terminal receipt. Absent, ambiguous, conflicting, or unverifiable observations remain blocked. A materially changed request receives a new effect key and newly reviewed flow; it cannot reuse or overwrite a claim.

## Closed production model

### Journal envelope

`FeatureOperationJournalV1` is a closed, canonical, append-only envelope binding:

- schema and operation IDs;
- active plan digest and verified signed-authority digest;
- repository identity, feature branch, target base branch, and authorized base head/tree;
- monotonically contiguous journal sequence;
- previous-entry digest and current entry digest;
- canonical entry payload;
- genesis digest and latest accepted entry digest.

Canonical digest framing must reuse the repository's established SHA-256 framing rules: digest field excluded, UTF-8 JSON bytes, recursively lexicographically ordered object keys, arrays preserved in contract order, no insignificant whitespace, lowercase hexadecimal output. Validators reject unknown keys, proxies/accessors, duplicate semantic identities, non-canonical set order, malformed digests, noncontiguous sequence, and broken digest lineage.

### Closed entry union

The journal entry union is stage-discriminated and exhaustive:

- `genesis_accepted`: verified signed authority plus exact authorized base and feature-branch genesis head/tree;
- `effect_prepared`: one validated derived candidate and its execute-once effect identity;
- `effect_uncertain`: a prepared effect whose host result cannot yet be proven;
- `feature_branch_accepted`: exact feature ref/head/tree observation after creation or reconciliation;
- `feature_workspace_accepted`: one draft feature PR with exact source feature branch and target base branch;
- `child_workspace_accepted`: exact child branch/head/tree and one draft child PR targeting only the feature branch;
- `child_evidence_accepted`: exact-head Mack, Fury, and configured-human evidence digests required by the active plan;
- `integration_accepted`: immutable integration transition and receipt;
- `rollback_workspace_accepted`: latest-integration rollback branch/PR and evidence identity;
- `rollback_accepted`: immutable rollback transition and receipt;
- `cumulative_validation_accepted`: exact terminal feature head/tree and configured validation evidence;
- `operation_paused`, `operation_cancelled`, and `operation_split`: non-authoritative control dispositions constrained by the active plan.

Entries may contain trusted observations and verified evidence only. A candidate cannot assert host state, evidence acceptance, resulting heads/trees, timestamps, attempt counts, or receipt acceptance.

### Replay projection

Pure replay returns either a closed invalid result with deterministic reason precedence or an immutable `FeatureOperationReplayContextV1` accepted by #225. It derives, rather than accepts from callers:

- active plan/authority lineage and accepted amendments;
- lifecycle and next journal sequence;
- genesis and terminal accepted feature head/tree;
- ordered accepted genesis/integration/rollback transition chain;
- separate integrated-child and reverted-integration histories;
- child/effect-key inventory and attempt counts;
- accepted review and configured-human evidence inventory;
- pending/uncertain effect state;
- latest host-observed time;
- cumulative-validation status for the terminal head/tree;
- the single next stage that can legally be considered.

No successor stage is eligible while a prepared/uncertain effect lacks an accepted reconciled receipt, while cumulative validation is missing for the terminal transition, or while a rollback receipt is pending. Replay preserves history; rollback never erases an integration.

### Integration receipt

`FeatureIntegrationReceiptV1` binds:

- operation, plan, authority, child mission, repository, and journal lineage;
- effect key, attempt number, integration method, and reconciliation state;
- prior feature head/tree;
- child branch/head/tree and child PR identity with exact target feature branch;
- exact Mack, Fury, configured-human, check, and CI evidence digests required by the active plan;
- host-observed integration result;
- resulting feature head/tree and receipt digest;
- actual runtime, model, executor, and host-observed timestamp, with nullable metrics where unavailable.

Acceptance requires a host-observed resulting feature ref whose head/tree exactly matches the receipt, whose transition is permitted by the reviewed integration method, and whose child/effect identity is not already accepted or reverted inconsistently.

### Rollback receipt

Rollback is restricted to the latest non-reverted accepted integration. Its expected prior state is the current terminal feature head/tree and its expected restored tree is exactly that integration receipt's prior tree. Rollback uses a separately governed rollback child branch and draft PR targeting the feature branch, with the same exact-head review and execute-once reconciliation rules. The accepted rollback receipt appends a transition; it never deletes or rewrites integration history. A nonterminal, conflicting, or tree-mismatched rollback is ineligible and requires a newly reviewed integration flow.

### Cumulative validation

`FeatureCumulativeValidationReceiptV1` binds the terminal feature head/tree, active plan/authority, transition receipt, configured target IDs and commands, exact Mack evidence digest, CI/check observations, runtime attribution, host-observed time, and receipt digest. The evidence bridge accepts only repository-defined Mack evidence whose revision equals the terminal feature head and whose configured validation identities equal the active plan. Evidence from a child head, prior feature head, cache-only claim without an accepted task result, or synthetic/untrusted source is rejected.

The controller may select another child only after cumulative validation for the current terminal transition is accepted.

## Sequential implementation lanes

Each lane is a separate implementation packet, exact commit, Mack validation, and Fury conformance checkpoint. A successor starts only after its predecessor is accepted and the refresh rule below is satisfied.

### Lane 1 — Pure journal, receipt, and replay contracts

Deliver:

- closed journal entry, effect lifecycle, integration/rollback receipt, cumulative-validation receipt, replay result, and blocked-reason contracts;
- canonical validators and digest functions;
- pure replay that derives the #225 `FeatureOperationReplayContextV1`;
- deterministic reason precedence and fixtures for malformed lineage, duplicate effects, stale heads, missing evidence, uncertain effects, latest-only rollback, and preserved integrated/reverted histories.

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
- no mutation when validation, lock acquisition, staging, replacement, or durability proof fails;
- recovery classification that distinguishes unchanged baseline, complete accepted candidate, and uncertain state.

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
- feature branch creation only from the exact authorized genesis head;
- child branch creation only from the replay-derived terminal feature head;
- one draft feature PR from feature branch to the exact target base branch;
- one draft child PR from child branch to the feature branch;
- execute-once prepare/invoke/observe/reconcile behavior backed by Lane 2;
- fail-closed handling for stale base, wrong target, non-draft state, ambiguous PRs, branch drift, uncertain creation, or policy mismatch.

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
- exact equality checks for repository, feature target, child branch/head/tree, reviewed revision, evidence IDs/digests, configured gates, and active plan/authority lineage;
- rejection of premature, stale, synthetic, advisory, duplicated, inapplicable, or caller-asserted evidence;
- accepted `child_evidence_accepted` append input, without integration effects.

Exact paths:

- `packages/shield-team-system/src/feature-integration-evidence-v1.mts` (new)
- `packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs` (new)

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs`

This lane consumes existing Mack/Fury evidence APIs; it does not alter their schemas or accept evidence on their behalf.

### Lane 5 — Integration and latest-only rollback

Deliver:

- exact policy/method observation and one bounded child-PR integration adapter targeting only the feature branch;
- prepare/invoke/observe/reconcile behavior with no blind retry;
- host-observed exact-head/tree integration receipt append;
- latest-only rollback workspace, exact restored-tree verification, and rollback receipt append;
- deterministic stops for failed checks, branch drift, merge conflict, wrong target, method mismatch, ambiguous/unknown result, receipt mismatch, nonterminal rollback, or changed policy.

Exact paths:

- `packages/shield-team-system/github/feature-integration-workspace-v1.mjs`
- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/public/github.mjs`
- `packages/shield-team-system/public/github.d.mts`
- `packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs`

The rollback implementation must use a separately reviewed rollback branch and draft PR into the feature branch. It must not write directly to the protected feature ref or synthesize a tree through low-level Git object APIs.

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-store-v1.test.mjs packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs`

### Lane 6 — Cumulative validation and one-stage controller

Deliver:

- configured cumulative validation request/projection and accepted receipt append;
- a controller that replays trusted state, verifies current repository/authority freshness, selects at most one next stage, evaluates the #225 candidate, and delegates to exactly one bounded Lane 2-5 API;
- deterministic `blocked`, `ready`, `completed`, `paused`, `cancelled`, `split`, and `recovery_required` outcomes;
- no loops that execute multiple stages or children in one invocation;
- package surface and operations documentation.

Exact paths:

- `packages/shield-team-system/scripts/operations/feature-integration-controller-v1.mjs` (new)
- `packages/shield-team-system/tests/operations-feature-integration-controller-v1.test.mjs` (new)
- `packages/shield-team-system/public/feature-integration.mjs` (new)
- `packages/shield-team-system/public/feature-integration.d.mts` (new)
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/docs/operations/feature-integration.md` (new)

Focused proof:

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/feature-integration-v1.test.mjs packages/shield-team-system/tests/feature-integration-store-v1.test.mjs packages/shield-team-system/tests/feature-integration-evidence-v1.test.mjs packages/shield-team-system/tests/github-feature-integration-workspace-v1.test.mjs packages/shield-team-system/tests/operations-feature-integration-controller-v1.test.mjs packages/shield-team-system/tests/package-surface.test.mjs`

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
- Corrections before exact-plan review: removed the proposed separate intake huddle per Feature Hill/Coulson process simplification
- Mack findings: `null` (planning only)
- Fury findings: pending exact-plan review
- Accepted output so far: exact-base Daisy reconnaissance summarized above
- Next legal action: exact committed-plan Fury review only
