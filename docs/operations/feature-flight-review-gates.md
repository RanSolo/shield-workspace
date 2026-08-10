# Feature Flight review gates

`projectFeatureFlightReviewGatesV1` is the read-only Slice 4 companion to
`runFeatureFlightStepV1`. It consumes exact artifact paths and raw SHA-256
digests for one active-state Slice 3 terminal set, its schema-9 execution
journal, one frozen Mack request, and one canonical schema-8 review journal.
It emits an in-memory `feature-flight-review-checkpoint` and digest. It writes
nothing and exposes no CLI, dispatch, proof-flight, merge, deployment, or
release operation.

The projection reuses the same pure successful-v2-terminal evaluator as the
execute-once runner. Legacy, recovery, partial, substituted, noncanonical, or
conflicting terminal evidence stops at `flight_evidence_recovery_required`
before repository or review evidence is consulted.

## Trusted joins

The frozen host dependencies provide a read-only repository observer, the
protected Mack replay-registry root/readback, and one review-journal descriptor.
The descriptor pins the exact journal artifact, review mission and revision,
work-item and repository-review subjects, source reference, repository root,
common-Git device/inode, branch, implementation paths, and approved test
surfaces. Extra, mutable, proxy/accessor-backed, or identity-colliding
dependencies are rejected before observation.

The controller derives, rather than accepts, these relationships:

- the schema-9 execution mission remains bound to the successful terminal;
- the distinct schema-8 review mission owns Fury, Fitz, and conditional
  Simmons evidence;
- execution and review work-item subjects are equal, while the repository
  review subject is distinct;
- `flightCompletionRevision` is terminal revision A;
- `currentReviewRevision` is the raw lowercase 40-hex current schema-8
  revision and must equal clean observed HEAD;
- append-only A-to-B review supersession preserves stale A history, while
  broken lineage or A-to-B-to-A reuse fails closed.

Production Mack promotion remains private to the Mack runner. Slice 4 can read
only the registry record canonically derived from the normalized
`validationRequestId` and request digest. Missing exact evidence waits; unsafe,
malformed, stale, conflicting, synthetic, or incomplete evidence cannot pass.

## Closed stop order

The exhaustive order is flight evidence, repository freshness, review
lineage, Mack, Fury, Fitz, conditional Simmons, then Coulson. Mack failure
preserves a validated `may` or `mack` correction route; an inconclusive
`fury` or `daisy` route is only an investigation suggestion. Fury
`changes_requested` preserves its exact `nextActionSeatId`. Human
changes-requested or rejected decisions preserve the human gate identity and
never synthesize a correction seat.

Even after current Mack, Fury, Fitz, and any required Simmons records pass,
Slice 4 always stops at `coulson_final_acceptance_required`. Every checkpoint
has `authority:"none"` and `gateEligible:false`; it does not claim to replay or
satisfy final acceptance.
