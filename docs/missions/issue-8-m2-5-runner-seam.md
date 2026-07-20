# Approved Mission Brief: Issue #8 Minimum Runner Seam

- **Canonical issue:** [`RanSolo/shield-workspace#8`](https://github.com/RanSolo/shield-workspace/issues/8)
- **Roadmap:** M2-5
- **Mission state:** approved
- **Approval source:** Phil Coulson — dependency-first Wheels Up
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill

## Objective

Implement the minimum stable one-cycle runner seam required by Issue #10. One
invocation may plan and advance at most one supervised cycle, consult exactly
one injected pre-executor authorization boundary, invoke at most one injected
executor, validate all untrusted results, and return an explicit stop or next
route with journal-ready evidence.

## Dependency gate

- Issue #6 — mode runtime: complete.
- Issue #7 — mission journals and recovery: complete.
- Issue #23 — K2-4.5 authority, evidence, and readiness semantics: complete.
- Issue #28 — host-neutral adapter contract and GitHub adapter: complete.
- Issue #44 — early draft PR enforcement: complete on canonical `main`.

Issue #10 and Issue #34 remain Wheels Off. They consume this seam later and are
not implementation dependencies for the pure runner core.

## Approved participants

- Maria Hill — mission coordination, draft PR workspace, validation, and status
- Daisy Johnson — existing-contract reconnaissance
- Nick Fury — runner boundary and exact-head architecture review
- Melinda May — bounded implementation after the draft PR receipt is verified
- Leo Fitz — human technical review after Fury passes the exact revision
- Phil Coulson — mission approval, acceptance, and merge authority

Jemma Simmons is out of scope because this is an internal runtime contract with
no product or domain behavior change.

## Activated modes

- Delivery Mode

## Risk flags

- production: false
- destructive: false
- migration: false
- credentialsOrSecurity: false
- externalCommunication: true
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

## Approved architecture

### Pure cycle contract

Define closed versioned cycle-plan and cycle-result contracts. A plan binds the
mission, subject, exact revision, evaluated journal sequence, participating
seat, exact activated modes, allowlisted action ID, effect class, stable effect
key, validation ID, and explicit stop condition.

The pure runner validates caller-supplied Kernel projections and exact mode
context. It never creates authority, readiness, participants, modes, or scope.

### Pre-executor seam

After plan and projection validation, and immediately before any executor call,
the runner invokes one injected authorization function. The function returns a
closed `allow`, `wait`, or `deny` decision bound to the exact mission, subject,
revision, journal sequence, action, and effect class.

Issue #8 owns this invocation point and its ordering. Issue #10 later owns the
permission policy and runtime-binding evaluation supplied at that point.

### One injected executor

Only an `allow` decision may reach the injected executor. One invocation calls
the executor at most once. The runner treats thrown errors, malformed results,
uncertain effects, and identity drift as stop outcomes rather than retries.

### Result validation and journal evidence

Executor and validator outputs are untrusted. Successful validation produces a
closed cycle result and journal-ready execution/effect evidence tied to the
same mission, revision, sequence, action, and effect key. The runner does not
write journals or perform filesystem effects; the existing journal adapter
remains responsible for persistence.

Completed effect keys supplied by authoritative replay prevent re-execution.
An uncertain effect always stops for Coulson and is never reported complete.

## Acceptance criteria

- Closed plan, permission-decision, executor-result, validator-result, and
  cycle-result shapes reject missing, unknown, inherited, malformed, and
  unsupported values.
- One invocation advances at most one cycle and calls at most one injected
  authorization function, executor, and validator in the documented order.
- Governance must be approved, execution active, execute-readiness `ready`, the
  exact revision current, the journal sequence unchanged, the seat participating,
  and exact activated modes resolved before authorization is requested.
- Hill cannot be selected for production implementation. May owns approved
  behavioral implementation actions in the initial policy.
- Fitz and Simmons are never synthesized or dispatched.
- Action IDs must appear in the caller-supplied allowlist before authorization
  or execution.
- `wait` and `deny` never call the executor.
- Stale or mismatched authorization decisions never call the executor.
- Executor and validator failures return explicit deterministic stops.
- Completed effects are not re-executed.
- Uncertain effects stop for Coulson without a completion receipt.
- Successful results return journal-ready evidence but do not write it.
- Restart tests derive the next result solely from authoritative replay inputs.
- The pure decision core has no filesystem, network, shell, host, clock, model,
  or GitHub dependency.
- Existing tests, strict packed-consumer validation, package dry run, and
  `git diff --check` pass.

## Explicit non-goals

- Issue #10 permission rules, runtime binding, tool-executor identity, or audit
  ledger implementation
- Issue #34 broker, capability probes, writability attestations, or tools
- real model invocation, provider routing, prompts, or general escalation
- open-ended loops, background execution, scheduling, polling, or retries
- automatic repair beyond exposing an explicit stop/route result
- GitHub, Jira, filesystem, shell, deployment, release, or other clients
- synthetic Fitz or Simmons participation
- merge, deployment, release, destructive Git, or credentials
- Mission Control or UI

## Validation plan

- Focused runner contract and one-cycle behavior tests.
- Tests for allow, wait, deny, stale decision, unknown action, wrong seat, mode
  mismatch, duplicate effect, executor throw, malformed executor output,
  validation failure, uncertain effect, and deterministic restart.
- Source-boundary test proving the pure module has no environmental imports.
- Full `@shield/team-system` and workspace test suites.
- Packed strict-TypeScript consumer validation and package dry run.
- Fury exact-revision sanity review followed by Fitz human technical review.

## Review publication

Wheels Up authorizes this mission branch, Mission Brief commit, push, and draft
PR publication. Hill must verify the exact draft PR receipt before May begins
implementation. Fury must pass the exact implementation revision before Hill
marks the PR Ready for Review. Any later implementation commit invalidates that
pass.

## Stop condition

Stop with the minimum runner seam implemented, validated, and ready for Fitz.
Do not begin Issue #10 or Issue #34, and do not merge, deploy, or release.
