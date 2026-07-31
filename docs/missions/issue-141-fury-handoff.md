# Mission #141 — Fury Handoff for Hosted Review

## Handoff identity

- Seat: Hill (orchestration)
- Dispatch seat: Fury (hosted review)
- Reviewed revision: `7d951a71fe837ecc1c22f81cc4a94a790387253c`
- Plan artifact: `docs/missions/issue-141-hill-plan.md`
- Plan artifact SHA-256: `5dd16a05cf0e995db42c221fd070614623713166c3a772fa602d330af6f1d625`
- Verdict: pending hosted Fury review

## Scope

Design-only review of the typed mission authority and seat-gate projection.
#142 remains design-only and depends on this exact plan identity.

## Frozen boundary

The projection consumes validated/replayed source projections only. It does not
validate signatures, append journals, perform transitions, grant authority, or
mutate state. Wheels Off informs initiation only. At this revision, explicit
`implementationAuthority: withheld` is required; missing, malformed, or
caller-provided Wheels Up evidence is rejected. A positive Wheels Up case is
deferred until its upstream producer contract is separately reviewed.

## Route

Fury approval accepts only the #141 design revision. #142 may consume that
exact revision for design-only work. No #141 or #142 implementation is
authorized by this handoff. On `REVISE`, Hill incorporates corrections and
re-dispatches.
