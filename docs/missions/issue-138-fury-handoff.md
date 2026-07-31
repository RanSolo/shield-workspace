# Mission #138 — Fury Handoff for Hosted Review

## Handoff identity

- Seat: Hill (orchestration)
- Dispatch seat: Fury (hosted review)
- Reviewed revision: `7d951a71fe837ecc1c22f81cc4a94a790387253c`
- Verdict: pending hosted Fury review
- Plan artifact SHA-256: `230f32f21e784ebfc49c9cff301e71c90a64f4411017a19493eacf0bf73f0a17`

## Scope of review

Design-only architecture review of issue #138 (M3-1a.1 — Content-address fixture identity and evidence classes). The plan is frozen in `docs/missions/issue-138-hill-plan.md`.

## Pre-requisites satisfied

- Daisy recon complete: existing fixture artifacts identified at `benchmarks/v0.3-external-acceptance-v1/` (manifest, evidence inventory, driver).
- Parent #137 scope and boundaries confirmed; #139 and #140 are sister slices with separate scope.
- No external host effect, merge, deploy, release, or human evidence is authorized by this plan.

## Pre-computed raw-file baseline evidence (at reviewed revision)

These are raw-file SHA-256 values preserved from HEAD for comparison. They are
not the framed fixture-identity digests introduced by the plan.

| Artifact | SHA-256 |
|----------|---------|
| `benchmarks/v0.3-external-acceptance-v1/fixture-manifest.mjs` | `b152a2ec5dda80c3c4203cd91fe758a72315d70af9cde3ae4d81403fe4ed8484` |
| `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs` | `062c1ee94e5da1be63c86a6c80982cc807a78939f821495b9b6ed400462de805` |

## Plan summary (full plan in `docs/missions/issue-138-hill-plan.md`)

1. Add a detached, independently pinned content-address identity for the complete fixture artifact set, with framed domain-separated SHA-256 digests and drift rejection before existing validators.
2. Extend `evidence-inventory.mjs` with independent authority, provenance, identity, runtime/executor, and closed measurement-class fields.
3. Bound driver checks for exact package name/version/digest and repository object format: exact SHA-1 or SHA-256 OIDs.
4. Add focused adversarial tests covering identity drift/substitution, package/install identity, OID formats, and the measurement-class matrix.

## Failure conditions (fail-closed)

- Missing or stale plan document → do not proceed to implementation.
- Plan scope exceeds frozen boundaries → return to Hill for correction.
- Fury verdict is `REVISE` with unresolved contradictions → do not implement until re-reviewed and approved.
- The pre-existing user README modification is outside this mission candidate and is preserved as unrelated work; it is excluded from the exact plan artifact set and does not receive a mission verdict.

## Route

Hosted Fury reviews this handoff. Fury `APPROVE` is technical approval of the
plan only. May may be dispatched only after separately validated implementation
authority is bound to the exact mission revision, plan digest, and scope. On
`REVISE`, Hill incorporates corrections and re-dispatches. No implementation,
merge, deployment, release, or human-gate conclusion is implied by Fury review.
