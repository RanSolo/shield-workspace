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
- `architectureChanged: false`;
- explicit `host_asserted_non_authoritative` assurance.

Missing, duplicate, unknown, or undisposed changes deny dispatch. A reconciliation
that changes architecture, scope, ownership, or the reviewed subject requires a
new Fury plan review. A revision after the reconciled exact revision also makes
the gate stale.

The reconciliation avoids an automatic second broad review only for the exact
bounded corrections Fury already required. It does not permit Hill or May to
classify a genuine redesign as a correction.

### Trust boundary

Review and reconciliation inputs are host-asserted operational evidence. The
contract validates, normalizes, binds, and labels them; it does not prove that
Fury acted, authenticate a model, verify a GitHub comment, replay the Mission
Journal, or grant authority.

The gate is an additional veto inside the already authorized Delivery Mode
dispatch path. Coulson approval and the verified PR workspace receipt remain
independently required. Missing or false host assertions cannot be repaired by
this pure value contract.

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
- [ ] An exact current `PASS` permits dispatch only alongside Coulson approval
      and a verified matching PR receipt.
- [ ] `PASS_WITH_REQUIRED_CHANGES` requires a complete exact-revision bounded
      reconciliation owned by May and verified by Hill.
- [ ] `FAIL` always denies dispatch.
- [ ] A changed blueprint or reconciled revision invalidates the prior gate.
- [ ] Architecture-changing reconciliation requires renewed Fury review.
- [ ] Missing, malformed, stale, replayed, mismatched, hostile, or ambiguous
      evidence fails closed.
- [ ] Review and reconciliation evidence remain explicitly non-authoritative.
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
behavior, unbounded review cycles, ownership transfer, or any excluded system.
