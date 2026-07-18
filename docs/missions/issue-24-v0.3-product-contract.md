# V0.3-1 Mission Brief — Review Publication

- **Canonical issue:** `RanSolo/shield-workspace#24`
- **Mission state:** approved for contract definition and bounded review publication
- **Approval source:** Coulson decision in the active mission
- **Wheels Up:** withheld
- **Repository mutation:** authorized only for the two review artifacts listed below
- **GitHub mutation:** review branch, documentation commit, push, and draft PR only
- **Current owner:** Maria Hill

## Objective

Define the supported V0.3 product contract from the perspective of a maintainer
adopting SHIELD into an existing repository.

## Approved scope

- Reconcile Daisy's observed facts and explicit assumptions.
- Define audience, product principles, supported surface, supported workflow,
  observable guarantees, non-goals, and adoption acceptance.
- Define `review.publish` as bounded publication distinct from Wheels Up.
- Keep Fitz and Simmons transport-independent while Hill selects the configured
  review surface.
- Require append-only Fury architecture-review records for exact PR revisions.
- Require current-revision Fury approval before Hill marks a PR ready and
  requests Fitz.
- Produce and revise contract artifacts outside the repository.
- Route the exact revised artifacts through Fury architecture review.
- Return the reviewed contract to Coulson before any publication or
  implementation planning.

## Review-publication boundary

Mission approval permits planning. Coulson-authorized `review.publish` permits
only bounded publication of exact authorized artifacts and paths. Wheels Up
permits implementation.

Coulson authorized `review.publish` in the active mission so the human
decision holders can review from the pull request.

The exact authorized repository paths are:

- `docs/product/v0.3-product-contract.md`
- `docs/missions/issue-24-v0.3-product-contract.md`

No other repository paths are authorized. The pull request must remain draft
until Fury approves its exact head SHA.

## Required review sequence

1. Hill produces an immutable draft revision outside the repository.
2. Fury reviews that exact pre-publication revision and records `approved` or
   `changes_requested` with reasons and findings.
3. A changed revision invalidates prior Fury approval for advancement purposes.
4. After Fury approves the current pre-publication revision, Hill returns to
   Coulson.
5. Coulson may separately authorize `review.publish` for exact artifacts and
   paths.
6. Hill may then create or update the review-only draft PR using only the
   authorized artifacts. The PR remains draft.
7. Hill records the resulting PR head SHA as a new review subject revision. The
   pre-publication Fury approval remains historical and cannot transfer to the
   Git commit.
8. Fury reviews the exact PR head SHA and appends a new `approved` or
   `changes_requested` record.
9. If Fury requests changes, the PR remains or returns to draft and the next
   action routes to the recorded responsible seat. Any later commit requires a
   new Fury review.
10. Only after Fury approves the current PR head may Hill publish Fury's approved
    findings, mark the PR ready, and request Fitz.

Fury approval is not Fitz approval, Wheels Up, merge authority, deployment
authority, or release authority.

## Architecture review history

- Review ID: `fury-architecture-v0.3-1-r2`
- Product-contract revision:
  `sha256:3a28481973df624d618ca82553fe40a5e32f588389bb81f7dd6ed9c4341edf1e`
- Mission-Brief revision:
  `sha256:45820fed242eaaeb80316ff43ce54ce76e1cf37724d73225a82889f1ee2ddf0c`
- Verdict: `changes_requested`
- Decision time: `2026-07-18T17:22:10Z`
- Next seat: `hill`
- Draft disposition: `not_applicable_no_pr`
- Completed automatic repairs: 1
- Repair hard cap: 1

The r2 record remains mission history and cannot approve r3 or any future PR
head revision.

- Review ID: `fury-architecture-v0.3-1-r3`
- Product-contract revision:
  `sha256:8bc2c4522b818ecac37f7eaea9cd284414de7a82b631dda686720872f3cbece5`
- Mission-Brief revision:
  `sha256:839e3da4d92a2ca77d8db62bb33b55b8a867842f9cf8ffa7f2507c7a351eb0d8`
- Verdict: `approved`
- Decision time: `2026-07-18T17:25:40Z`
- Next seat: `hill`
- Draft disposition: `not_applicable_no_pr`

The r3 approval authorized advancement to Coulson's publication decision. It
does not transfer to the Git commit or future PR head.

## Participants

- Maria Hill — coordination, evidence reconciliation, drafting, and publication
  routing when authorized
- Daisy Johnson — completed product-surface reconnaissance
- Nick Fury — advisory architecture review of exact revisions
- Melinda May — not dispatched
- Leo Fitz — required human technical review after authorized publication
- Jemma Simmons — inactive unless Coulson later requires product/domain review
- Phil Coulson — mission, publication, and final acceptance authority

## Risk flags

- production: false
- destructive: false
- migration: false
- credentialsOrSecurity: true
- externalCommunication: true
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

## Explicit non-goals

- Repository or GitHub mutation outside the authorized review branch, the two
  authorized documentation paths, their documentation commit and push, and the
  review-only draft pull request; all Jira mutation remains out of scope
- CLI, runtime, adapter, installer, package, or product implementation
- Scheduler, provider routing, seat prompts, Mission Control, Oracle, Mack,
  testing modes, plugin architecture, or publishing administration
- Generic review schemas, new publication event families, transport registries,
  or a generalized mutation framework
- Merge, deployment, or release

## Validation

- Daisy evidence is separated into observed facts and assumptions.
- Fury reviews the exact artifact revision.
- Contract statements remain adopter-visible promises rather than implementation
  prescriptions.
- Review publication and implementation authority remain distinct.
- No repository or GitHub mutation occurs without a separate Coulson decision.

## Stop condition

Stop after Fury approves the exact draft-PR head, Hill marks that revision ready
for human review, and Fitz is requested through the PR review surface.
Implementation planning, Wheels Up, merge, deployment, and release remain
separate gates.
