# Mission Brief — Issue #72 SonarQube Evidence

## Objective

Treat SonarQube findings as first-class validation and follow-up evidence
without making SonarQube an authority source. The initial increment validates a
host-asserted scanner snapshot, binds it to the exact mission and artifact
revision, classifies findings, and gives Hill closed routing evidence.

## Scope

- Add a public `sonarqube.evidence.v1` evaluator.
- Bind evidence to mission, subject, repository, branch, optional pull request,
  and exact artifact revision.
- Classify findings as blocking, actionable, advisory, false positive,
  uncertain, or architecture/conformance-relevant.
- Route actionable implementation findings to May, uncertain evidence to Daisy,
  architecture/conformance findings to Fury, and advisory/false-positive
  disposition evidence to Hill.
- Require accepted exceptions to carry rationale and accountable seat
  attribution.
- Fail closed for missing, stale, mismatched, malformed, duplicate, or ambiguous
  evidence.

## Boundaries

- The evaluator is pure and non-authoritative.
- It does not call SonarQube, store credentials, post GitHub replies, dispatch
  seats, mutate mission state, request rereview, merge, or decide completion.
- Blocking or actionable findings are ineligible for advancement unless repaired
  or represented by an accepted exception in the evidence packet.
- Architecture/conformance findings are routed to Fury evidence; they are not
  resolved by May implementation alone.

## Acceptance evidence

- Exact clean evidence evaluates eligible with no reason codes.
- Missing and revision-mismatched evidence fail closed.
- Blocking, actionable, uncertain, and architecture/conformance findings prevent
  advancement and route to the owning seat.
- Advisory findings do not automatically block advancement.
- False positives and accepted risks require rationale and accountable
  attribution.
- Package exports, runtime imports, declarations, and strict external consumer
  validation cover the new public specifier.

