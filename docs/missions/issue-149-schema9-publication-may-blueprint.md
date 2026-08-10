# May blueprint — issue #149 schema-9 review publication

Implement the exact Fury-approved plan in
`docs/missions/issue-149-schema9-publication-plan.md`.

## Required result

Add profile-aware schema-9 support for the existing signed
`review.publish` lifecycle without changing authority meaning:

1. replay and produce exact `review.publication_authorized`,
   `communication.requested`, and `communication.result_recorded` events;
2. expose immutable publication authorization and communication projections;
3. add passcode-backed `mission publication-authorize` plus non-signing
   `mission publication-request` and `mission publication-result` commands;
4. let the publication gate consume either valid legacy-v8 or valid schema-9
   journal replay while rejecting all unsupported/mixed/caller-asserted input;
5. prove the bridge through contract, CLI, restart, publication-gate, and
   Delivery Workspace tests.

## Boundaries

- Edit exactly the nine paths listed in the plan.
- Reuse the existing review-publication, adapter-v2, signature, canonical JSON,
  and journal-store contracts.
- Freeze GitHub adapter and every authorization/request identifier exactly as
  specified by the plan; compare the complete repository observation before
  signing and immediately before append.
- Reject file-supplied delivered results. Successful delivery may be admitted
  only from an in-process trusted host effect/readback return; failed and
  unknown file candidates remain replay-validated.
- Do not add an authority kind, infer publication from mission authorization,
  combine publication with Wheels Up, or weaken v8 behavior.
- Do not touch #137 state or artifacts, dispatch its May, run its external
  fixture, enter #29, publish a PR, mark ready, merge, deploy, or release.
- Missing evidence or an unavoidable out-of-scope dependency fails closed and
  returns to Fury.

Return the exact commit, sole parent, changed paths, focused/full validation,
and unresolved risks. Do not claim Mack, Fury, or human acceptance.
