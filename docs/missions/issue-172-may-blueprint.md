# Issue #172 May implementation blueprint

## Exact planning identity

- Mission: `mission:issue-172`
- Mission revision: `sha256:yK-21yxhTpN4QqDnKSQgYoDbf0g9vyEQ9M6cyQH2gpY`
- Base repository revision: `1fbe2ef6eec79a3e4e677edae9b96bc3c27e65fa`
- Branch: `agent/issue-172-fury-review-evidence`
- Owner: May
- Runtime used for the first blueprint draft: repository-local `ornith-1.0-35b`
- Hill disposition: retained the local draft's independent-store boundary; corrected its digest taxonomy, test paths, replay semantics, and lock-release guarantee before Fury review.

## Outcome

Add one closed V1 evidence contract and durable JSONL store for Fury plan reviews. Delivery Workspace will no longer consume a caller-provided Fury verdict. Its caller supplies only an opaque review-evidence candidate; an independent host loader supplies durable records, and dispatch eligibility can advance only after the candidate exactly selects and digests one current Fury record whose stored plan gate passes the existing evaluator.

Fury technical review remains `non_authoritative`. This slice grants no human, publication, merge, deployment, or release authority.

## Exact path set

Production:

1. `packages/shield-team-system/src/fury-plan-review-evidence-v1.mts` — closed record/candidate/expected-binding contract, canonical digests, replay, and evaluation.
2. `packages/shield-team-system/src/fury-plan-review-evidence-store.mts` — repository-local durable append/readback boundary.
3. `packages/shield-team-system/github/delivery-workspace.mjs` — replace caller-supplied `planGate` with an evidence candidate plus independent evidence loading.
4. `packages/shield-team-system/public/github.mjs` — runtime exports for the new evidence contract.
5. `packages/shield-team-system/public/github.d.mts` — matching public declarations and updated Delivery Workspace input/result types.

Tests:

6. `packages/shield-team-system/tests/fury-plan-review-evidence-v1.test.mjs` — contract, replay, attribution, digest, stale, and exact-match tests.
7. `packages/shield-team-system/tests/fury-plan-review-evidence-store.test.mjs` — durable append/readback, path, conflict, and recovery tests.
8. `packages/shield-team-system/tests/delivery-workspace.test.mjs` — caller-PASS rejection and independent exact-evidence integration.
9. `packages/shield-team-system/tests/package-surface.test.mjs` — runtime/type surface checks.

No package export is added. The contract is exposed through the existing `@shield/team-system/github` facade; the filesystem store remains an internal `dist` seam, matching the existing seat-dispatch and control-event stores.

## Closed V1 evidence contract

### Durable record

`FuryPlanReviewEvidenceV1` is an exact plain object with:

- `evidenceSchemaVersion: 1`
- `contractVersion: "fury.plan-review-evidence.v1"`
- `authority: "non_authoritative"`
- `evidenceId: string`
- `missionId: string`
- `missionRevisionId: sha256 digest`
- `subjectId: string`
- `repositoryId: owner/name`
- `branch: string`
- `prNumber: positive integer`
- `planDigest: sha256 digest`
- `blueprintArtifactId: string`
- `blueprintArtifactPath: safe relative path`
- `artifactRevisionId: immutable revision`
- `repositoryRevisionId: 40–64 lowercase hex revision`
- `reviewerSeatId: "fury"`
- `reasoningRuntimeId: non-seat identifier`
- `toolExecutorId: distinct non-seat identifier`
- `planGate: normalized FuryPlanGateEnvelopeV1`
- `evidenceDigest: sha256 digest`

The embedded normalized plan gate carries the existing closed verdict and bounded finding/reconciliation shapes. Its mission, subject, repository, branch, PR, artifact identity/path, owning seat, and reviewed/corrected revisions must agree with the outer evidence binding. Runtime and executor values in the stored review and reconciliation, when present, must equal the host-observed outer attribution. The outer reviewer seat is stamped as `fury`; it is never accepted from a Delivery Workspace caller.

For the current Git-backed blueprint flow, `artifactRevisionId` and `repositoryRevisionId` are both required and equal to the exact PR head. They remain separate fields because an artifact revision and repository checkout revision are distinct contract concepts and future stores may represent them differently.

### Candidate

`FuryPlanReviewEvidenceCandidateV1` contains only:

- `candidateSchemaVersion: 1`
- `contractVersion: "fury.plan-review-evidence.v1"`
- `evidenceId`
- `evidenceDigest`
- `missionId`
- `missionRevisionId`
- `planDigest`
- `artifactRevisionId`
- `repositoryRevisionId`

It contains no verdict, findings, reviewer seat, runtime, executor, or plan-gate body. Therefore caller input cannot assert or upgrade `PASS`; it can only select an independently loaded record by exact identity and digest.

### Expected binding

`FuryPlanReviewEvidenceExpectedBindingV1` contains the candidate fields except schema/contract/evidence identity, plus exact subject, repository, branch, PR, blueprint artifact ID/path/kind/owner, and current repository revision. Delivery Workspace derives this binding from its normalized mission input and verified PR readback, not from the evidence candidate.

### Digests

1. `planDigest` is `sha256:` plus base64url SHA-256 over `canonicalJson(normalizedPlanGate)`. It identifies the complete closed plan-gate envelope, including verdict, findings, reconciliation, and attribution.
2. `evidenceDigest` uses the same algorithm over every durable evidence field except `evidenceDigest`. It binds the plan digest and body to the exact mission revision, artifact, repository, Fury seat, runtime, and executor.
3. `artifactRevisionId` identifies the reviewed blueprint artifact revision.
4. `repositoryRevisionId` identifies the exact repository checkout/head observed by the host.

No timestamp participates in identity. Repeating the same exact review is idempotent; time cannot manufacture a second approval.

## Creation, replay, and evaluation

### Creation

`createFuryPlanReviewEvidenceV1` accepts a normalized/normalizable Fury plan gate, exact host binding, and host-observed attribution. It validates all components, stamps `reviewerSeatId: "fury"`, computes `planDigest`, and then computes `evidenceDigest`. It cannot accept a caller-selected reviewer seat.

### Replay

`replayFuryPlanReviewEvidenceLedgerV1` descriptor-safely validates a dense plain array of records and returns frozen normalized copies. It rejects:

- malformed or noncanonical records;
- duplicate `evidenceId` entries, including byte-identical physical duplicates;
- one evidence identity with different content;
- more than one record for the same exact mission/plan/artifact/repository review key;
- conflicting verdict, findings, attribution, or digest for that key.

The append API may return an existing byte-identical record idempotently without writing another line. It must reject a reused ID or review key with different bytes.

### Evaluation

`evaluateFuryPlanReviewEvidenceV1(candidate, records, expectedPlanBinding)` performs, in order:

1. expected-binding validation;
2. candidate validation;
3. complete ledger replay/validation, including duplicate and conflict checks;
4. exactly-one lookup by `evidenceId`;
5. candidate-to-record `evidenceDigest` and `planDigest` equality;
6. exact mission revision, artifact revision, repository revision, and contextual binding checks;
7. Fury seat and host-observed runtime/executor attribution checks;
8. `evaluateFuryPlanGateV1(storedRecord.planGate, existingExpectedBinding)`.

The final result derives its verdict, findings, reviewer, runtime, executor, and plan-gate evaluation only from the durable record. Eligibility is `eligible` only when every earlier check succeeds and the existing plan-gate evaluator returns `eligible`.

Closed reason precedence:

1. `INVALID_EXPECTED_BINDING`
2. `INVALID_EVIDENCE_CANDIDATE`
3. `INVALID_REVIEW_EVIDENCE`
4. `DUPLICATE_REVIEW_EVIDENCE`
5. `CONFLICTING_REVIEW_EVIDENCE`
6. `REVIEW_EVIDENCE_REQUIRED`
7. `REVIEW_EVIDENCE_DIGEST_MISMATCH`
8. `REVIEW_EVIDENCE_BINDING_MISMATCH`
9. `REVIEW_EVIDENCE_STALE`
10. `WRONG_REVIEWER_SEAT`
11. `INVALID_REVIEW_ATTRIBUTION`
12. existing Fury plan-gate reason codes through the nested evaluation

All failures are non-authoritative and ineligible.

## Durable store

Store records under `.shield/audit/fury-plan-reviews/<sha256(missionId)>.jsonl`, with an adjacent mission-scoped lock. Reuse the established permission-audit/dispatch-store guarantees:

- descriptor-safe input snapshot before any asynchronous boundary;
- canonical repository root and `.shield/audit` containment;
- symlink and unsafe-path rejection;
- strict canonical JSONL parsing and complete replay before append;
- exclusive lock with marker ownership;
- append-if-absent by evidence ID and exact review key;
- file fsync and first-creation directory fsync;
- exact byte-for-byte full-ledger readback;
- lock-release marker drift, unlink failure, or directory-sync failure overrides success with `recovery_required`;
- malformed, uncertain, or conflicting state never reports durable success.

Public store functions:

- `readFuryPlanReviewEvidenceLedgerV1(input)`
- `appendFuryPlanReviewEvidenceIfAbsentV1(input)`
- `createFuryPlanReviewEvidenceFilesystemStore(input)`

The store does not invoke Fury, dispatch a model, publish a review, repair evidence, or grant authority.

## Delivery Workspace integration

Keep `prepareDeliveryWorkspaceForDispatch` synchronous. Replace input field `planGate` with `planGateCandidate`. Add required option `loadFuryPlanReviewEvidence`, a host-provided synchronous loader for independently persisted evidence. This follows the existing synchronous `loadJournal` boundary and avoids synchronous filesystem I/O in the contract layer.

After draft-PR publication and exact workspace receipt validation:

1. derive the expected evidence and existing plan-gate bindings from mission input and receipt;
2. require `repositoryRevisionId === checked.receipt.artifactRevisionId` for the current Git-backed flow;
3. call the independent loader;
4. evaluate the opaque candidate against the loaded durable records;
5. return `workspace_ready` unless the evidence evaluation and nested Fury plan gate are both eligible;
6. return `dispatch_ready` only on that exact match.

The result adds `planReviewEvidenceEvaluation`; `planGateEvaluation` is the nested evaluation derived from stored evidence. The old caller-supplied full `planGate` shape becomes an unknown-field failure, proving it cannot grant approval.

## Test matrix

Contract tests:

- exact creation preserves mission revision, plan digest, artifact/repository revisions, Fury seat, actual runtime/model, executor, verdict, and bounded findings;
- caller-shaped PASS or candidate containing verdict/reviewer/attribution is malformed and ineligible;
- absent record fails `REVIEW_EVIDENCE_REQUIRED`;
- changed candidate or record digest fails `REVIEW_EVIDENCE_DIGEST_MISMATCH`;
- stale mission, artifact, or repository revision fails closed;
- wrong reviewer seat and seat/runtime/executor overlap fail closed;
- physical duplicate, reused ID conflict, and same-review-key conflict fail closed;
- one exact candidate/record/binding match delegates to the existing gate and is eligible;
- a stored `FAIL` remains ineligible; candidate content cannot upgrade it;
- accessors, proxies, sparse arrays, unknown fields, unsafe paths, and oversized findings fail closed without leaking thrown values.

Store tests:

- missing-ledger read, first append, idempotent readback, restart readback, and exact canonical bytes;
- same ID/different payload and same review key/different payload conflict without mutation;
- malformed/noncanonical JSONL and mixed mission ledger fail closed;
- root/file/lock symlinks fail closed;
- concurrent append writes one record;
- short write, append/sync/readback failure, lock marker drift, unlink failure, and directory-sync failure return `recovery_required` where durability or release is uncertain.

Delivery tests:

- old caller-provided `planGate: PASS` is rejected as an unknown input field;
- opaque candidate plus absent/malformed/duplicate/conflicting independent evidence stays `workspace_ready`;
- digest mismatch, stale PR head, stale artifact, and wrong attribution stay `workspace_ready`;
- exact independent evidence match alone reaches `dispatch_ready`;
- Fury evidence remains distinct from publication and human authority gates.

Package-surface tests verify runtime exports, declarations, and clean package imports.

## Explicit exclusions

- No caller-asserted PASS path.
- No new Fury rubric or generic review service.
- No local-model dispatch product behavior; local Daisy, May, and Mack are mission executor choices only.
- No review publication or GitHub inline-comment behavior.
- No #170 composition, #171 Slice C, #137 proving run, #29, external run, scheduler, daemon, or autonomous loop.
- No new human authority, merge, deployment, release, migration, repair, or destructive effect.

## Gates

Hosted Fury must approve the exact committed blueprint revision before production edits. Explicit Wheels Up is separately required for implementation. Local Mack validates the exact implementation commit; hosted Fury then performs exact-revision conformance before Fitz human review.
