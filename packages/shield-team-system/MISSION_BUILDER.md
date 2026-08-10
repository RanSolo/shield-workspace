# Mission Builder v1

Mission Builder v1 is a non-authoritative composition layer for routine
`debug`, `delivery`, `recon`, `planning`, and `review` missions. It accepts a
blocker-free, canonically revalidated `MissionIntakeCandidateV1`, host-recorded
mode activations, and a repair limit of zero through two. The work owner's
pattern mode is mandatory, and runner compilation receives only that owner's
canonical mode subset. Its output is a closed, content-addressed
`MissionDefinitionV1`; it does not authorize, schedule, merge, publish, deploy,
or release work.

Each graph has one runner-backed work step because the existing mission runtime
closes execution after one effect. Mack uses a bounded host adapter that records
existing seat-dispatch lifecycle receipts and evaluates the returned report
with `evaluateMackValidationV0`. Coulson, Fitz, and Simmons nodes never dispatch:
they wait for separately recorded human evidence.

Before `advanceMissionV1` can dispatch, the host observation must match the
definition's repository, journal replay and digest, sequence, workspace,
session, activated modes (including journal replay), allowlist, permission
context, and exactly one closed runtime/executor binding for every dispatchable
participant. Binding seats, runtime identities, and executor identities are
pairwise disjoint and cannot impersonate canonical seats; configured,
requested, self-reported, and host-observed identities remain distinct.
Provenance replay must contain the exact current definition, validation
revision, and Hill proofreading digest, plus host-observed seat-dispatch
lifecycle evidence bound to the mission, definition, repository, runtime, and
executor. Builder records are proposals and cannot be persisted without an
authenticated lifecycle receipt. An edit invalidates prior validation,
compiled manifests, and proofreading acceptance.

Advancement replays content-addressed step and dispatch receipts, performs at
most one runner or Mack dispatch, appends one transition receipt with exact
readback, and returns a replay-derived `MissionStatusProjectionV1`. Malformed,
stale, conflicting, incomplete, mixed-scope, or uncertain evidence fails
closed; pre-effect dependency failures are blocked with zero effects and
post-start failures are uncertain with accurate effects. Human gates consume
only signature- and binding-validated journal
evidence for the exact requirement, seat, mission, subject-bound revision, and
evidence kind; caller-supplied artifact references cannot advance a gate.
Human advancement produces zero dispatch effects.

All generated ambiguity, failure, uncertainty, scope-change, stale-state,
replay/readback, invalid-graph, missing-binding, prohibited-operation, and
human-simulation stop conditions route to Hill. Scope changes and prohibited
merge, publication, deploy, release, or human simulation are never dispatched
by this slice.

`MissionProvenanceStoreV1` and `MissionStepReceiptStoreV1` leave locking,
append, replay, exact readback, conflict handling, and recovery at the host
boundary. The builder provides no application store or background loop.
