# Mission Brief: Deterministic Mission Compilation Stage A v2

Status: Wheels Up for corrected Stage A construction only

## Objective

Construct a new candidate that corrects the failed v1 freeze process without
altering v0 or failed v1 evidence. The v2 candidate must derive every recorded
artifact hash directly from exact bytes, verify those bindings independently,
and fail closed when the runtime-envelope specification digest is mistyped or
substituted.

## Identity strategy

V2 introduces distinct candidate-level identities:

- experiment `deterministic-mission-compilation-v2`;
- trial `stage-a-trial-003`;
- candidate `deterministic-mission-compilation-candidate.v2`;
- freeze manifest `deterministic-mission-compilation-stage-a-freeze.v2`;
- wrapper `common-runtime-wrapper.v2`;
- runtime envelope `runtime-message-envelope.v2`;
- runtime-envelope specification `runtime-message-envelope-spec.v2`;
- target profile `codex-text.v2`.

The compiler, validator, renderer, control sources, arm prompts, provenance,
manifest, and shared runtime instructions were not implicated by the v1
failure. V2 may reuse those exact immutable content-addressed components, but
must independently hash and bind their bytes. Reuse is a component dependency,
not combination of experimental results.

## Authorized work

- Construct the new wrapper, target profile, envelope specification, and exact
  control and compiled runtime envelopes.
- Generate the freeze manifest from exact artifact bytes with no manually
  supplied artifact hashes.
- Independently verify every manifest binding.
- Add focused mistyped, malformed, substituted, cross-arm, and appended-message
  failure tests.
- Rerun the complete v0, v1, and v2 Stage A suites and production baseline.
- Return the exact frozen evidence revision to Hill and Fury.

## Prohibited work

- No edits to v0 or failed v1 source, freeze, or result evidence.
- No May or Stage B model invocation.
- No Stage B dispatch, grading, production integration, merge, release,
  deployment, or protocol weakening.

Stage B remains blocked until a complete v2 Stage A PASS and Fury conformance
PASS at the exact frozen evidence revision.

