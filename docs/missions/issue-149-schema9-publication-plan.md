# Issue #149 — schema-9 review-publication bridge plan

## Review identity

- Mission: `mission:issue-149-schema9-publication`
- Mission revision: `sha256:XkLIwsTZYBmA_5cROAQalFqnQY3BA5j1Gf0NNTvbtoQ`
- Subject: `github:RanSolo/shield-workspace/issue/149`
- Base revision: `82483d2ffd31fd7bb1ac7d90ed20fdb37bb69453`
- Branch: `agent/issue-149-schema9-publication`
- Implementation seat: May
- Model: `gpt-5.6-sol`
- Runtime: `runtime:codex-hosted-may-sol`
- Executor: `executor:codex-hosted-workspace-tools`

This mission implements only the missing profile-aware publication lifecycle
that blocked #137 at its authorized sequence 1. It does not modify or advance
the #137 journal, dispatch May for #137, run the external fixture, enter #29,
mark a PR ready, merge, deploy, release, or create a new authority class.

## Verified contract collision

- `review-publication-v1.mts` already closes exact repository, root, branch,
  base/head, path, and effect scope.
- `adapter-v1.mts` already closes adapter-v2 publication requests/results.
- `mission-v2.mts` already verifies Coulson signatures and replays
  `review.publication_authorized`, `communication.requested`, and
  `communication.result_recorded`, but only for legacy journal v8.
- `publication-gate.mjs` rejects every non-v8 journal before Delivery Workspace
  can publish.
- Schema 9 currently supports mission authorization, Wheels Up, runtime binding,
  execution, and final acceptance, but none of the three publication events or
  CLI transitions.

The bridge reuses the existing authority/request/result meanings. It does not
derive publication authority from mission authorization and does not treat a
caller-supplied authority object as sufficient.

## Frozen implementation

### 1. Profile-aware entries and projection

In `src/profile-aware-mission-v1.mts`, add exactly these schema-9 event variants:

- `review.publication_authorized` carrying the existing
  `ReviewPublicationAuthorityV1` and `SignedReviewPublicationAuthorization`;
- `communication.requested` carrying the existing closed adapter-v2 publication
  request;
- `communication.result_recorded` carrying the existing closed adapter-v2
  communication-result candidate.

Extend `ProfileAwareProjectionV1` with the same immutable publication
authorization records and communication request projections consumed by the
legacy gate. Reuse existing review-publication and adapter validators rather
than copying their grammars.

Add three profile-aware producers:

- authorization producer verifies the existing Coulson signature against the
  frozen schema-9 bindings, exact mission/subject/revision, authority digest,
  artifact HEAD, and next journal sequence;
- request producer requires one exact recorded authorization and exact head,
  path, and permitted-effect containment;
- result producer requires one queued request and exact adapter, target,
  operation, publication binding, scope digest, and candidate identity.

The result producer is a trusted host boundary, matching the existing v8
contract: a successful `delivered` candidate may reach it only in-process from
`deliverGitHubCommunication` or `prepareDeliveryWorkspaceForDispatch` after the
host effect and exact GitHub readback. Replay validates the resulting bytes but
does not invent trusted provenance for an arbitrary candidate file.

Authorization and request creation are permitted only after durable mission
authorization and while execution is `not-started`. Result recording is
permitted only for the exact queued request. Authorization IDs, request IDs,
candidate IDs, entries, and terminal results are single-use. Unknown fields,
duplicates, reordered paths, stale sequences, signature failures, widened
effects, mismatched roots/heads, malformed candidates, and mixed journals fail
closed without projection mutation.

Replay must independently revalidate every event from bytes. A constructor
success cannot substitute for replay. Existing implementation authority,
runtime binding, execution, evidence, readiness, and final-acceptance behavior
must remain unchanged.

### 2. Supported CLI surface

In `src/mission-cli.mts`, add:

```text
shield mission publication-authorize --mission-id <id> --input <file>
shield mission publication-request --mission-id <id> --input <file>
shield mission publication-result --mission-id <id> --input <file>
```

`publication-authorize` is the only new passcode prompt. Its closed intent file
contains exactly `baseRevision`, `authorizedPaths`, and `permittedEffects`.
The CLI constructs one closed observation containing configured repository ID,
the repository ID parsed from the exact `origin` URL, canonical root and Git
top-level, attached branch, full base and HEAD revisions, proved base ancestry,
NUL-parsed clean porcelain status, NUL-parsed no-renames base-to-head path set,
and base/head tree modes identifying symlinks and gitlinks. It evaluates that
snapshot through `evaluateReviewPublicationV1`, derives the complete
`review.publish` authority and authorization payload, and signs with the frozen
Coulson signer. After the passcode returns and immediately before append, the
CLI recomputes and canonical-compares the complete observation, configuration
identity, and journal sequence. Any drift fails before append.

For authorization entry sequence `N`, both authorization ID and authority
reference are exactly
`authorization:${missionId}:review-publish:${N}`, the entry ID remains
`entry:${missionId}:${N}`, and the source reference is
`cli:publication-authorize:${N}`.

`publication-request` takes exactly `authorizationId`, `operation`, `targetRef`,
and `requestedEffects`. Adapter identity is frozen to literal `github`; it is
never inferred from the target. For request entry sequence `N`, request ID is
exactly `request:${missionId}:review-publish:${N}` and entry ID is
`entry:${missionId}:${N}`. Mission, subject, revision, artifact HEAD, authorized
paths, and publication authorization are derived from replay. One authorization
may back multiple distinct requests, preserving legacy-v8 meaning; each request
ID is unique and each request accepts at most one terminal candidate. The
command performs no external effect and requires no passcode.

`publication-result` is intentionally asymmetric. File ingestion rejects every
candidate with `outcome: "delivered"`; it may append only exact `failed` or
`unknown` observations after replay-bound verification. A syntactically valid
forged delivered candidate therefore cannot suppress the real publication.
Successful delivery is appended only by a trusted in-process host caller that
passes the actual adapter/Delivery Workspace return directly to the profile
result producer and journal store without a user-editable serialization step.
Status/report expose queued or terminal communication without changing
execution readiness.

No command combines publication authority with Wheels Up, implementation
authority, PR readiness, merge, deployment, release, or issue updates.

### 3. Publication gate compatibility

In `github/publication-gate.mjs`, select replay by the journal's first schema:

- schema 8 continues through `replaySupervisedMissionJournal` unchanged;
- schema 9 goes through `replayProfileAwareMissionJournal`;
- mixed, unsupported, malformed, missing, stale, non-queued, or ambiguous
  evidence remains blocked.

After valid replay, both paths must expose the same exact queued request,
authority, used candidate IDs, and evaluated sequence to existing GitHub,
PR-workspace, and Delivery Workspace callers. The gate must never accept a
standalone request, caller projection, or authority object.

### 4. Tests

Add focused coverage proving:

- complete schema-9 authorize → queue → result replay and restart identity;
- signature, digest, sequence, mission, subject, revision, HEAD, root, branch,
  path, effect, request, candidate, and result-binding failures;
- duplicates, unknown fields, mixed schema, and late authorization/request;
- CLI passcode authorization plus no-passcode request and failed/unknown result
  transitions, with forged delivered file ingestion rejected;
- complete post-prompt observation drift for configured/remote repository ID,
  root/top-level, branch, base/HEAD, ancestry, status, path set, symlink, and
  gitlink modes fails before append;
- both schema-8→9 and schema-9→8 mixed-journal directions fail closed;
- publication gate, GitHub adapter, PR-workspace, and Delivery Workspace each
  consume a real replayed schema-9 queued request while legacy-v8 behavior
  remains byte-for-byte compatible;
- no publication event changes implementation authority, execution, readiness,
  human gates, or final acceptance.

## Exact writable paths

- `packages/shield-team-system/src/profile-aware-mission-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/github/publication-gate.mjs`
- `packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/fixtures/review-publication-journal.mjs`
- `packages/shield-team-system/tests/delivery-workspace.test.mjs`
- `packages/shield-team-system/tests/github-adapter-v1.test.mjs`
- `packages/shield-team-system/tests/github-pr-workspace.test.mjs`

No changes to `review-publication-v1.mts`, `adapter-v1.mts`, `mission-v2.mts`,
GitHub effectors, PR body generation, implementation authority, runtime
binding, permission context, governed May dispatch, fixture, or #137 artifacts
are authorized. If an existing contract cannot be reused without changing one
of those files, May must stop for Fury reconciliation.

## Validation

May must run:

```text
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs
node --test packages/shield-team-system/tests/supervised-cli.test.mjs
node --test packages/shield-team-system/tests/delivery-workspace.test.mjs
node --test packages/shield-team-system/tests/github-adapter-v1.test.mjs
node --test packages/shield-team-system/tests/github-pr-workspace.test.mjs
npm test --workspace packages/shield-team-system
git diff --check
```

The implementation commit must have the approved planning revision as its sole
parent and contain exactly the nine authorized paths. Mack must validate that
exact revision before Fury conformance. If Mack remains quota-blocked, record
the blocker and stop; do not substitute Hill or Fury for Mack.
