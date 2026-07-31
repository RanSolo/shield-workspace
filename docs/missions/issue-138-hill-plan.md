# Mission #138 — Content-address fixture identity and evidence classes (M3-1a.1)

## Review identity

- Seat: Hill (orchestration)
- Reviewed revision: `7d951a71fe837ecc1c22f81cc4a94a790387253c` (base HEAD at scope freeze)
- Verdict: pending
- Scope: design-only plan review; no implementation, merge, deployment, or release authority
- Fury approval is technical plan approval only. Implementation still requires separately validated implementation authority bound to the exact mission revision, plan digest, and scope.
- Dispatch mechanism: direct host subagent dispatch and await
- S.H.I.E.L.D. runtime participation: none

## Parent mission

Issue #137 — Freeze minimum V0.3 external proving fixture (M3-1a)
Sister slices: #139 (revision lifecycle), #140 (isolation/rollback).

## Objective

Make the minimum fixture independently verifiable without changing its external-run boundary by introducing content-addressed identity for manifest/template/grading-rule mutations, canonical revision identities for base/head, and a closed measurement-class classification that distinguishes Measured/Derived/Estimated/Not observable evidence entries.

## Scope (frozen)

- `benchmarks/v0.3-external-acceptance-v1/fixture-manifest.mjs` — covered manifest bytes; every mutation fails closed behind the separate content-address record.
- `benchmarks/v0.3-external-acceptance-v1/evidence-inventory.mjs` — evidence entries preserve authority, provenance, identity, and measurement class as distinct fields; closed class: `measured | derived | estimated | not-observable`.
- `benchmarks/v0.3-external-acceptance-v1/src/driver.mjs` — bounded package/install identity and repository-object-format checks required by this slice.
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs` — focused adversarial coverage for the new checks.
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json` — separate identity record, excluded from its own covered-byte set and pinned by the release baseline.
- `benchmarks/v0.3-external-acceptance-v1/verify-fixture-identity.mjs` — trusted launcher/verifier, pinned by the same out-of-band release baseline and required before any covered module is imported or executed.
- Caller-supplied host configuration classified as `operator-recorded` unless independently observed.
- No external host effect, release decision, or human evidence is added.

## Boundary (frozen)

- No merge, deploy, release, or external publication authority.
- No six-mission campaign from #14.
- No generalized scheduler, autonomous runner, or Mission Control UI.
- No fabricated human evidence.
- Does not change failure injection, rollback, isolation, or network/host-effect handling — those belong to #139 and #140.
- Driver changes are limited to package identity, installation identity, and repository-object-format validation; no grading-flow redesign is included.
- The trusted verifier/launcher reads the identity record and raw covered bytes before importing or executing covered modules. Candidate input cannot supply the expected identity. The release baseline pins the identity record and its SHA-256 out of band from the candidate fixture.
- The launcher and identity record are pinned by the external release baseline, not by candidate-controlled fixture input; the fixture test entry point invokes the launcher before loading `driver.mjs`, `fixture-manifest.mjs`, or `evidence-inventory.mjs`.

## Acceptance criteria (frozen)

- [ ] Every manifest/template/grading-rule/driver mutation fails closed when digest does not match the detached content-address record, before covered modules are imported or executed.
- [ ] Package substitution, any installed version other than `@shield/team-system@0.1.0`, wrong artifact SHA-256, and missing external installation fail closed with stable reason codes.
- [ ] Repository object format is explicit: V0.3 accepts exact 40-character SHA-1 OIDs, or exact 64-character SHA-256 OIDs when the repository declares that format; other lengths fail closed deterministically.
- [ ] Evidence entries preserve authority, provenance, evidence identity, measurement class, accountable seat, and the existing validated dispatch-receipt attribution projection as distinct fields.
- [ ] Focused adversarial tests pass for the new content-address checks and measurement-class classification.
- [ ] No external host effect, release decision, or human evidence is added.

## Plan (revision-bound)

### 1. Detached fixture identity (`fixture-identity-v1.json`)

- Add a separate versioned `fixture-identity-v1.json` record containing the complete covered artifact mapping: `manifest` → `fixture-manifest.mjs`; `template-package` → `template/package.json`; `template-source` → `template/src/greeting.mjs`; `template-test` → `template/test/greeting.test.mjs`; `grading-driver` → `src/driver.mjs`; `evidence-inventory` → `evidence-inventory.mjs`.
- Hash raw UTF-8 bytes with SHA-256 using the framed preimage `shield:fixture:v1:<artifact-type>:<path>\0<bytes>`, encode lowercase hexadecimal, and exclude the identity record itself from the covered set.
- Pin the expected identity record and its digest in the release baseline/out-of-band launcher; never accept an expected identity from candidate input and never hash the identity record recursively.
- The trusted launcher verifies all six raw byte streams against the pinned record before importing or executing any covered module. A modified driver cannot bypass this preflight.
- Introduce a verifier that re-derives every covered digest and rejects mutation, missing artifact, extra covered artifact, path substitution, or identity-record substitution before existing structural validation.
- Preserve `validateFixtureManifest`; the content-address check runs first and returns stable reason codes.

### 2. Evidence identity and measurement classification (`evidence-inventory.mjs`)

- Define aliases explicitly: `CanonicalId` is NFC-normalized, 1–128 characters, starts with `[A-Za-z0-9]`, contains only `[A-Za-z0-9._:/@#-]`, and rejects control/whitespace/non-normalized values; `LowerHexSha256` is exactly `/^[0-9a-f]{64}$/u`; `AgentSeat` is one of `daisy | hill | fury | may | mack`; `HumanGateSeat` is one of `coulson | fitz | simmons`; `EvidenceRef` is the existing bounded evidence-reference string validator; `SourceRef` is exactly `{ sourceId: CanonicalId; sourceDigest: LowerHexSha256 }`.
- Replace the flat entry with a closed state-discriminated union. `PendingEvidence` is `{ evidenceId; authority; requirement; state: "missing" | "waiting"; evidenceIdentity: null; provenance: null; measurementClass: null; accountableSeat: null; dispatchReceipt: null; verifiedHumanEvidenceRef: null; evidenceRef: null }`. `RecordedAgentEvidence` is `{ evidenceId; authority; requirement; state: "recorded"; evidenceIdentity: CanonicalId; provenance: SourceRef; measurementClass: "measured" | "derived" | "estimated" | "not-observable"; accountableSeat: AgentSeat; dispatchReceipt: SeatDispatchReceiptProjectionV1; verifiedHumanEvidenceRef: null; evidenceRef: EvidenceRef }`. `RecordedHumanEvidence` is `{ evidenceId; authority: "human-only"; requirement; state: "recorded"; evidenceIdentity: CanonicalId; provenance: SourceRef; measurementClass: "measured" | "derived" | "estimated" | "not-observable"; accountableSeat: HumanGateSeat; dispatchReceipt: null; verifiedHumanEvidenceRef: SourceRef; evidenceRef: EvidenceRef }`.
- Reuse `evaluateSeatDispatchAttributionV1`; require replay state `valid`, attribution state `attributed`, and exact mission, repository/workspace, subject, artifact, parent/child session, revision, and accountable-seat bindings, then store only `result.receipt` as `SeatDispatchReceiptProjectionV1`—never the evaluator's caller-controlled artifact payload. Human records require verified human replay references and always keep dispatch receipt null. `derived` and `estimated` require `provenance`, while pending evidence has no measurement class.
- Define per-evidence defaults in a closed table: host configuration is `operator-recorded` and has `measurementClass: "not-observable"` when caller-supplied without independent observation; human-only gates remain pending with null measurement class until verified human evidence is replayed; AI attribution reuses the validated dispatch receipt projection.
- Define closed reason codes and precedence: `evidence_inventory_not_closed` → `evidence_entry_malformed:<evidenceId>` → `evidence_measurement_class_malformed:<evidenceId>` → `evidence_identity_malformed:<evidenceId>` → existing missing/human-validation reasons. No caller-controlled `observed` boolean can upgrade evidence to `measured`.
- Existing `gradeEvidenceInventory` preserves `missing`, `waiting`, and `recorded`; the new fields are validated here but do not alter readiness until later slices consume them. This is an intentional compatibility change for caller-supplied host configuration from HEAD's `measured` authority to `operator-recorded`.

### 3. Canonical revision and package identity enforcement

- Observe repository object format with `git rev-parse --show-object-format`; accept only exact `sha1` or `sha256` output. Validate base/head as exactly 40 lowercase hex characters for SHA-1 or exactly 64 lowercase hex characters for SHA-256.
- Apply stable precedence: unsupported object format → malformed OID → unavailable OID → non-current head. Reject short hashes, intermediate lengths, non-hex characters, and symbolic/abbreviated refs.
- Pin exact package name `@shield/team-system`, exact version `0.1.0`, and the measured tarball SHA-256 in the trusted identity record; acquire the digest from the trusted packed artifact before installation and verify name, version, then digest against the installed external package before grading.

### 4. Focused adversarial tests

- Content-address drift: modify one byte of each covered artifact → rejected with stable content-address drift/missing/extra reasons.
- Candidate-supplied expected identity, path substitution, and theoretical same-digest fixture input → rejected unless the independently pinned digest and identity match.
- Package substitution, wrong exact version, wrong digest, and missing external installation → rejected before grading with stable identity reasons.
- SHA-1/SHA-256 accepted OID lengths, intermediate lengths, malformed values, and unsupported repository format.
- Measurement-class matrix covering all four classes, invalid values, source-reference requirements, and valid `operator-recorded` plus `measured` evidence when independently observed.
- Recorded human evidence with null runtime and executor identities; fabricated runtime/executor identities are rejected.
- Malformed receipt chain, stale revision, wrong workspace/session/seat, non-terminal lifecycle, missing observation, and unattributed dispatch all fail closed.

## Evidence to preserve from existing fixtures

The current `FIXTURE_MANIFEST` (commit `7d951a7`) and `evidence-inventory.mjs` are the pre-change baseline. Their SHA-256 digests at this revision are recorded in the Fury review evidence section below.

## Route

Return to Hill for exact corrections, then dispatch the exact plan artifact back to Fury. Fury approval is technical plan approval only; implementation still requires separately validated implementation authority.
