# Approved Mission Brief: Issue #39 Wheels Off

- **Issue:** `RanSolo/shield-workspace#39`
- **Authorization:** Explicit Coulson Wheels Up; Wheels Off did not bootstrap itself
- **Architecture:** Fury PASS
- **Implementation scope:** Kernel contracts, replay, local stores, CLI, tests, and documentation

## Objective

Add deterministic delegated mission initiation through a signed standing Coulson
policy while preserving supervised authorization and every downstream review gate.

## Bounded deliverables

- closed, content-addressed `wheels_off.v1` delegation and eligibility contracts;
- signed append-only grant, revision, and revocation history;
- fixed ordered Kernel eligibility evaluation;
- atomic delegated mission initialization and replayable authorization event;
- authorization source in status and report;
- explicit delegated invalidation and supervised fallback;
- schema-v2 supervised compatibility and schema-v3 delegated journals.

## Exclusions

No policy language, model judgment, runner, executor, host inspection, adapter,
automatic monitoring, merge, deployment, release, destructive action, permission
widening, or automatic PR creation is authorized.

## Review gate

Implementation publishes as a draft PR. Fury must approve its exact head before
Hill marks it ready for Fitz. Any later commit invalidates Fury's approval.
