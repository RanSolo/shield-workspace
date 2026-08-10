# Issue #187 — supported schema-9 initialization and signing plan

## Gate identity

- Mission: `mission:issue-187`
- Issue: `RanSolo/shield-workspace#187`
- Base revision: `de6ad4cbbd66d5ad9576c2d22103a413d9d2d1c1`
- Status: Fury-approved planning; no implementation authority

## Objective

Add one supported operator workflow that initializes a fresh schema-9
profile-aware mission journal and records separately signed mission
authorization, Wheels Up implementation authority, and active May runtime
binding. Reuse the existing trust root, signer, replay, authority, binding, and
dispatch contracts. Do not translate schema-2 evidence, invoke a model, perform
the #137 external run, or enter #29.

## Frozen design

### Durable initialization

Add `initializeProfileAwareMissionJournalV1` in `mission-store.mts`. It accepts
exactly one matching schema-9, sequence-0 `mission.begun` entry and:

1. snapshots and replays the candidate before filesystem mutation;
2. creates missing path components without following pre-existing symlinks and
   fsyncs every created directory and its parent;
3. verifies realpath confinement and uses the profile-aware tokenized lock;
4. rejects every existing journal;
5. writes with `O_EXCL | O_NOFOLLOW`, fsyncs the file and containing directory,
   then compares exact canonical bytes and replays a fresh read; and
6. lets uncertain lock release override every provisional result.

Restart is non-idempotent: a second initialization returns `mission_exists`,
preserves exact bytes, and an independent read/replay returns the original
projection.

### Missing profile-aware producer

Add `createProfileAwareGovernanceDecisionEntryV1` in
`profile-aware-mission-v1.mts`. It accepts the projection, journal-frozen trusted
bindings, and `SignedProfileEvidenceV1`; requires exactly one unsatisfied
Coulson `mission_authorization` requirement, waiting authorization and
not-started execution; verifies the exact-next-sequence signature; and copies
the evidence timestamp to the entry.

Do not add another implementation-authority or runtime-binding entry producer.

### CLI workflow

Extend `mission-cli.mts` with:

```text
shield mission begin --profile-aware --brief <file>
shield mission authorize --mission-id <id>
shield mission wheels-up --mission-id <id> --input <file>
shield mission bind --mission-id <id> --input <file>
```

`--profile-aware` selects `ProfileAwareMissionBriefContentV1` intake before the
supervised parser and rejects `--authorization`, `--delegation`, and
`--eligibility`. The no-flag path retains existing supervised behavior.

`mission authorize` discriminates the durable journal kind. Schema 9 uses the
journal-frozen Coulson binding, existing passcode signer, new governance
producer, and profile-aware append. Schema 2 remains unchanged.

Wheels Up and bind are separate commands and passcode interactions. Each signs
one distinct payload and performs one durable append. Prebuilt unsigned or
signed envelopes are not part of this supported route.

The closed Wheels Up intent contains only:

- `baseRevision`, `modelId`;
- `approvedRelativePaths`, `approvedActionIds`, `approvedEffectClasses`;
- `approvedEffectKeys`, `approvedCapabilities`, `validationCommandIds`.

The closed bind intent contains only `reasoningRuntimeId` and
`toolExecutorId`. The CLI derives the initial binding identity/version and uses
the active authority's exact scope.

The CLI derives mission, subject, mission revision, May seat, next sequence,
timestamp, journal-frozen Coulson identity, repository ID, canonical real root,
fresh branch and HEAD, `artifactRevisionId = headRevision`, and all authority,
evidence, binding, authorization, digest, source, and prior-sequence references.
It verifies the base exists and is an ancestor of HEAD, then rechecks journal
sequence and live root/branch/HEAD after signing and before append. Bind also
requires the active authority repository/root/branch/HEAD to match fresh host
observations.

Before prompting, Wheels Up rejects a `modelId` equal to `may` or any mission
participant. Bind rejects reasoning-runtime and tool-executor identities unless
they are mutually distinct and distinct from May, the authority model, and all
mission participants.

## Bounded paths

- `packages/shield-team-system/src/mission-store.mts`
- `packages/shield-team-system/src/profile-aware-mission-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- focused tests for those modules and the governed dispatch handoff
- CLI help, `docs/product/v0.3-product-contract.md`, and one operator workflow

No profile schema or authority meaning changes, dispatch implementation,
adapter change, model invocation, #137 external fixture run, or #29 work.

## Acceptance tests

- Initialization: pre-mutation replay, fresh write, non-idempotent restart,
  exact bytes/readback, no overwrite, sequence/type/schema rejection,
  confinement/symlink defense, file/directory sync uncertainty, short write,
  readback mismatch, and tokenized lock-release uncertainty.
- Governance: valid mission authorization plus invalid requirement, state,
  signature, signer, sequence, and timestamp.
- CLI: full begin/authorize/wheels-up/bind chain; closed input rejection;
  distinct signatures and sequences; bad passcode/order; stale journal or host;
  non-ancestor base; invalid identity separation; overbroad/mismatched binding;
  mixed schema; and supervised regression coverage.
- Dispatch handoff: use the real durable journal reader and exact in-memory
  supporting reads. Call a no-effect claim stub exactly once and have it return
  invalid. Assert `recovery_required` with `readiness: "dispatch_ready"`, with
  zero real external-store mutations, model/tool calls, mission-effect appends,
  or terminal-receipt appends.

## Validation

```bash
npm run build --workspace packages/shield-team-system
node --test --test-concurrency=1 packages/shield-team-system/tests/mission-store.test.mjs packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs packages/shield-team-system/tests/supervised-cli.test.mjs
npm test --workspace packages/shield-team-system
```

## Review record

Stateful local Gemma/Daisy reconnaissance identified the missing initialization
boundary and independent command sequence. Fury required and then approved the
producer, provenance, identity-separation, durability, restart, and no-effect
handoff details above against the clean base revision.
