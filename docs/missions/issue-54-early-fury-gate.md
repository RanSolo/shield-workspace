# Mission Brief: Issue #54 Early Fury Architecture Gate

- **Canonical issue:** `RanSolo/shield-workspace#54`
- **Mission state:** Wheels Up authorized by Phil Coulson
- **Base revision:** `62d4f887287897c8fd2afb5be631a6437c896edd`
- **Delivery strategy:** standard sequential S.H.I.E.L.D.
- **Implementation owner:** Melinda May
- **Human authority:** Phil Coulson

## Objective

Enforce a versioned Fury plan gate before Melinda May may begin production
implementation in standard Delivery Mode. The gate must catch architectural,
authority, compatibility, replay, and fail-open defects while they remain
planning changes, preserve May's ownership, and retain the separate final Fury
conformance and human Fitz technical-review gates.

The Fury plan decision is advisory operational evidence. It does not grant
authority, approve a mission, change mission state, satisfy human review,
authorize merge, or replace the Issue #10 permission boundary.

## Dependencies and evidence

- Issue #44 and its merged draft-PR workflow provide the existing verified
  Mission Workspace publication and receipt seam.
- Issue #58 and PR #62 provide a pure non-authoritative readiness contract and
  prove exact-revision, ownership, attribution, bounded-repair, and fail-closed
  patterns.
- Issue #34 provides the first observational early-Fury evidence: six contract
  deficiencies were corrected before production implementation without
  redesigning the mission.
- Issue #41 remains the prospective adaptive-refinement experiment. This
  mission does not automate Hill refinement or score prediction accuracy.

The dependency order remains:

```text
#58 -> #54 -> #41 -> #61 -> Freeze Runtime Contracts v1
```

## Corrected Delivery Mode sequence

```text
Coulson approval
-> committed Mission Brief and May blueprint
-> verified draft PR Mission Workspace
-> Fury plan review
-> bounded May reconciliation when required
-> production implementation dispatch
-> validation
-> Fury exact-head conformance review
-> human Fitz technical review
-> Coulson
```

Planning artifacts required to construct and review the blueprint may be
committed before the Fury gate. Production implementation edits and execution
remain denied until the plan gate is satisfied.

## Frozen Phase 1 architecture

### Plan-review record

Add one closed `fury.plan-gate.v1` contract. A plan-review record binds:

- contract version;
- mission and subject IDs;
- blueprint artifact ID, kind, owning seat, and exact reviewed revision;
- review ID;
- derived reviewer seat `fury`;
- verdict;
- bounded required-change records and opaque evidence references;
- explicit `host_asserted_non_authoritative` assurance.

For Phase 1, the blueprint path must exactly equal
`workspacePlan.missionBriefPath`. The reviewed blueprint is the May-owned plan
embedded in this committed Mission Brief, so existing clean, tracked,
committed, and exact-head checks cover its path without another verification
mechanism. Artifact identity, path, and May ownership remain trusted-host
assertions bound to that head, not content or authorship proof.

The three verdicts are:

- `PASS`
- `PASS_WITH_REQUIRED_CHANGES`
- `FAIL`

Callers cannot supply reviewer identity, authority, dispatch state, merge state,
or human approval. Runtime and tool-executor attribution remain separate from
the Fury seat and are either explicit host assertions or unobservable.

### Exact-revision behavior

For `PASS`, implementation dispatch is eligible only while the current
blueprint identity, owner, and exact revision equal the reviewed artifact.
Any later artifact change makes the review stale.

`FAIL` always denies implementation dispatch. Findings identify the minimum
architectural or Coulson decision required; they do not transfer implementation
ownership to Fury or Hill.

### Required-change reconciliation

`PASS_WITH_REQUIRED_CHANGES` requires a separate closed reconciliation record
that binds:

- the original review ID and reviewed revision;
- the corrected blueprint identity and exact revision;
- May as the unchanged artifact owner;
- Hill as operational verifier;
- every required change ID exactly once with an `incorporated` disposition;
- `additionalArchitectureChange: false`;
- explicit `host_asserted_non_authoritative` assurance.

`additionalArchitectureChange: false` means the correction contains no
architecture change beyond the exact bounded changes Fury prescribed. Missing,
duplicate, unknown, or undisposed changes deny dispatch. Any unprescribed
architecture, scope, authority, mission, subject, artifact, ownership,
workspace-identity, or unrelated design change requires a new Fury plan review.
A revision after the reconciled exact revision also makes the gate stale.

The reconciliation avoids an automatic second broad review only for the exact
bounded corrections Fury already required. It does not permit Hill or May to
classify a genuine redesign as a correction.

### Trust boundary

A trusted orchestrating host is the Phase 1 provenance boundary. It constructs
the expected binding from configured mission inputs and the verified workspace
receipt, supplies Fury review and Hill reconciliation as host-asserted evidence,
asserts whether any additional unprescribed change occurred, and enforces the
mission-wide correction cap.

The contract validates, normalizes, binds, and labels those assertions; it does
not prove Fury or Hill acted, authenticate a model or person, verify a GitHub
comment, inspect semantic content, replay the Mission Journal, or grant
authority.

The gate is an additional veto inside the already authorized Delivery Mode
dispatch path. Coulson approval and the verified PR workspace receipt remain
independently required. Missing or false host assertions cannot be repaired by
this pure value contract.

The evaluator is stateless. It cannot enforce global review or reconciliation
ID uniqueness, detect same-binding reuse, maintain durable consumption state,
prove the absence of unprescribed changes, or enforce the correction cap across
calls. Same-context evaluation is intentionally deterministic and idempotent.
Contextual mismatch and staleness are the complete v1 replay boundary.

If implementation proves that the plan decision must become authoritative
mission state or requires a new signed receipt, work stops and returns to
Coulson rather than changing the Kernel or Mission Journal in this issue.

### Mission Workspace and dispatch seam

Extend the existing
`github/delivery-workspace.mjs:prepareDeliveryWorkspaceForDispatch` guard. Do
not duplicate `github/pr-workspace.mjs` publication mechanics.

The guard continues to create or reuse and verify the draft PR after Coulson
approval and the committed Mission Brief. Before a valid Fury gate exists, it
returns a closed `workspace_ready` result containing the verified receipt but
never `dispatch_ready`.

Before any Git or GitHub command, the guard uses descriptor-safe inspection to
normalize the outer input, `workspacePlan`, `blueprintArtifact`, and every
nested record and array in a non-null `planGate`. Missing or unknown fields,
accessors, inherited substitutes, symbols, sparse or extra-property arrays,
non-plain prototypes, excessive values, and reflective failures are rejected.
The normalized blueprint path must equal the normalized Mission Brief path.

Literal `planGate: null` is the sole valid pending-review form and may create or
reuse the early draft workspace. A missing or malformed non-null gate,
malformed blueprint assertion, or path mismatch returns `blocked` with no
runner commands. Receipt-dependent semantic checks occur after verified
publication and use only the normalized snapshot rather than rereading caller
objects.

On a later call, the same guard reuses and reverifies the draft PR, evaluates
the exact plan gate against the current blueprint revision, and returns
`dispatch_ready` only when all existing and new conditions match.

GitHub publication success cannot substitute for Fury review. Fury review
cannot substitute for Coulson approval or the verified workspace receipt.
Repeated calls reuse the existing draft PR and preserve chronological
human-facing handoffs.

### Failure semantics

The following fail closed without implementation dispatch:

- missing, malformed, unsupported, hostile, or ambiguous inputs;
- unknown fields, accessors, inherited values, sparse arrays, symbols, or
  reflective failures;
- wrong mission, subject, artifact, kind, owner, revision, branch, repository,
  or PR;
- forged reviewer-seat, runtime, executor, or authority fields;
- stale, duplicated, replayed, or mismatched reviews;
- `FAIL`;
- incomplete or architecture-changing required-change reconciliation;
- PR publication, update, or readback failure.

Errors use bounded closed codes and never contain secrets, private reasoning,
raw model output, or caller-controlled diagnostic prose.

Structurally invalid pre-command input is `blocked` with an empty command list.
A structurally valid workspace with a pending, stale, failed, mismatched, or
incompletely reconciled gate is `workspace_ready`, never `dispatch_ready`.

## May implementation blueprint

### Mandatory guard inputs

The Delivery Workspace guard adds required `missionId`, `subjectId`,
`blueprintArtifact`, and `planGate` fields. `planGate: null` is the sole explicit
review-pending state; omission is invalid and cannot preserve the old fail-open
dispatch behavior.

The blueprint assertion contains exactly:

```text
artifactId
artifactPath
artifactKind: implementation_blueprint
owningSeatId: may
```

The path is bounded and repository-relative, and must exactly equal
`workspacePlan.missionBriefPath`. The existing adapter proves that combined
Mission Brief/blueprint artifact is clean, tracked, committed, and bound to the
receipt head. It does not prove semantic contents or authorship.

### Review and workspace binding

The review record contains exact closed fields for:

- schema, contract, and non-authoritative assurance;
- review ID, mission ID, and subject ID;
- repository owner/name, base branch, mission branch, and PR number;
- blueprint artifact ID/path/kind, May ownership, and reviewed revision;
- verdict, findings, reasoning runtime, and tool executor.

Fury's reviewer seat is derived rather than caller supplied. Runtime and
executor IDs are nullable assertions, cannot equal a S.H.I.E.L.D. seat ID, and
must differ when both are non-null.

A finding contains one unique ID, one closed class, and bounded opaque evidence
references. Closed finding classes are:

- `architecture`
- `authority`
- `compatibility`
- `replay_safety`
- `fail_closedness`
- `implementation_boundary`
- `validation_readiness`
- `operational_completeness`

`PASS` has zero findings and no reconciliation. `PASS_WITH_REQUIRED_CHANGES`
has 1-16 findings. `FAIL` has 1-16 findings and no reconciliation.

### Reconciliation record

The closed reconciliation repeats the complete workspace, mission, subject,
artifact, owner, review, and original-revision binding. It adds a distinct
corrected revision, `additionalArchitectureChange: false`, and one `incorporated`
disposition for every Fury finding. Hill's verifier seat is derived rather than
caller supplied.

The corrected revision must differ from the reviewed revision. Missing,
duplicate, unknown, or extra dispositions; any other disposition; any
additional or unprescribed architecture/scope/authority/subject/ownership
change; a changed binding; or a current head different from the corrected
revision denies dispatch.

### Normative bounds

- Identifiers: 1-128 UTF-8 bytes under a closed ASCII grammar.
- Evidence references: 1-256 UTF-8 bytes, unique within their record.
- Blueprint path: at most 512 UTF-8 bytes with no absolute path, backslash,
  empty segment, dot segment, traversal, control byte, or percent-encoded
  ambiguity.
- Git revisions: 40-64 lowercase hexadecimal characters.
- PR number: safe integer from 1 through 2,147,483,647.
- Findings/dispositions: at most 16.
- Evidence references: at most 8 per record and 64 across the gate.
- Objects: exact own data properties only.
- Arrays: dense native arrays without extra properties.

Accessors, symbols, inherited fields, non-plain prototypes, sparse arrays,
throwing proxies, unknown fields, unsupported versions, excessive values, and
reflective failures return bounded non-echoing ineligible results.

### Closed gate reasons

Evaluation uses these bounded reasons in priority order:

```text
INVALID_EXPECTED_BINDING
PLAN_REVIEW_REQUIRED
INVALID_PLAN_REVIEW
REPLAY_BINDING_MISMATCH
REVIEW_REVISION_STALE
REVIEW_FAILED
RECONCILIATION_REQUIRED
INVALID_RECONCILIATION
RECONCILIATION_BINDING_MISMATCH
CORRECTED_REVISION_NOT_DISTINCT
ADDITIONAL_ARCHITECTURE_CHANGE_REVIEW_REQUIRED
REQUIRED_CHANGE_SET_MISMATCH
RECONCILIATION_REVISION_STALE
```

The normalized result derives Fury and, where applicable, Hill seat IDs; labels
authority as non-authoritative and evidence as reference-only; preserves the
exact binding; and reports only `eligible` or `ineligible`. Invalid results do
not echo partially inspected identity or evidence.

### Guard order and result union

The guard order is fixed:

1. Descriptor-safely normalize the complete blueprint assertion and non-null
   gate without invoking caller accessors, and require the blueprint path to
   equal the Mission Brief path. Invalid input blocks with zero commands.
2. Apply the unchanged Coulson specialist-dispatch approval veto.
3. Call the unchanged create-or-update PR adapter.
4. Require and revalidate the exact draft-workspace receipt.
5. Construct the expected plan binding from normalized host assertions and the
   verified receipt.
6. Evaluate the pure Fury plan gate.
7. Return `dispatch_ready` only for literal gate eligibility.
8. Otherwise return `workspace_ready` with the verified receipt and bounded
   ineligible evaluation.

Authorization, publication, and receipt failures remain `blocked` and preserve
their current semantics. Callers must dispatch only on literal
`state === "dispatch_ready"`; treating any non-blocked result as permission is
invalid.

This is an intentional pre-1.0 hardening of the public GitHub guard. All current
repository consumers, declarations, examples, and tests migrate together. No
optional overload or transitional fail-open default is permitted.

Contextual reuse of the same review ID against the same exact binding is
deterministic and idempotent. Reuse against any changed binding is denied.
Global uniqueness, durable consumption, and cross-process replay detection are
explicitly outside v1 and trigger the mission stop condition if required.

## Expected implementation surface

- one internal pure Fury plan-gate contract;
- the existing Delivery Workspace orchestration guard;
- existing `@shield/team-system/github` runtime declarations and exports;
- focused contract and dispatch-guard tests;
- Delivery Mode playbook, mode description, and Definition of Ready;
- one bounded normative specification and public API documentation if the
  existing GitHub subpath surface changes.

No new package subpath is expected. No Mission Journal, Kernel readiness,
permission, runner, delegation, broker, runtime-profile, Mission Control, or
GitHub publication-mechanics change is expected.

## Acceptance criteria

- [ ] Standard Delivery Mode places the Fury plan gate after the committed
      blueprint and verified draft workspace but before production
      implementation.
- [ ] The draft workspace may exist while Fury review is pending, but the guard
      cannot return `dispatch_ready`.
- [ ] The Phase 1 blueprint path exactly equals the verified Mission Brief path.
- [ ] Malformed blueprint or non-null gate input blocks before any runner
      command; literal `null` still permits the early workspace.
- [ ] An exact current `PASS` permits dispatch only alongside Coulson approval
      and a verified matching PR receipt.
- [ ] `PASS_WITH_REQUIRED_CHANGES` requires a complete exact-revision bounded
      reconciliation owned by May and verified by Hill.
- [ ] `FAIL` always denies dispatch.
- [ ] A changed blueprint or reconciled revision invalidates the prior gate.
- [ ] Any additional or unprescribed architecture, scope, authority, subject,
      ownership, workspace, or unrelated design change requires renewed Fury
      review.
- [ ] Missing, malformed, stale, replayed, mismatched, hostile, or ambiguous
      evidence fails closed.
- [ ] Review and reconciliation evidence remain explicitly non-authoritative.
- [ ] Documentation states that the trusted host owns provenance and the
      mission-wide correction cap, while global replay and semantic proof remain
      outside the stateless evaluator.
- [ ] Fury findings and final conformance findings are recorded separately.
- [ ] May remains sole implementation owner.
- [ ] Repeated publication reuses the existing draft PR.
- [ ] Final Fury conformance, human Fitz review, and Coulson merge authority
      remain unchanged.
- [ ] Focused, package, workspace, packed-consumer, dry-run, and diff checks
      pass.

## Benchmark evidence

Record:

- Hill readiness outcome when prospectively available, without treating #54 as
  the #41 experiment;
- Fury plan-review duration, verdict, finding count, and finding classes;
- required blueprint revisions and bounded reconciliation cycles;
- findings prevented before implementation;
- implementation and validation duration;
- final Fury conformance findings;
- discarded implementation work and restarts;
- per-seat runtime, executor, context, tokens, latency, and cost when observable;
- human interventions and exact revisions at every gate.

Measured, derived, estimated, and not-observable values remain distinct.

## Explicit non-goals

- automated architecture scoring;
- autonomous or recursive refinement;
- repeated broad Fury reviews for bounded required changes;
- Hill-authored changes to May's blueprint or implementation;
- making Fury authoritative or human;
- redesigning Issue #10 permission or runtime-binding contracts;
- changing the Mission Journal or Kernel authority;
- global replay registries, durable review consumption, authenticated Fury/Hill
  provenance, semantic diff proof, or stateful correction-cap enforcement;
- Mission Control, dashboards, analytics products, runtime profiles, parallel
  orchestration, merge, deployment, release, or production effects.

## Delivery gates

1. Daisy reconnaissance.
2. May-owned blueprint.
3. Hill operational-readiness check where applicable.
4. Verified draft PR Mission Workspace.
5. Fury Threat Review against the exact blueprint revision.
6. At most one bounded May reconciliation.
7. May-owned implementation and focused tests.
8. Hill integration validation.
9. Fury Conformance Review at the exact head.
10. Human Fitz technical review.
11. Coulson retains merge authority.

## Authorization and stop conditions

Phil Coulson authorized the Mission Brief commit, verified draft Mission
Workspace, sequential implementation, one bounded May correction, Fury reviews,
and human Fitz review. Merge, deployment, release, and production effects remain
unauthorized.

Implementation stops if the slice requires authoritative Fury state, signed
Fury evidence, Mission Journal or Kernel changes, duplicated GitHub adapter
behavior, global replay or durable consumption state, semantic diff proof,
stateful correction-cycle enforcement, unbounded review cycles, ownership
transfer, or any excluded system.
