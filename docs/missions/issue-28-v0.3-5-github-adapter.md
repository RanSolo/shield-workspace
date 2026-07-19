# Approved Mission Brief: Issue #28 GitHub Host Adapter

- **Canonical issue:** [`RanSolo/shield-workspace#28`](https://github.com/RanSolo/shield-workspace/issues/28)
- **Roadmap:** V0.3-5
- **Authorization:** Supervised Coulson Wheels Up after `wheels_off.v1` failed closed
- **Architecture:** Fury approved the bounded design
- **Risk:** `externalCommunication: true`

## Objective

Deliver GitHub as SHIELD's first supported host through one host-neutral adapter
contract without granting the adapter authority over mission meaning.

## In scope

- closed adapter contract version 1 with `human_evidence` and
  `communication_result` inbound candidate kinds;
- journal v4 communication request/result semantics;
- exact-revision publication of Mission Briefs, status, and review artifacts;
- requesting Fitz and conditionally required Simmons evidence;
- reading signed candidate evidence tied to an exact PR head;
- a manual evidence path through the same Kernel boundary;
- stable, host-neutral communication failures;
- intentional `@shield/team-system/adapter` and
  `@shield/team-system/github` package surfaces;
- v2/v3 replay and existing workspace compatibility.

## Invariants

1. The Kernel alone accepts evidence and derives readiness.
2. Delivery is not approval; delivery failure is not rejection.
3. GitHub identities and permissions are provenance, not authority.
4. Every accepted candidate binds the canonical subject and exact revision.
5. Rejected candidates never mutate the journal.
6. GitHub and manual evidence have identical Kernel meaning.
7. No external effect occurs before a journaled communication request.
8. Existing journal versions replay without reinterpretation.

## Explicit exclusions

- adapter-defined authority, readiness, governance, or completion;
- unsigned GitHub reviews as evidence;
- arbitrary GitHub actions or mutable PR references as revision identity;
- polling, scheduling, model invocation, runners, or seat dispatch;
- additional hosts, adapter registries, or plugin systems;
- merge, deployment, release, permission widening, or scope expansion.

## Review publication

Wheels Up authorizes the mission branch, commits, push, and draft PR publication.
Fury must approve the exact PR head before Hill marks it Ready for Review for
Fitz. Any later commit invalidates Fury's approval.

## May runtime binding

```yaml
mission: issue-28
authorizedSeat: may
actingRuntime: codex_subagent
runtimeTask: /root/may_issue28_runtime
repositoryRoot: /Users/ransolo/Code/shield-workspace
branch: codex/issue-28-github-host-adapter
capabilityProbe:
  repositoryEdit: verified
  terminalExecute: verified
  commandResultRead: verified
  validationExecute: verified
  iterativeToolLoop: verified
  reversibleCleanup: verified
ownership:
  accepted: true
  draftDisposition: revise
  priorCodexDraftAttributedToMay: false
```

## Implementation history

```yaml
- type: implementation.started
  timestamp:
    value: 2026-07-19T05:02:15Z
    provenance: hostObserved
  mission: issue-28
  seat: may
  runtimeTask: /root/may_issue28_runtime
  draftDisposition: revise
- type: implementation.validated
  timestamp:
    value: 2026-07-19T05:24:15Z
    provenance: hostObserved
  mission: issue-28
  seat: may
  focusedTests: 29/29
  packageTests: 124/124
  packageDryRun: passed
```
