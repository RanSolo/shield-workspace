# Approved Mission Brief: PR Mission Workspace MVP

- **Source issue:** [`RanSolo/shield-team-system#40`](https://github.com/RanSolo/shield-team-system/issues/40)
- **Canonical issue:** [`RanSolo/shield-workspace#3`](https://github.com/RanSolo/shield-workspace/issues/3)
- **Mission state:** approved
- **Approval source:** Phil Coulson — `Wheels up!`
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill

## Objective

Create an early Delivery Mode vertical slice that opens a draft pull request immediately after Coulson approves a mission and uses that PR as the visible team communication workspace.

## Approved participants

- Maria Hill — coordination, GitHub operations, validation, status
- Daisy Johnson — reconnaissance and evidence gaps only
- Nick Fury — architecture, sequencing, implementation sanity review
- Melinda May — implementation
- Phil Coulson — approval and merge authority

Fitz and Simmons are out of scope unless explicitly requested.

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

## Scope

- Canonical issue linked to old #40.
- Deterministic, idempotent mission branch and draft-PR creation after explicit approval.
- Durable approved Mission Brief committed before implementation.
- Canonical PR body and structured team update protocol.
- Fail-closed safety, attribution, secret exclusion, and GitHub-unavailable behavior.
- Documentation and focused tests.

## Non-goals

- Kernel event synchronization, persistence, runner dispatch, mode loading, model routing, review automation, cross-repository missions, UI, merge, deploy, or release.

## Validation

- Focused PR-workspace tests.
- Full `@shield/team-system` tests.
- `git diff --check`.
- Fury implementation sanity review.

## Stop condition

Stop with a validated draft PR ready for Coulson review. Do not merge.
