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
`synthetic_test` evidence is useful only in A0 tests and A1 always rejects it.

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
| Git revision used here | `^[0-9a-f]{40}$` |
| parent-plan raw hash | bare `^[0-9a-f]{64}$` |
| raw receipt sequence hash | `^sha256:[0-9a-f]{64}$` |
| canonical contract digest | `^sha256:[A-Za-z0-9_-]{43}$` |
| canonical payload | `^[A-Za-z0-9_-]{43}$` |
| signing key reference | `^ed25519:sha256:[A-Za-z0-9_-]{43}$` |
| branch | Team System identifier; 1–256 UTF-8 bytes |
| repository-relative path | 1–1024 UTF-8 bytes; `/` separators; no leading `/`, empty/`.`/`..` segment, backslash, NUL, or trailing `/` |
| canonical absolute root | absolute normalized path, 1–4096 UTF-8 bytes, no NUL; A0 compares it as opaque validated data |

Mission, subject, repository, action, effect, capability, validation, runtime,
model, executor, binding, and gate IDs use the Team System identifier grammar.
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
| `missionId`, `subjectId`, `repositoryId` | Team System identifiers |
| `planningBaseRevision`, `parentPlanCommit` | Git revisions |
| `parentPlanPath` | repository-relative path |
| `parentPlanRawSha256` | bare lowercase hex hash |
| `transitionKind` | literal `fresh_authorize_wheels_up` |
| `boundedOutcome` | non-empty string, max 1024 UTF-8 bytes |
| `approvedRelativePaths`, `publicationPaths` | non-empty unique relative-path arrays, max 256 each |
| `approvedActionIds`, `approvedEffectClasses`, `approvedEffectKeys`, `approvedCapabilities`, `validationCommandIds` | non-empty unique Team System identifier arrays, max 256 each |
| `modelId`, `reasoningRuntimeId`, `toolExecutorId` | Team System identifiers |
| `exclusions` | exact fixed exclusion array below |

The six ordinary approved arrays use and preserve current `localeCompare`
ordering. `publicationPaths` alone uses UTF-16 code-unit ordering. The contract
contains no event-kind or publication-effect selectors; those are adapter-fixed.

### 2. `mission.parent-plan-review-evidence.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `repositoryId` | Team System identifier |
| `planningBaseRevision`, `parentPlanCommit` | Git revisions |
| `parentPlanPath` | repository-relative path |
| `parentPlanRawSha256` | bare lowercase hex hash |
| `transitionPlanId`, `transitionPlanDigest` | exact referenced ID/digest |
| `verdict` | literal `PASS` |
| `reviewerSeatId` | literal `fury` |
| `reviewerRuntimeId`, `reviewerModelId`, `reviewerExecutorId` | pairwise-distinct Team System identifiers |
| `rawReceiptSetSha256` | exact framed receipt sequence hash |
| `attributionClass` | `team_system_projection` or `synthetic_test` |
| `preparationEligibility` | literal `preparationEligible` |

There is no `productionEligible` field. Reviewer runtime/model/executor are
pairwise distinct, cannot equal a canonical participant seat, and cannot equal
the transition plan's May/runtime/model/executor identities. A0 validates this
closed projection and digest graph but does not accept raw receipts or assert
their provenance.

### 3. `mission.transition-intent.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `missionId`, `subjectId`, `repositoryId` | exact plan-bound identifiers |
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
| `missionId`, `subjectId`, `repositoryId` | exact intent-bound identifiers |
| `canonicalRoot` | canonical absolute root |
| `branch` | branch grammar |
| `planningBaseRevision`, `baseRevision`, `headRevision` | Git revisions |
| `baseAncestor`, `workspaceClean` | literal `true` |
| `changedPaths` | unique UTF-16-ordered relative paths, max 256 |
| `symlinkPaths`, `gitlinkPaths` | unique UTF-16-ordered relative paths, max 256; both must be empty for ready |
| `missionSchemaVersion` | integer literal `9` |
| `authorizationState`, `implementationAuthorityState`, `finalAcceptanceState` | literal `waiting` |
| `executionState` | literal `not-started` |
| `implementationAuthorityCount`, `runtimeBindingCount`, `activeRuntimeBindingCount`, `publicationAuthorizationCount` | integer literal `0` |
| `pendingCoulsonMissionAuthorizationCount` | integer literal `1` |
| `journalSequence` | safe integer 0–9,007,199,254,740,991 |
| `journalSha256` | raw receipt sequence hash grammar (`sha256:` plus 64 hex) |
| `signerBindingId` | Team System identifier |
| `signingKeyRef` | signing-key grammar |
| `remainingHumanGates` | unique Team System identifier array, max 16; array order preserved |
| `preparationEligibility` | literal `preparationEligible` |

A0 accepts this as authority-none host projection. It performs no repository,
journal, signer, or clock I/O and cannot establish production freshness.

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
| `missionId`, `subjectId`, `repositoryId` | exact bound identifiers |
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

May (`may`), `reasoningRuntimeId`, `modelId`, and `toolExecutorId` are mutually
distinct. The latter three cannot alias any mission participant. Reviewer
runtime/model/executor are separately pairwise distinct and cannot alias these
four implementation identities.

### 7. `mission.preparation-receipt.v1`

| Key | Exact type / value / maximum |
| --- | --- |
| `schemaId`, `authority`, `id`, `digest` | common fields for this schema |
| `missionId`, `repositoryId` | exact bound identifiers |
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
| 1 | contract shape/grammar/bound/canonicalization/digest/ID/variant/identity-separation failure | `invalid_preparation_input` |
| 2 | repository, mission, parent-plan, transition-plan, review, or graph identity mismatch | `reviewed_plan_mismatch` |
| 3 | verdict not PASS, attribution projection not closed, or synthetic evidence presented outside A0 synthetic-test mode | `parent_plan_review_ineligible` |
| 4 | repository, branch, HEAD, base ancestry, cleanliness, changed paths, symlink, or gitlink observation mismatch | `repository_observation_stale` |
| 5 | schema/state/count/pending-Coulson conditions are not the exact fresh schema-9 state | `fresh_wheels_up_state_ineligible` |
| 6 | signer binding, journal, remaining-gate, or required host projection is missing, ambiguous, or mismatched | `freshness_evidence_incomplete` |
| 7 | all checks pass | ready `authorize-wheels-up` selection, candidate, and receipt |

Blocked results return only the blocked selection and no candidate/receipt or
effectful instruction.

## Exact public surface

The one `"."` export exposes only these runtime functions:

- `canonicalJsonV1`
- `computeCanonicalContractDigestV1`
- `computeContentIdV1`
- `computeRawReceiptSetSha256V1`
- `validateTransitionPlanV1`
- `validateParentPlanReviewEvidenceV1`
- `validateTransitionIntentV1`
- `validateFreshAuthorizeWheelsUpObservationV1`
- `validateNextTransitionSelectionV1`
- `validateFreshAuthorizeWheelsUpCandidateV1`
- `validatePreparationReceiptV1`
- `selectNextTransitionV1`
- `compileFreshAuthorizeWheelsUpCandidateV1`
- `prepareMissionTransitionV1`

It exports declarations named `TransitionPlanV1`,
`ParentPlanReviewEvidenceV1`, `TransitionIntentV1`,
`FreshAuthorizeWheelsUpObservationV1`, `NextTransitionSelectionV1`,
`FreshAuthorizeWheelsUpCandidateV1`, `PreparationReceiptV1`,
`PreparationReasonCodeV1`, `PreparationValidationResultV1<T>`, and
`PrepareMissionTransitionResultV1`.

`PreparationValidationResultV1<T>` is exactly
`{state:"valid", value:T}` or
`{state:"invalid", reasonCode:"invalid_preparation_input", errors:readonly string[]}`.
`PrepareMissionTransitionResultV1` is exactly
`{state:"blocked", selection:NextTransitionSelectionV1}` or
`{state:"ready", selection:NextTransitionSelectionV1,
candidate:FreshAuthorizeWheelsUpCandidateV1,
receipt:PreparationReceiptV1}`. No thrown validation branch, default export,
subpath export, mutable singleton, or effectful callback is public.

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
| `validation:mission-preparation.pack-install-v1` | `shield269_tmp="$(mktemp -d /private/tmp/shield-269-package.XXXXXX)" && trap 'rm -rf -- "$shield269_tmp"' EXIT && npm pack --workspace @shield/mission-preparation --pack-destination "$shield269_tmp" && mkdir "$shield269_tmp/install" && shield269_tgz_count="$(find "$shield269_tmp" -maxdepth 1 -type f -name 'shield-mission-preparation-*.tgz' -print | wc -l | tr -d ' ')" && test "$shield269_tgz_count" = 1 && shield269_tgz="$(find "$shield269_tmp" -maxdepth 1 -type f -name 'shield-mission-preparation-*.tgz' -print)" && (cd "$shield269_tmp/install" && npm install --offline --ignore-scripts --no-audit --no-fund "$shield269_tgz" && node --input-type=module -e 'import("@shield/mission-preparation").then(m=>{if(typeof m.prepareMissionTransitionV1!=="function"||m.canonicalJsonV1({b:1,a:2})!=="{\\"a\\":2,\\"b\\":1}")process.exit(1)})')` |
| `validation:mission-preparation.clean-v1` | `rm -rf -- packages/mission-preparation/dist && test -z "$(git status --porcelain=v1 --untracked-files=all)"` |

Failure to resolve exactly one tarball fails. The trap removes only the
validated mktemp root. Package tests additionally scan source, declarations,
metadata, lockfile,
tarball members/bytes, and installed tree for `@shield/team-system` and
`packages/shield-team-system`, assert one `"."` export, no runtime dependency,
bin or install hook, and prove a fixed candidate through the installed package.

Acceptance also requires hostile object/canonical digest vectors; all raw
receipt framing attacks listed above; all seven reason/ready rows; exact digest
edge substitution; mixed-case/non-ASCII ordering; fixed event/effect/exclusion
override rejection; identity-alias rejection; and clean fresh-process digest
vectors. After every validation flight, remove `packages/mission-preparation/dist`
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
