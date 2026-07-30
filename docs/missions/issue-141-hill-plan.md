# Mission #141 — Typed mission authority and seat-gate projection

## Review identity

- Seat: Hill (orchestration)
- Reviewed revision: `7d951a71fe837ecc1c22f81cc4a94a790387253c` (base HEAD at scope freeze; plan digest is recorded separately in the handoff)
- Verdict: pending hosted Fury review
- Scope: design-only contract plan; no implementation, UI, database, merge, deployment, or release authority

## Parent mission

Issue #141 — Architecture: typed mission authority and seat-gate map.
Issue #142 remains design-only and depends on this exact reviewed revision.

## Objective

Define a host-neutral, type-guarded seat/gate projection that consumes already
validated mission authority without becoming an authority source or policy
engine.

## Scope (frozen)

- Use a closed, versioned envelope of already validated/replayed projections:
  mission profile, journal authorization/readiness/evidence, role taxonomy,
  Wheels Off eligibility, and validated review-publication authority.
- Preserve separate initiation, implementation, review-publication, human-gate,
  seat-participation, mission-scope, and exact-revision distinctions.
- Derive a deterministic seat/gate projection containing allowed actions,
  blocked actions, required evidence, and the next human gate.
- Accept only the explicit output contract of the future verified
  mission-authorization replay producer as the `wheels-up` source, bound to
  signed Coulson evidence, exact mission revision, scope, and sequence. No such
  Wheels Up source exists at HEAD. HEAD/legacy input is a separate deterministic
  case that always outputs `implementationAuthority: withheld`; caller-provided
  Wheels Up values are never accepted by this projection.
- Bind every source and output to contract version, digest/evidence references,
  evaluated sequence, mission, subject, repository, mission revision,
  artifact/base/head revisions, and exact scope.

## Boundary (frozen)

- The projection performs no signature validation, journal append, transition,
  authority grant, or state mutation.
- Wheels Off can inform initiation only; it cannot create implementation or
  publication authority.
- Implementation authority comes only from the canonical verified
  `implementationAuthority` projection; it is never inferred from governance
  approval, Wheels Off eligibility, or review-publication authority.
- Human-gate satisfaction comes only from replayed verified human evidence.
- Missing, stale, conflicting, unsupported, ambiguous, or malformed sources
  fail closed.
- Composition may narrow permissions but never widen them or bypass human gates.
- #142 may only design a candidate configuration surface; it must not import
  fixture logic, mutate authority, or implement a draggable UI in this slice.

## Closed projection contract

### Inputs

`ValidatedSeatGateInput` is a closed discriminated envelope containing:

- `journalReplayAnchor`: `{ kind: "trusted-journal-replay-anchor"; producerContractVersion; producerDigest; anchorDigest; anchorRevision; missionId; subject; repository; missionRevision; artifactRevision; baseRevision; headRevision; scope; currentSequence; lifecycle }` (independently trusted current snapshot; not caller-derived);
- `missionProfile`: `{ kind: "static-mission-profile"; contractVersion; contractDigest; profileId; requiredGates }` (static; contract identity only);
- `missionBoundRequirements`: `{ kind: "mission-bound-frozen-requirements"; contractVersion; digest; replayAnchorDigest; missionId; subject; repository; missionRevision; artifactRevision; baseRevision; headRevision; scope; sequence; lifecycle; profileId; profileDigest; requirements: readonly ProfileRequirementV1[]; evidenceStatuses; phaseOrder }` (replay-derived selected profile; must exactly agree with the static profile);
- `journalProjection`: `{ kind: "mission-bound-journal-projection"; contractVersion; digest; replayAnchorDigest; missionId; subject; repository; missionRevision; artifactRevision; baseRevision; headRevision; scope; sequence; lifecycle; authorization; readiness; evidence }`;
- `roleTaxonomy`: `{ kind: "role-taxonomy"; contractVersion; contractDigest; roles }` (static source; contract identity is pinned, not mission-bound);
- `seatParticipation`: `{ kind: "mission-bound-seat-participation"; contractVersion; digest; replayAnchorDigest; seatId; missionId; subject; repository; missionRevision; artifactRevision; baseRevision; headRevision; scope; sequence; lifecycle; participationState: "active" | "inactive"; participationEvidenceRef; responsibilities; dispatchEligible }` (replay-derived; participation state and dispatch eligibility are separate);
- `wheelsOffEligibility`: `{ kind: "mission-bound-wheels-off-eligibility"; contractVersion; digest; replayAnchorDigest; missionId; subject; repository; missionRevision; artifactRevision; baseRevision; headRevision; scope; sequence; lifecycle; eligible }`;
- `implementationAuthority`: at HEAD, exactly `{ kind: "legacy-or-head-authority"; value: "withheld" }` is accepted; missing, malformed, or any `wheels-up` value fails closed. A future `wheels-up` variant requires a separately reviewed upstream contract and trusted producer receipt and is outside this plan.
- `reviewPublicationProjection`: a replay-produced union `{ kind: "publication-absent" | "publication-present"; producerContractVersion; producerDigest; projectionDigest; replayAnchorDigest; evaluatedSequence; missionId; subject; repository; missionRevision; artifactRevision; baseRevision; headRevision; scope; sequence; lifecycle; evidenceRefs; record: ReviewPublicationAuthorizationRecord | null }`. The present case wraps the existing validated `review-publication-v1.mts` authority unchanged; raw authority objects and caller-supplied absence are rejected. Multiple current records fail closed unless the upstream producer supplies a canonical narrowing result.

Unknown fields, unsupported contract versions, malformed unions, absent required
fields, or unverified implementation evidence fail closed. The projection is
for one selected `seatId`; it never returns agent actions for Coulson, Fitz, or
Simmons.

### Output and precedence

`SeatGateProjection` is a closed object with `projectionVersion`, exact binding
identity, `allowedActions`, `blockedActions`, `requiredEvidence`,
`implementationAuthority`, `reviewPublicationAuthority`, and `nextHumanGate`.
Actions are canonically ordered: `recon`, `plan`, `review`, `validate`,
`initiate`, `implement`, `publish-review`, `merge`, `deploy`, `release`.
Reason precedence is:
`source_malformed` → `source_unsupported` → `binding_mismatch` → `stale_sequence`
→ `missing_required_evidence` → `authority_withheld` → `action_not_allowed`.
The output is deterministic for identical canonical inputs.

The action matrix is frozen: `recon` is allowed only for validated Daisy;
`plan` is allowed only for validated Hill; `review` is allowed only for
validated Fury; `validate` is allowed only for validated Mack; `initiate` requires
validated Wheels Off eligibility or supervised initiation, with active
participation and `dispatchEligible: true`; `implement` requires
validated active May participation plus a future verified upstream `wheels-up` case; at HEAD this
action is blocked because implementation authority is withheld. `publish-review` requires
`review.publish` or bounded Wheels Up publication; `merge`, `deploy`, and
`release` are always blocked by this projection. No action is granted by a
mode, seat assignment, or caller-supplied authority value alone.

### Source join and gate selection

Dynamic sources must match the complete mission-bound tuple: mission, subject,
repository, mission revision, artifact revision, base revision, head revision,
scope, sequence, and lifecycle. Every dynamic source must also bind to the
same independently trusted `journalReplayAnchor`, and its `replayAnchorDigest`
must equal the anchor's `anchorDigest`; a consistently replayed but older source
set is stale and
blocked even when its fields agree. Static mission-profile and role-taxonomy sources
match only by contract version and digest and are not fabricated with mission
fields. `missionBoundRequirements` must match the static profile's `profileId`,
`profileDigest`, requirement identities, and phase order. Profile requirements
determine gates in phase order: authorization,
profile-specific execution gates, then final acceptance. `nextHumanGate` is
derived strictly from `ProfileRequirementV1`: Coulson authorization, selected
profile execution requirements (Fitz or Simmons only when present), then
Coulson final acceptance. No absent profile requirement is inserted and final
acceptance is never synthesized as already satisfied.

## Acceptance criteria (frozen)

- [ ] Closed authority states and projection inputs are documented.
- [ ] Wheels Off, Wheels Up, and `review.publish` semantics remain separate.
- [ ] Projection output binds mission identity, exact revisions, scope,
      sequence, contract versions, and evidence references.
- [ ] Invalid, stale, conflicting, and substituted authority inputs fail closed.
- [ ] The input envelope and output projection use closed unions, canonical
      ordering, explicit source-contract versions, and stable reason precedence.
- [ ] Freshness joins require identical mission, subject, repository, mission
      revision, artifact/base/head revisions, scope, and current sequence/lifecycle
      across all source projections.
- [ ] Next-human-gate ordering is deterministic: Coulson, then Fitz, then
      conditional Simmons.
- [ ] Focused contract and replay tests cover every authority combination in
      the approved input envelope.
- [ ] The finite authority matrix covers withheld implementation,
      withheld/review.publish/wheels-up publication, Wheels Off initiation,
      profile-required and profile-omitted Fitz gates, stale bindings, and
      legacy inputs mapping to withheld; this revision tests any Wheels Up
      implementation input only as `source_unsupported`, deferring successful
      Wheels Up cases until the upstream producer contract is separately reviewed.
- [ ] Seat-participation replay tests bind Daisy/Hill/Fury/Mack/May to their
      canonical responsibilities, reject seat substitution, and produce no
      agent action for Coulson, Fitz, or Simmons.
- [ ] Every agent action requires matching active participation, canonical
      responsibility, and `dispatchEligible: true`; inactive or ineligible
      participation blocks the action.
- [ ] A consistently old but internally equal source set is rejected against
      the trusted journal replay anchor.
- [ ] Profile gate replay tests are exact: standard = Coulson authorization →
      Coulson final acceptance; high assurance = Coulson authorization → Fitz
      → Coulson final acceptance; product sensitive = Coulson authorization →
      Simmons → Coulson final acceptance.
- [ ] Profile substitution from high-assurance/product-sensitive to standard
      fails closed when profile digest or requirement identities disagree.
- [ ] No UI, database, merge, deployment, release, destructive effect, or
      expanded scope is introduced.

## Route

Return to Hill for exact corrections, then dispatch the revision back to Fury.
Implementation is not authorized by this design-only plan. #142 remains
design-only and must depend on the exact reviewed #141 revision.
