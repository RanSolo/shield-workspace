# Issue #269 — mission-preparation Lane A0 child plan

## Frozen identity and authority

- Repository: `RanSolo/shield-workspace`
- Issue / mission: `#269` / `mission:issue-269`
- Branch: `agent/issue-269-mission-preparation`
- Planning base: `fc47ccf5b47fc1b340d1ec80a5c025ac7fd04344`
- Approved parent-plan commit: `43f6d37687a76c634951880b41f58caab8709753`
- Parent-plan path: `docs/missions/issue-268-key-turn-plan.md`
- Parent-plan raw-byte SHA-256:
  `e095e7127c6df042e58992e41b6363ddd99cf48cf0d09c1113c901dc46a422c0`
- Slice: parent Lane A0 only. Issue #270 / Lane A1 remains predecessor-blocked
  until #269 has exact-head Mack PASS, Fury conformance PASS, and recorded human
  acceptance.
- Current authority: planning only. Implementation remains blocked until Fury
  passes this exact child plan and Coulson supplies fresh schema-9 Wheels Up/PIN
  authority for its exact identity and scope.

## Objective and package boundary

Create a separately packable `@shield/mission-preparation@0.1.0` authority-none
library that validates reviewed-plan projections and deterministically compiles
the first fresh schema-9 `authorize-wheels-up` candidate. Prove independent
offline installation and use of its own tarball without importing or resolving
`@shield/team-system`.

The package is ESM (`type: "module"`), has one `"."` export from `dist` with
declarations, `files: ["dist"]`, `sideEffects: false`, no runtime dependencies,
and no bin, install hook, CLI, signer, journal, store, network, model, GitHub, or
Team System import. A build-only `prepack` is permitted. Nx targets are inferred
from `package.json`; do not edit `nx.json` or add `project.json`.

A0 performs no I/O and produces only `preparationEligible`, authority-none data.
It neither accepts nor emits a `productionEligible` field or value. It does not
verify raw Fury attribution. In A1, Team System alone captures raw receipt bytes,
strictly parses them, calls `evaluateSeatDispatchAttributionV1` with the parsed
objects, and decides whether the preparation may be used in production.
The review-evidence validator accepts `synthetic_test` as structurally valid for
A0 test fixtures, but every selection/preparation call returns
`parent_plan_review_ineligible` for it. A1 always rejects it.

## Normative encoding and grammar

All seven contracts are closed plain data. Proxies, non-plain prototypes,
accessors, symbols, non-enumerable fields, sparse arrays, `undefined`, non-finite
numbers, negative zero, unknown keys/variants, and implicit coercion are invalid.
Objects have at most 128 keys, arrays at most 256 items, nesting depth at most 16,
each string at most 4096 UTF-8 bytes, each path at most 1024 UTF-8 bytes, and each
canonical contract body at most 1 MiB. Contract-specific smaller bounds below
take precedence. No Unicode normalization is performed anywhere.

### Shared scalar grammar

| Name | Exact grammar |
| --- | --- |
| Team System identifier | `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$` |
| repository ID | exactly `owner/name`; each component matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$` |
| approved relative path | satisfies both Team System identifier and repository-relative-path grammars; therefore ASCII, starts alphanumeric, and is at most 256 characters |
| Git revision used here | `^[0-9a-f]{40}$` |
| parent-plan raw hash | bare `^[0-9a-f]{64}$` |
| raw receipt sequence hash | `^sha256:[0-9a-f]{64}$` |
| canonical contract digest | `^sha256:[A-Za-z0-9_-]{43}$` |
| canonical payload | `^[A-Za-z0-9_-]{43}$` |
| signing key reference | `^ed25519:sha256:[A-Za-z0-9_-]{43}$` |
| branch | Team System identifier; 1–256 UTF-8 bytes |
| repository-relative path | 1–1024 UTF-8 bytes; `/` separators; no leading `/`, empty/`.`/`..` segment, backslash, NUL, or trailing `/` |
| canonical absolute root | absolute normalized path, 1–4096 UTF-8 bytes, no NUL; A0 compares it as opaque validated data |

Mission, subject, action, effect, capability, validation, runtime, model,
executor, binding, and gate IDs use the Team System identifier grammar.
`repositoryId` uses the exact two-component repository grammar above.
Planning base, plan commit, base revision, and HEAD use the exact 40-character
Git grammar. These intentionally form a strict subset of the accepting Team
System grammars in `mission-v2`, `mission-builder-v1`, and
`implementation-authority-v1`; A0 may not widen or reinterpret them.

### Canonical bytes, digests, and IDs

For contract schema ID `D`, canonical bytes are exactly:

```text
UTF8(D) || 0x00 || UTF8(canonicalJson(contract without its own id and digest))
```

`canonicalJson` recursively sorts object keys by UTF-16 code-unit comparison
(`left < right`, `left > right`), preserves array order, and uses
`JSON.stringify` string/number/boolean/null escaping. It performs no Unicode or
escape normalization beyond `JSON.stringify`. The canonical digest is
`"sha256:" + base64url_no_padding(SHA256(canonicalBytes))`. The 43-character
payload is the digest suffix. The content ID is the contract-specific prefix in
the table below concatenated directly with that same payload. Supplied `id` and
`digest` must both recompute exactly.

| Schema ID | Content-ID prefix |
| --- | --- |
| `mission.transition-plan.v1` | `transition-plan:` |
| `mission.parent-plan-review-evidence.v1` | `parent-plan-review-evidence:` |
| `mission.transition-intent.v1` | `transition-intent:` |
| `mission.fresh-authorize-wheels-up-observation.v1` | `fresh-authorize-wheels-up-observation:` |
| `mission.next-transition-selection.v1` | `next-transition-selection:` |
| `mission.fresh-authorize-wheels-up-candidate.v1` | `fresh-authorize-wheels-up-candidate:` |
| `mission.preparation-receipt.v1` | `preparation-receipt:` |

### Raw receipt sequence framing

`rawReceiptSetSha256` is exactly
`"sha256:" + lowercase_hex(SHA256(frame))`, where:

```text
frame = UTF8("mission.raw-receipt-set.v1") || 0x00 || uint64be(count)
        || for each receipt in supplied order:
             uint64be(byteLength(rawBytes)) || rawBytes
```

`uint64be` is an unsigned eight-byte big-endian integer. `byteLength` is the
exact raw byte count. Count is 1–128, each receipt is 1–1,048,576 bytes, and the
sum of receipt bytes is at most 16,777,216 bytes. Hash without parsing,
normalization, reserialization, delimiter insertion, or reordering. A1 captures
each complete byte sequence before strict parsing; after computing this digest,
it passes the parsed receipt objects—not caller projections—to Team System
replay. Tests bind zero/over-cardinality, length boundary shift, reorder,
truncate, byte substitution, receipt substitution, count mismatch, and trailing
byte cases.

## Normative contract schemas

Every table lists the exact own enumerable keys. `id`, `digest`, `schemaId`, and
`authority` are non-null strings; `authority` is always literal `none`.

### 1. `mission.transition-plan.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId` | literal `mission.transition-plan.v1` |
| `authority` | literal `none` |
| `id`, `digest` | recomputed transition-plan ID/digest |
| `missionId`, `subjectId` | Team System identifiers |
| `repositoryId` | exact repository ID |
| `planningBaseRevision`, `parentPlanCommit` | Git revisions |
| `parentPlanPath` | repository-relative path |
| `parentPlanRawSha256` | bare lowercase hex hash |
| `transitionKind` | literal `fresh_authorize_wheels_up` |
| `boundedOutcome` | non-empty string, max 1024 UTF-8 bytes |
| `approvedRelativePaths` | non-empty unique approved-relative-path array, max 256 |
| `publicationPaths` | non-empty unique relative-path array, max 256 |
| `approvedActionIds`, `approvedEffectKeys`, `approvedCapabilities`, `validationCommandIds` | non-empty unique Team System identifier arrays, max 256 each |
| `approvedEffectClasses` | non-empty unique array, max 3; items are exactly `behavioral_implementation`, `verification`, or `coordination` |
| `modelId`, `reasoningRuntimeId`, `toolExecutorId` | Team System identifiers |
| `exclusions` | exact fixed exclusion array below |

The six ordinary approved arrays use and preserve current `localeCompare`
ordering. `publicationPaths` alone uses UTF-16 code-unit ordering. The contract
contains no event-kind or publication-effect selectors; those are adapter-fixed.

### 2. `mission.parent-plan-review-evidence.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `repositoryId` | exact repository ID |
| `planningBaseRevision`, `parentPlanCommit` | Git revisions |
| `parentPlanPath` | repository-relative path |
| `parentPlanRawSha256` | bare lowercase hex hash |
| `transitionPlanId`, `transitionPlanDigest` | exact referenced ID/digest |
| `verdict` | existing Fury enum: `PASS`, `PASS_WITH_REQUIRED_CHANGES`, or `FAIL` |
| `reviewerSeatId` | literal `fury` |
| `reviewerRuntimeId`, `reviewerModelId`, `reviewerExecutorId` | exact host-observed Team System identifiers |
| `rawReceiptSetSha256` | exact framed receipt sequence hash |
| `attributionClass` | `team_system_projection` or `synthetic_test` |
| `preparationEligibility` | literal `preparationEligible` |

There is no `productionEligible` field. Existing Fury attribution requires
`reviewerRuntimeId !== reviewerExecutorId` and neither value may equal `fury`.
`reviewerModelId` need not differ from either value and none of the three is
required to be disjoint from May-stage identities. The fields remain separate
and preserve exact host-observed values. A0 validates this closed projection and
digest graph but does not accept raw receipts or assert their provenance.

### 3. `mission.transition-intent.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `missionId`, `subjectId` | exact plan-bound identifiers |
| `repositoryId` | exact plan-bound repository ID |
| `planningBaseRevision` | exact plan-bound Git revision |
| `transitionPlanId`, `transitionPlanDigest` | exact plan reference |
| `parentReviewEvidenceId`, `parentReviewEvidenceDigest` | exact review reference |
| `transitionKind` | literal `fresh_authorize_wheels_up` |
| `preparationEligibility` | literal `preparationEligible` |

The intent contains no paths, effects, adapter facts, host observations,
authority claim, or caller-selected command. Decisions are consumed only from
the digest-bound transition plan.

### 4. `mission.fresh-authorize-wheels-up-observation.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `missionId`, `subjectId` | exact intent-bound identifiers |
| `repositoryId` | exact intent-bound repository ID |
| `canonicalRoot` | canonical absolute root |
| `branch` | branch grammar |
| `planningBaseRevision`, `baseRevision`, `headRevision` | Git revisions |
| `baseAncestor`, `workspaceClean` | booleans |
| `changedPaths` | unique UTF-16-ordered relative paths, max 256 |
| `symlinkPaths`, `gitlinkPaths` | unique UTF-16-ordered relative paths, max 256; both must be empty for ready |
| `missionSchemaVersion` | safe integer 1–9 |
| `authorizationState` | `waiting` or `authorized` |
| `implementationAuthorityState` | `waiting`, `authorized`, or `revoked` |
| `finalAcceptanceState` | `waiting` or `accepted` |
| `executionState` | `not-started`, `running`, or `completed` |
| `implementationAuthorityCount`, `runtimeBindingCount`, `activeRuntimeBindingCount`, `publicationAuthorizationCount` | nonnegative safe integers, max 256 |
| `pendingCoulsonMissionAuthorizationCount` | nonnegative safe integer, max 256 |
| `journalSequence` | safe integer 0–9,007,199,254,740,991 |
| `journalSha256` | raw receipt sequence hash grammar (`sha256:` plus 64 hex) |
| `signerBindingId` | Team System identifier or `null` |
| `signingKeyRef` | signing-key grammar or `null` |
| `signerBindingMatchCount` | nonnegative safe integer, max 256 |
| `remainingHumanGates` | unique Team System identifier array, max 16; array order preserved |
| `preparationEligibility` | literal `preparationEligible` |

Exactly one signer match requires non-null `signerBindingId` and `signingKeyRef`.
Zero or more than one match requires both fields to be `null`; these are valid
missing/ambiguous observations that reach row 6. Other ineligible booleans,
states, and counts remain structurally valid and reach rows 4–6. A0 accepts this
as authority-none host projection. It performs no repository, journal, signer,
or clock I/O and cannot establish production freshness.

### 5. `mission.next-transition-selection.v1`

Common exact keys for both variants are `schemaId`, `authority`, `id`, `digest`,
`missionId`, `transitionIntentId`, `transitionIntentDigest`, `observationId`,
`observationDigest`, `state`, `transitionKind`, and `reasonCode`.

| Variant | Exact values / nullability |
| --- | --- |
| ready | `state: "ready"`, `transitionKind: "authorize-wheels-up"`, `reasonCode: null` |
| blocked | `state: "blocked"`, `transitionKind: null`, `reasonCode` is one stable reason below |

`null` is permitted only in the two positions stated above. Unknown transition
or contract variants are malformed and produce `invalid_preparation_input`
before a selection contract is emitted.

### 6. `mission.fresh-authorize-wheels-up-candidate.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `missionId`, `subjectId` | exact bound identifiers |
| `repositoryId` | exact bound repository ID |
| `transitionPlanId`, `transitionPlanDigest`, `parentReviewEvidenceId`, `parentReviewEvidenceDigest`, `transitionIntentId`, `transitionIntentDigest`, `observationId`, `observationDigest`, `selectionId`, `selectionDigest` | exact graph references |
| `preparationEligibility` | literal `preparationEligible` |
| `transitionKind` | literal `authorize-wheels-up` |
| `seatId` | literal `may` |
| `eventKinds` | exact fixed event array below |
| `publicationEffects` | exact fixed effect array below |
| `exclusions` | exact fixed exclusion array below |
| `actionInput` | exact 11-field object below |
| `decisionProjection` | exact projection object below |

`actionInput` has exactly `baseRevision`, `modelId`,
`approvedRelativePaths`, `approvedActionIds`, `approvedEffectClasses`,
`approvedEffectKeys`, `approvedCapabilities`, `validationCommandIds`,
`reasoningRuntimeId`, `toolExecutorId`, and `publicationPaths`, copied from the
bound plan/observation with the two frozen ordering rules.

`decisionProjection` has exactly `missionId`, `subjectId`, `repositoryId`,
`branch`, `baseRevision`, `headRevision`, `approvedRelativePaths`,
`publicationPaths`, `approvedActionIds`, `approvedEffectClasses`,
`approvedEffectKeys`, `approvedCapabilities`, `validationCommandIds`, `seatId`,
`modelId`, `reasoningRuntimeId`, `toolExecutorId`, `eventKinds`,
`publicationEffects`, `exclusions`, and `remainingHumanGates`. It is concise
display data, not a human decision or authority claim.

May (`may`), `reasoningRuntimeId`, `modelId`, and `toolExecutorId` retain the
existing four-way distinctness rule. The latter three cannot alias any mission
participant. Reviewer fields obey only the separate existing Fury rule above;
no cross-stage inequality is imposed.

### 7. `mission.preparation-receipt.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `missionId` | exact bound identifier |
| `repositoryId` | exact bound repository ID |
| `transitionPlanId`, `transitionPlanDigest`, `parentReviewEvidenceId`, `parentReviewEvidenceDigest`, `transitionIntentId`, `transitionIntentDigest`, `observationId`, `observationDigest`, `selectionId`, `selectionDigest`, `candidateId`, `candidateDigest` | exact graph references |
| `rawReceiptSetSha256` | exact review-evidence value |
| `preparationEligibility` | literal `preparationEligible` |
| `result` | literal `candidate_compiled` |

The receipt contains no signature, signed payload, journal entry/sequence
mutation, timestamp, command, PIN/passcode byte, human decision, effect result,
or production eligibility.

## Digest graph and fixed adapter facts

Every referenced `id` and `digest` is recomputed before comparison. The required
acyclic graph is plan → review evidence → intent → observation/selection →
candidate → receipt. Intent binds plan and review; selection binds intent and
observation; candidate binds every predecessor; receipt binds every predecessor
and `rawReceiptSetSha256`. Cross-mission/repository/base/plan/review identity,
digest substitution, omitted edge, self-reference, or cycle is invalid.

The exact adapter-fixed arrays, in this exact order, are:

- event kinds: `governance.decided`, `implementation.authorized`,
  `runtime.binding_recorded`, `review.publication_authorized`;
- publication effects: `review.branch.push`,
  `review.pull_request.create_draft`;
- exclusions: `review.comment.publish`,
  `review.pull_request.update_draft`,
  `review.pull_request.mark_ready`, `merge`, `deployment`, `release`,
  `final_acceptance`.

They cannot be selected or overridden by intent. The candidate contains no
signatures, journal entries, timestamps, human decisions, commands, or effects.

## Stable first-match reason table

Evaluate in this exact order. Unknown variants fail as row 1; there is no
`unsupported_transition` result.

| Order | Condition | Result |
| --- | --- | --- |
| 1 | malformed contract shape/grammar/bound/canonicalization/digest/ID/variant or impossible signer representation | `invalid_preparation_input` |
| 2 | repository, mission, parent-plan, transition-plan, review, or graph identity mismatch | `reviewed_plan_mismatch` |
| 3 | structurally valid verdict is not PASS or `attributionClass` is `synthetic_test` | `parent_plan_review_ineligible` |
| 4 | repository, branch, HEAD, base ancestry, cleanliness, changed paths, symlink, or gitlink observation mismatch | `repository_observation_stale` |
| 5 | schema/state/count/pending-Coulson conditions are not the exact fresh schema-9 state | `fresh_wheels_up_state_ineligible` |
| 6 | signer binding, journal, remaining-gate, or required host projection is missing, ambiguous, or mismatched | `freshness_evidence_incomplete` |
| 7 | all checks pass | ready `authorize-wheels-up` selection, candidate, and receipt |

Malformed input returns the non-content-addressed invalid result defined below;
it never emits a selection. Only structurally valid rows 2–6 return a
content-addressed blocked selection, with no candidate/receipt or effectful
instruction. Every preparation call supplied `synthetic_test` returns row 3;
there is no synthetic-test mode, option, override, or production path.

## Exact public surface

The one `"."` export exposes exactly these 14 runtime signatures:

```ts
export function canonicalJsonV1(
  input: Readonly<{ value: unknown }>,
): PreparationValidationResultV1<string>;

export function computeCanonicalContractDigestV1(
  input: Readonly<{ schemaId: ContractSchemaIdV1; body: unknown }>,
): PreparationValidationResultV1<CanonicalContractDigestV1>;

export function computeContentIdV1(
  input: Readonly<{
    schemaId: ContractSchemaIdV1;
    digest: CanonicalContractDigestV1;
  }>,
): PreparationValidationResultV1<ContractContentIdV1>;

export function computeRawReceiptSetSha256V1(
  input: Readonly<{ rawReceipts: readonly Uint8Array[] }>,
): PreparationValidationResultV1<RawReceiptSetSha256V1>;

export function validateTransitionPlanV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<TransitionPlanV1>;

export function validateParentPlanReviewEvidenceV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<ParentPlanReviewEvidenceV1>;

export function validateTransitionIntentV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<TransitionIntentV1>;

export function validateFreshAuthorizeWheelsUpObservationV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<FreshAuthorizeWheelsUpObservationV1>;

export function validateNextTransitionSelectionV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<NextTransitionSelectionV1>;

export function validateFreshAuthorizeWheelsUpCandidateV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<FreshAuthorizeWheelsUpCandidateV1>;

export function validatePreparationReceiptV1(
  input: Readonly<{ artifact: unknown }>,
): PreparationValidationResultV1<PreparationReceiptV1>;

export function selectNextTransitionV1(
  input: SelectNextTransitionInputV1,
): SelectNextTransitionResultV1;

export function compileFreshAuthorizeWheelsUpCandidateV1(
  input: CompileFreshAuthorizeWheelsUpCandidateInputV1,
): PreparationValidationResultV1<FreshAuthorizeWheelsUpCandidateV1>;

export function prepareMissionTransitionV1(
  input: PrepareMissionTransitionInputV1,
): PrepareMissionTransitionResultV1;
```

Every function argument is one exact closed own-data-property object; extra,
missing, accessor, proxy, symbolic, or non-enumerable argument fields are
invalid. `canonicalJsonV1.value` is a canonicalizable body under the shared
bounds. `computeCanonicalContractDigestV1.body` is the complete contract body
with no own `id` or `digest`; `schemaId` must equal the body's own `schemaId`.
`computeContentIdV1` accepts only a syntactically valid canonical digest for the
supplied schema. Validators expect complete artifacts including their own exact `id` and
`digest` and recompute both.

`computeRawReceiptSetSha256V1` accepts a dense ordinary array whose members are
exact `Uint8Array` instances; it clones every byte array before framing and
hashing. `SelectNextTransitionInputV1` and `PrepareMissionTransitionInputV1`
each have exactly `plan`, `reviewEvidence`, `intent`, and `observation` artifact
fields. `CompileFreshAuthorizeWheelsUpCandidateInputV1` has those same four plus
exactly `selection`. The compiler accepts only a validated ready selection bound
to those four artifacts. It derives the candidate body internally; the top-level
preparation function derives the receipt. Callers cannot supply IDs, fixed
adapter facts, projections, or output bodies.

All functions validate from property descriptors without invoking caller code,
clone accepted bodies/arrays before use, never mutate or retain inputs, and
recursively freeze every returned object, nested object, array, and error array.
Returned valid artifacts share no mutable object or byte-array reference with
inputs. Primitive strings are returned directly. Invalid inputs never throw and
return the exact invalid variant. Programmer/runtime failures may throw and are
not converted into contract results. No default export, subpath export, mutable
singleton, I/O, or effectful callback is public.

The declarations export exactly these supporting names:
`ContractSchemaIdV1`, `CanonicalContractDigestV1`, `ContractContentIdV1`,
`RawReceiptSetSha256V1`, `TransitionPlanV1`,
`ParentPlanReviewEvidenceV1`, `TransitionIntentV1`,
`FreshAuthorizeWheelsUpObservationV1`, `NextTransitionSelectionV1`,
`FreshAuthorizeWheelsUpCandidateV1`, `PreparationReceiptV1`,
`PreparationReasonCodeV1`, `PreparationValidationResultV1<T>`,
`SelectNextTransitionInputV1`, `SelectNextTransitionResultV1`,
`CompileFreshAuthorizeWheelsUpCandidateInputV1`,
`PrepareMissionTransitionInputV1`, and `PrepareMissionTransitionResultV1`.

```ts
export type PreparationReasonCodeV1 =
  | "invalid_preparation_input"
  | "reviewed_plan_mismatch"
  | "parent_plan_review_ineligible"
  | "repository_observation_stale"
  | "fresh_wheels_up_state_ineligible"
  | "freshness_evidence_incomplete";

export type SelectNextTransitionInputV1 = Readonly<{
  plan: unknown;
  reviewEvidence: unknown;
  intent: unknown;
  observation: unknown;
}>;

export type CompileFreshAuthorizeWheelsUpCandidateInputV1 = Readonly<{
  plan: unknown;
  reviewEvidence: unknown;
  intent: unknown;
  observation: unknown;
  selection: unknown;
}>;

export type PrepareMissionTransitionInputV1 = Readonly<{
  plan: unknown;
  reviewEvidence: unknown;
  intent: unknown;
  observation: unknown;
}>;

export type PreparationValidationResultV1<T> =
  | Readonly<{ state: "valid"; value: T }>
  | Readonly<{
      state: "invalid";
      reasonCode: "invalid_preparation_input";
      errors: readonly string[];
    }>;

export type SelectNextTransitionResultV1 =
  | Readonly<{
      state: "invalid";
      reasonCode: "invalid_preparation_input";
      errors: readonly string[];
    }>
  | Readonly<{ state: "selected"; selection: NextTransitionSelectionV1 }>;

export type PrepareMissionTransitionResultV1 =
  | Readonly<{
      state: "invalid";
      reasonCode: "invalid_preparation_input";
      errors: readonly string[];
    }>
  | Readonly<{ state: "blocked"; selection: NextTransitionSelectionV1 }>
  | Readonly<{
      state: "ready";
      selection: NextTransitionSelectionV1;
      candidate: FreshAuthorizeWheelsUpCandidateV1;
      receipt: PreparationReceiptV1;
    }>;
```

Malformed inputs return `state: "invalid"` without constructing any content ID,
digest, or selection. Structurally valid business ineligibility alone may return
a content-addressed blocked selection.

## Exact writable paths

- `packages/mission-preparation/package.json`
- `packages/mission-preparation/tsconfig.build.json`
- `packages/mission-preparation/src/canonical-json-v1.mts`
- `packages/mission-preparation/src/contracts-v1.mts`
- `packages/mission-preparation/src/preparation-compiler-v1.mts`
- `packages/mission-preparation/src/index.mts`
- `packages/mission-preparation/tests/contracts-v1.test.mjs`
- `packages/mission-preparation/tests/preparation-compiler-v1.test.mjs`
- `packages/mission-preparation/tests/package-boundary.test.mjs`
- `package-lock.json`

This plan is the only additional planning write:
`docs/missions/issue-269-mission-preparation-plan.md`. Every other path is
forbidden, including `nx.json`, any `project.json`, all
`packages/shield-team-system/**`, and #270 artifacts. `dist/**` is ephemeral,
generated validation output, never reviewed source or a committed writable path.
Tarballs and isolated installation trees may exist only beneath an externally
created `mktemp` directory outside the repository.

## Exact validation command registry

May and Mack use these exact IDs and commands from repository root:

| Validation ID | Exact command |
| --- | --- |
| `validation:mission-preparation.build-v1` | `npx nx build @shield/mission-preparation --skip-nx-cache` |
| `validation:mission-preparation.contracts-v1` | `node --test packages/mission-preparation/tests/contracts-v1.test.mjs` |
| `validation:mission-preparation.compiler-v1` | `node --test packages/mission-preparation/tests/preparation-compiler-v1.test.mjs` |
| `validation:mission-preparation.package-boundary-v1` | `node --test packages/mission-preparation/tests/package-boundary.test.mjs` |
| `validation:mission-preparation.nx-test-v1` | `npx nx test @shield/mission-preparation --skip-nx-cache` |
| `validation:mission-preparation.pack-install-v1` | `shield269_tmp="$(mktemp -d /private/tmp/shield-269-package.XXXXXX)" && trap 'rm -rf -- "$shield269_tmp"' EXIT && npm pack --workspace @shield/mission-preparation --pack-destination "$shield269_tmp" && mkdir "$shield269_tmp/install" && shield269_tgz_count="$(find "$shield269_tmp" -maxdepth 1 -type f -name 'shield-mission-preparation-*.tgz' -print | wc -l | tr -d ' ')" && test "$shield269_tgz_count" = 1 && shield269_tgz="$(find "$shield269_tmp" -maxdepth 1 -type f -name 'shield-mission-preparation-*.tgz' -print)" && (cd "$shield269_tmp/install" && npm install --offline --ignore-scripts --no-audit --no-fund "$shield269_tgz" && node --input-type=module -e 'import("@shield/mission-preparation").then(m=>{const r=m.canonicalJsonV1({value:{b:1,a:2}});if(typeof m.prepareMissionTransitionV1!=="function"||r.state!=="valid"||r.value!=="{\\"a\\":2,\\"b\\":1}")process.exit(1)})')` |
| `validation:mission-preparation.clean-v1` | `rm -rf -- packages/mission-preparation/dist && test -z "$(git status --porcelain=v1 --untracked-files=all)"` |

Failure to resolve exactly one tarball fails. The trap removes only the
validated mktemp root. Package tests additionally scan source, declarations,
metadata, lockfile,
tarball members/bytes, and installed tree for `@shield/team-system` and
`packages/shield-team-system`, assert one `"."` export, no runtime dependency,
bin or install hook, and prove a fixed candidate through the installed package.

Acceptance also requires hostile object/canonical digest vectors; all raw
receipt framing attacks listed above; malformed-input invalid results plus
structurally valid rows 2–7; pairwise and three-or-more simultaneous negative
facts proving first-match precedence across rows 2–6; exact digest edge
substitution; mixed-case/non-ASCII ordering; fixed event/effect/exclusion
override rejection; May four-way alias rejection; permitted reviewer-model and
cross-stage equality vectors; Fury runtime/executor inequality vectors; and
clean fresh-process digest vectors. After every validation flight, remove
`packages/mission-preparation/dist`
and any other generated package output, then require empty
`git status --porcelain=v1 --untracked-files=all` at the exact implementation
HEAD. Mack independently reruns the registry and exact changed-path comparison.

## Sequencing and stop conditions

1. Fury reviews this exact committed plan and raw-byte SHA-256. Any REVISE creates
   a new commit/digest and requires a new exact review.
2. After Fury PASS, Hill may prepare—but not invoke—the fresh schema-9 mission/PIN
   gate for the exact approved revision and paths. No May implementation starts
   without recorded Coulson authority.
3. May stops on stale HEAD, path/scope expansion, contract ambiguity, identity
   alias, Team System dependency, or failed validation. Mack validates exact
   clean HEAD; Fury then performs exact-revision conformance review.
4. Publication requires its separate existing human gate and may create only the
   authorized initial draft. No ready-for-review, merge, deployment, release, or
   final acceptance is authorized.
5. #270 starts only after #269 acceptance. As Fury confirmed, #270—not A0—must
   freeze whether Team System bundles the exact dependency in its tarball or
   distributes and pins both artifacts. This choice does not block #269.
