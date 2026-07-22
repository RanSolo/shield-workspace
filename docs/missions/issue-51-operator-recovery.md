# Issue #51 — Operator Recovery for Uncertain Mission Effects

## Purpose

An `uncertain` execution-effect record means the system cannot prove whether
an external effect occurred. It is a deliberate fail-closed stop, not a failed
retry and not permission to infer completion.

This runbook describes the evidence-preserving operator response. It does not
add an uncertainty-clearance event, retry policy, or automatic authority.

## When an uncertain effect is produced

The runner or executor must produce an uncertain result when dispatch happened
or may have happened but completion cannot be verified. Examples include:

- the executor throws after dispatch;
- the executor returns a malformed or identity-mismatched result;
- the result audit receipt cannot be durably verified;
- a post-dispatch workspace or validation observation detects drift;
- the validator fails after the external action was attempted.

Before dispatch, malformed, stale, denied, or mismatched inputs remain
non-dispatch stops. They must not be represented as an uncertain external
effect.

## Immediate operator procedure

1. **Stop.** Do not retry the action, edit the journal, delete the record, or
   convert `uncertain` to `completed`.
2. **Preserve the authoritative state.** Retain the exact mission journal,
   effect key, journal sequence, revision, decision, invocation, and result
   evidence. Do not rewrite or truncate append-only records.
3. **Verify identity and scope.** Record the mission and subject, authorized
   seat, reasoning runtime, tool executor, binding version, repository identity,
   canonical writable root, branch, and artifact revision exactly as observed.
4. **Gather external evidence without changing state.** Use the owning service's
   read-only status, transaction, delivery, or audit views where available.
   Capture timestamps, provider/request IDs, and returned status. Never include
   secrets, raw credentials, or private model reasoning in the mission record.
5. **Route to Coulson.** Present the preserved record and sanitized evidence as
   advisory material. Coulson decides whether the external effect is safe to
   leave unresolved, whether a separately authorized compensating action is
   needed, or whether the mission should remain paused or be cancelled.

## What the record means

The authoritative journal remains the source of governance and effect state.
The audit ledger is derived operational evidence only; it cannot grant
permission, change readiness, or redefine the journal projection.

An uncertain effect key remains blocked from re-execution. Restart and replay
must reproduce the same stop until a separately authorized, versioned
governance decision changes the mission state. No operator inference or
provider dashboard can silently create that decision.

## Evidence checklist

Collect, when available:

- exact journal head and the uncertain effect entry;
- mission, subject, seat, runtime, executor, binding, repository, branch, and
  artifact identities;
- action ID, effect class, effect key, requested scope, and journal sequence;
- permission decision and invocation-consumption receipts;
- sanitized executor, validator, and audit outcomes;
- provider-side request or transaction identifiers and read-only status;
- operator, time, source, and limitations for every observation.

If evidence is missing, contradictory, stale, or obtained from an untrusted
source, record that limitation and keep the effect uncertain.

## Attribution and communication

Recovery messages must identify the accountable seat separately from the
reasoning runtime and tool executor. A runtime or executor is not a seat and
cannot approve recovery. Human-facing handoffs should state the exact revision,
current journal head, frozen scope, evidence status, current gate, and next
owner without exposing secrets or private reasoning.

## Explicit non-goals

This document does not authorize:

- automatic retries or duplicate dispatch;
- an uncertainty-clearance or completion event;
- journal deletion, rewriting, or manual sequence repair;
- new permission, broker, provider, or reconciliation policy;
- merge, deployment, release, or external communication authority.

Any executable recovery contract must be proposed as a separate mission with
its own architecture review and Coulson authorization.
