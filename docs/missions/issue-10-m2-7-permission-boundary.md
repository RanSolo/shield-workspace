# Approved Mission Brief: Issue #10 Runtime Binding and Permission Boundary

- **Canonical issue:** [`RanSolo/shield-workspace#10`](https://github.com/RanSolo/shield-workspace/issues/10)
- **Roadmap:** M2-7
- **Mission state:** approved
- **Approval source:** Phil Coulson — explicit Wheels Up after Issue #8 merge
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill

## Objective

Implement the minimum deny-by-default runtime-binding and per-tool-call
permission boundary for the supported mission workflow. Every tool invocation
must receive a fresh decision at the existing Issue #8 pre-executor seam. The
decision must bind the authorized seat, reasoning runtime, actual tool executor,
mission state, exact artifact and journal revision, repository, action, effect,
and approved scope without allowing any runtime or executor to inherit seat
authority.

## Dependency gate

- Issue #23 — authority, evidence, readiness, and journal semantics: complete.
- Issue #8 — stable one-cycle runner and pre-executor seam: complete through
  merged PR #47 (`abb2beea7883ef5b506cc8e5a1f17831889818ba`).
- Issue #3 and Issue #44 — draft PR Mission Workspace and verified early-draft
  dispatch gate: complete.

The exact Issue #8 gate is `runRunnerCycle` invoking one injected
`authorize(cycle.plan)` after closed projection checks and immediately before
the only executor call. Non-allow, malformed, thrown, or identity-stale
decisions cannot reach the executor. The validated opaque authorization
artifact is frozen and delivered unchanged to the executor gateway.

No additional runner capabilities are prerequisites for Issue #10.

## Approved participants

- Maria Hill — coordination, Mission Workspace, validation, and handoffs
- Daisy Johnson — contract and boundary reconnaissance
- Nick Fury — exact-head architecture review
- Melinda May — bounded implementation after draft PR verification
- Leo Fitz — human technical review after Fury passes the exact revision
- Phil Coulson — mission approval, runtime-substitution authority, acceptance,
  and merge authority

Jemma Simmons is out of scope because this mission changes infrastructure
permission contracts without product or domain behavior.

## Activated modes

- Delivery Mode

## Risk flags

- production: false
- destructive: false
- migration: false
- credentialsOrSecurity: true
- externalCommunication: true
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

## Approved architecture

### Three distinct identities

- `seatId` identifies responsibility and authority.
- `reasoningRuntimeId` identifies the runtime performing reasoning.
- `toolExecutorId` identifies the runtime or host actually invoking tools.

Runtimes and executors are not seats and never inherit seat authority. Human
trusted bindings remain separate from runtime bindings.

### Authoritative runtime binding

Add a new supervised-journal version for authoritative
`runtime.binding_recorded` and `runtime.binding_superseded` events. Replay must
derive exactly one active binding for a mission, subject, and authorized seat or
fail closed.

A binding records its ID and version, seat, reasoning runtime, tool executor,
repository identity, canonical writable root, branch, artifact revision,
approved action/effect scope, creation sequence, and lifecycle state.

Initial binding and runtime substitution require explicit Coulson evidence
bound to the exact mission, subject, binding content, artifact revision, and
next journal sequence. Substitution creates a new binding version and
supersedes the prior binding; it is never automatic or inferred from fallback.

The Mission Journal is the authoritative record of governance and binding
state. Older journal versions remain replayable without reinterpretation.

### Host attestations are bounded inputs

The evaluator accepts host-observed capability, repository-root, and
writability attestations as closed, freshness-bounded inputs. They prove only
operational capability. They do not grant authority, readiness, occupancy, or
permission.

Issue #34 owns producing real probes, canonical-root discovery, writability
checks, and broker behavior. Issue #10 owns validating supplied attestations and
using them as deny-by-default decision inputs.

### Fresh per-call permission decision

Issue #10 supplies the injected authorizer at the Issue #8 seam. Every decision
must bind at minimum:

- mission and subject;
- authorized seat;
- reasoning runtime;
- tool executor;
- binding ID and version;
- repository identity and canonical writable root;
- branch and exact artifact revision;
- journal sequence;
- cycle, requested action, and effect class/key;
- approved scope and required capabilities.

The evaluator returns `allow`, `wait`, or `deny` with stable reasons and a
closed structured evidence object inside the existing runner authorization
artifact. Missing, stale, malformed, ambiguous, revoked, superseded,
substituted, mismatched, unknown, or out-of-scope inputs fail closed.

One runner cycle corresponds to one actual tool invocation. An executor must
not bundle unexamined tool calls behind one decision. A decision is single-use
and cannot be reused across calls, executors, actions, revisions, sequences,
roots, branches, binding versions, or scopes.

### Append-only audit ledger

Define a separate append-only audit ledger for high-volume permission decisions
and tool-call/result records. Records preserve mission, seat, reasoning-runtime,
tool-executor, binding, action, effect, decision, and correlation identities.

The audit ledger is operational evidence only. It cannot grant authority,
modify or supersede journal state, satisfy readiness, or redefine mission
state. Failure to validate and durably append the required pre-call audit record
prevents dispatch. Results, including uncertain outcomes, are attributed to the
actual executor without secrets, credentials, private reasoning, or fabricated
runtime attribution.

## Acceptance criteria

- Closed binding, supersession, attestation, request, decision, artifact, and
  audit-record contracts reject missing, unknown, inherited, malformed,
  ambiguous, and unsupported values without throwing.
- Journal replay deterministically derives exactly one active runtime binding;
  conflicting, revoked, stale, or ambiguous histories fail closed.
- Initial binding and every substitution require exact Coulson authorization.
- Runtime substitution supersedes the prior binding and remains fully auditable.
- The pure evaluator produces a fresh deny-by-default decision for every tool
  invocation at the Issue #8 authorization seam.
- The structured Issue #10 artifact reaches the executor unchanged, while the
  runner continues to enforce its exact plan identity.
- Capability, repository-root, and writability attestations are host-observed,
  bounded, freshness-checked, and never treated as authority.
- Hill receives only approved coordination scope, Daisy only approved
  reconnaissance/evidence scope, and May only approved implementation scope.
- Fitz and Simmons are never synthesized as tool-using seats or executors.
- Merge, deploy, release, destructive Git, credentials, production-data
  mutation, permission widening, and scope expansion remain human-controlled.
- Audit append failure prevents dispatch; audit replay cannot change binding,
  governance, readiness, or permission authority.
- Tool result records preserve truthful seat/runtime/executor attribution and
  never attribute executor work to the reasoning runtime.
- Post-dispatch uncertainty stops for Coulson and is never reported complete.
- Tests cover every binding dimension, wrong seat/state/readiness, stale
  revision/sequence, runtime or executor mismatch, unauthorized substitution,
  superseded/revoked binding, repository/root/branch mismatch, non-writable or
  stale attestation, unknown capability/action, scope escape, audit failure,
  single-use replay, and human-only actions.
- Existing journal versions, runner behavior, package tests, strict packed
  consumer validation, package dry run, workspace tests, and `git diff --check`
  pass.

## Documentation and implementation evidence

- Document the identity model, binding lifecycle, evaluator inputs, stable
  fail-closed matrix, single-use rule, and journal-versus-ledger authority.
- The implementation PR records truthful seat/runtime/executor attribution and
  permission analytics without secrets or private reasoning.
- Major handoffs use the restored Mission Workspace timeline. PR publication
  mechanics remain owned by the existing GitHub adapter and Issue #44 workflow.

## Explicit non-goals

- Issue #34 tool broker, environmental probes, or repository discovery
- Issue #42 executable May runtime or model invocation
- Issue #13 analytics dashboards, scorecards, or aggregation products
- Issue #32 general occupancy, provider routing, or configurable seat selection
- Issue #38 Mission Dossier
- general sandboxing or unrestricted shell/tool access
- automatic runtime fallback, substitution, repair, retry, or multi-cycle loop
- GitHub adapter or Mission Workspace orchestration changes
- publishing every internal journal or audit event as a PR comment
- merge, deployment, release, destructive Git, credentials, or production work

## Validation plan

- Focused contract, journal replay, evaluator, artifact, audit-ledger, and
  Issue #8 integration tests.
- Hostile-shape and deterministic reason-order tests.
- End-to-end tests proving one fresh decision and pre-call audit append per
  executor invocation, with zero executor calls on every deny/failure path.
- Backward journal replay and restart tests.
- Source-boundary checks proving the evaluator has no filesystem, network,
  shell, clock, provider, GitHub, broker, or model dependency.
- Full package and workspace suites, strict packed consumer, package dry run,
  and `git diff --check`.
- Fury exact-revision sanity review followed by Fitz human technical review.

## Review publication

Wheels Up authorizes this mission branch, Mission Brief commit, push, and draft
PR publication. Hill must verify the exact draft PR receipt before May begins
implementation. Fury must pass the exact implementation revision before Hill
marks the PR Ready for Review. Any later implementation commit invalidates that
pass.

## Stop condition

Stop with the bounded Issue #10 permission boundary implemented, validated, and
ready for Fitz. Do not begin Issue #34, #42, #13, #32, or #38, and do not merge,
deploy, or release.
