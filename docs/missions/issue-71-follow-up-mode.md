# Mission Brief — Issue #71 Follow-up Mode

## Objective

Create the smallest Follow-up Mode foundation for asynchronous pull-request
review. Delivery Mode may publish a validated PR and stop active execution while
human review is pending. Later GitHub review/check activity resumes the mission
through a bounded, exact-head evidence packet instead of re-running full intake.

## Scope

- Represent awaiting-review and follow-up-required lifecycle snapshots as
  GitHub adapter candidates.
- Bind every snapshot to the exact repository, branch, pull request, and head
  revision.
- Classify unresolved findings as implementation, evidence,
  architecture/conformance, advisory, false positive, or human decision.
- Route findings to the owning seat: May, Daisy, Fury, Hill, or Coulson.
- Require Fury follow-up evidence when a finding may affect architectural
  conformance.
- Preserve concise reply requirements as evidence for later publication.

## Boundaries

- The GitHub adapter does not grant authority, readiness, merge permission, or
  mission completion.
- Follow-up snapshots are non-authoritative evidence; Hill and the mission
  policy decide whether a bounded repair pass is eligible under Issue #67.
- GitHub publication mechanics, review replies, rereview requests, and merge
  authority remain separately governed.
- SonarQube and other scanner-specific evidence ingestion are out of scope for
  this issue.

## Acceptance evidence

- Adapter v1 validates a new `follow_up_snapshot` candidate kind.
- The GitHub public API exposes `createGitHubFollowUpCandidate`.
- Awaiting-review snapshots require no findings.
- Follow-up-required snapshots require at least one unresolved finding.
- Stale or mismatched head revisions fail closed.
- Architecture/conformance findings must route to Fury.
- Human-decision findings must route to Coulson.
- Findings cannot carry human authority identity or binding authority.

