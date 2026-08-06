# Mission #137 governed May proving v5 — execution plan

## Identity

- Mission: `mission:issue-137-governed-may-proving-v5`
- Subject: `github:RanSolo/shield-workspace/issue/137`
- Fresh-main base: `602b97c5253466d4936fc64817c06ece2769b2d2`
- Branch: `agent/issue-137-governed-may-proving-v5`
- Status: frozen for exact-revision Fury review; no implementation before literal `dispatch_ready`

## Objective

Execute the existing #137 AC4 correction through the canonical schema-9
Delivery Workspace and governed May boundary now that #149, #194, and #201 are
closed. The packet must change the previous outcome from “blocked before May”
to one exact claimed May implementation with durable evidence, then stop at
Mack/Fury review.

The governing requirements remain
`docs/missions/issue-137-ac4-correction-plan.md`. This v5 plan only refreshes
repository, branch, mission, authority, runtime, publication, and review
bindings; it does not redesign the correction.

## Exact implementation packet

May may write exactly:

1. `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs`
2. `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
3. `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`

Required behavior:

- recorded evidence accepts exactly `measured | derived | estimated |
  not-observable`;
- pending evidence retains literal `measurementClass: null`;
- operator-recorded evidence cannot claim `measured` without exact existing
  dispatch attribution;
- human evidence remains human-only and cannot be satisfied through runtime
  attribution;
- measurement class never grants authority, readiness, or a human gate;
- only the evidence-inventory artifact digest changes in the fixture identity.

## Governed dispatch gate

Before May receives the packet, Hill must establish all of the following at the
same exact current head:

- signed schema-9 mission authorization;
- signed active Wheels Up authority for the three paths and validation effects;
- one active May runtime binding;
- schema-9 review-publication authorization and queued draft-PR request;
- verified draft-PR readback for this branch and blueprint;
- independently attributed Fury approval of this exact plan/blueprint revision;
- a literal `dispatch_ready` result from
  `prepareGovernedDeliveryWorkspaceForDispatch` after its post-await readbacks.

Missing, stale, malformed, ambiguous, substituted, or drifting evidence stops
before May. Conversational approval and caller booleans are not substitutes.

## Validation

May must run:

1. the corrected identity-baseline focused test;
2. focused measurement-class, attribution, hostile-input, and no-readiness-
   change tests;
3. `npm --prefix benchmarks/v0.3-external-acceptance-v1 test`;
4. `git diff --check`;
5. exact three-path delta and fixture-identity field checks.

Mack independently validates the exact implementation revision. Fury then
performs exact-revision conformance review.

## Excluded

No external fresh-repository fixture run, #29, generalized runner, CLI or
journal-schema change, extra implementation path, fabricated human evidence,
merge, deploy, release, or final acceptance.

