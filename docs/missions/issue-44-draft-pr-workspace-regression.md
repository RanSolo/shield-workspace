# Approved Mission Brief: Issue #44 Draft PR Workspace Regression

- **Canonical issue:** [`RanSolo/shield-workspace#44`](https://github.com/RanSolo/shield-workspace/issues/44)
- **Mission state:** approved
- **Approval source:** Phil Coulson — `Wheels Up`
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill
- **Roadmap placement:** priority P0 workflow regression before the next Delivery Mode implementation mission

## Objective

Restore and enforce the existing Delivery Mode communication timeline so a
verified draft pull request exists before specialist implementation begins and
the pull request remains the canonical human-facing mission workspace.

## Approved participants

- Maria Hill — intake, GitHub coordination, receipt verification, dispatch gate,
  validation, and mission status
- Daisy Johnson — focused regression evidence when additional reconnaissance is
  required
- Nick Fury — architecture and implementation sanity review
- Melinda May — bounded implementation after the draft PR gate is satisfied
- Leo Fitz — human technical review after Fury passes the exact revision
- Phil Coulson — mission approval, final acceptance, and merge authority

Jemma Simmons participates only if a product or domain review becomes required.

## Activated modes

- Delivery Mode
- Debugger Mode for the confirmed orchestration regression

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

## Approved scope

- Create or reuse the draft PR after this approved Mission Brief is committed
  and before May is dispatched.
- Require publication to return a verified receipt tied to the expected
  repository, branch, exact artifact revision, and pull request.
- Fail closed at the Delivery Mode specialist-dispatch boundary when creation,
  update, readback, receipt validation, or identity matching fails.
- Reuse the existing GitHub adapter and PR-workspace publication mechanics.
- Preserve idempotent reuse of exactly one matching open draft PR.
- Publish major human-facing handoffs incrementally with truthful seat
  attribution.
- Preserve the historical handoff trail when the final PR body is summarized.
- Add focused orchestration, receipt, failure, idempotency, and attribution
  tests.

## Invariants

1. Specialist implementation never begins without a verified draft PR receipt.
2. A publication receipt is operational evidence, not authority or readiness.
3. GitHub publication mechanics remain owned by the existing adapter.
4. Models, runtimes, adapters, and tool executors are not seats.
5. Human-facing milestones are published; internal journal noise is not.
6. Final summaries do not erase the chronological handoff record.
7. Merge, deployment, release, and broader authority remain human-controlled.

## Explicit exclusions

- duplicating GitHub branch, PR creation, update, comment, or readback behavior;
- implementing the Issue #8 runner or changing its ownership boundary;
- implementing Issue #10 runtime binding, per-call permissions, or analytics;
- changing broader Kernel authority semantics unless implementation evidence
  proves an existing authoritative readiness contract must carry the receipt;
- publishing every internal journal event;
- merge, deployment, release, or destructive repository operations.

## Acceptance criteria

- The corrective mission dogfoods the sequence: approval, Mission Brief commit,
  verified draft PR, then specialist dispatch.
- PR creation, update, or verification failure denies dispatch.
- Ambiguous or mismatched repository, branch, artifact revision, or PR receipt
  fails closed.
- Repeated publication reuses the existing draft PR.
- Handoff comments preserve truthful seat attribution.
- Final PR-body updates preserve historical comments.
- Existing SHIELD tests, package validation, and `git diff --check` pass.

## Dependencies and relationships

- Issue #3 — completed PR Mission Workspace MVP; reused without duplication.
- Issue #28 — completed GitHub host adapter; remains closed and unchanged.
- Issue #8 — retains the runner and injected-executor boundary.
- Issue #10 — retains runtime binding, per-tool-call permission enforcement, and
  permission analytics.

No open issue is a hard prerequisite for this bounded regression correction.

## Validation plan

- Focused Begin Mission, Delivery Mode, PR-workspace, GitHub-adapter, receipt,
  dispatch-gate, and attribution tests.
- Full `@shield/team-system` test suite.
- Package dry run when the public package surface changes.
- `git diff --check`.
- Fury exact-revision architecture sanity review.
- Fitz human technical review.

## Review publication

Wheels Up authorizes this mission branch, the Mission Brief commit, push, and
draft PR publication. The draft PR must be verified before implementation.
Fury must pass the exact implementation revision before Hill marks the PR Ready
for Review for Fitz. Any later implementation commit invalidates that pass.

## Stop condition

Stop with the regression corrected, validated, documented in the live draft PR
handoff trail, and awaiting required review. Do not merge, deploy, or release.
