# Mission Builder v1

Mission Builder v1 is a non-authoritative composition layer for routine
`debug`, `delivery`, `recon`, `planning`, and `review` missions. It accepts a
blocker-free `MissionIntakeCandidateV1`, host-recorded mode activations, and a
repair limit of zero through two. Its output is a closed, content-addressed
`MissionDefinitionV1`; it does not authorize, schedule, merge, publish, deploy,
or release work.

Each graph has one runner-backed work step because the existing mission runtime
closes execution after one effect. Mack uses a bounded host adapter that records
existing seat-dispatch lifecycle receipts and evaluates the returned report
with `evaluateMackValidationV0`. Coulson, Fitz, and Simmons nodes never dispatch:
they wait for separately recorded human evidence.

Before `advanceMissionV1` can dispatch, the host observation must match the
definition's repository, journal replay and digest, sequence, workspace,
session, activated modes, allowlist, permission context, and runtime/executor
observations. Provenance replay must contain the exact current definition,
validation revision, and Hill proofreading digest. An edit invalidates prior
validation, compiled manifests, and proofreading acceptance.

Advancement replays content-addressed step and dispatch receipts, performs at
most one runner or Mack dispatch, appends one transition receipt with exact
readback, and returns a replay-derived `MissionStatusProjectionV1`. Malformed,
stale, conflicting, incomplete, mixed-scope, or uncertain evidence fails
closed. Human evidence may advance a wait node but produces zero dispatch
effects.

`MissionProvenanceStoreV1` and `MissionStepReceiptStoreV1` leave locking,
append, replay, exact readback, conflict handling, and recovery at the host
boundary. The builder provides no application store or background loop.
