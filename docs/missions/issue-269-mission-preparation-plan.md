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

## Objective

Create a separately packable, authority-none `@shield/mission-preparation`
library that validates the reviewed-plan envelope and deterministically compiles
the first fresh schema-9 `authorize-wheels-up` transition candidate. Prove the
package can be installed and used offline from its own tarball without importing
or resolving `@shield/team-system`.

This slice produces data only. It does not verify raw Fury receipts, sign, append
journal entries, prompt for a PIN, invoke a CLI/model, access a store or network,
publish, or perform any transition. The Team System integration and raw receipt
verification remain #270.

## Package boundary

Create `@shield/mission-preparation@0.1.0` with:

- ESM only (`type: "module"`);
- one `"."` export from `dist`, with generated declarations;
- `files: ["dist"]` and `sideEffects: false`;
- no runtime dependencies, bin, lifecycle hook beyond a build-only `prepack`,
  CLI, store, network, signer, journal, or Team System import;
- TypeScript/Node development dependencies only as required to build and test;
- Nx targets inferred from `package.json`.

Do not edit `nx.json` or add `project.json`. The package must contain no source,
generated import, package dependency, path reference, or packed artifact
reference to `@shield/team-system` or `packages/shield-team-system`.

## Closed authority-none contracts

Implement strict closed-data validators and immutable outputs for exactly these
versioned contracts:

1. `mission.transition-plan.v1` — exact mission/repository/planning identity and
   the non-observable approved implementation/publication paths, action IDs,
   effect classes/keys, capabilities, validation command IDs, selected
   model/runtime/executor identities, bounded outcome, and exclusions.
2. `mission.parent-plan-review-evidence.v1` — exact parent plan commit/path/raw
   digest, transition-plan digest, PASS verdict, Fury seat, actual review
   runtime/model/executor identities, raw receipt-set digest, and a closed
   attribution projection. It grants no authority.
3. `mission.transition-intent.v1` — the closed reviewed-plan binding and one
   fresh-authorize-wheels-up intent variant. It contains only reviewed decisions,
   never host observations or caller-selected adapter facts.
4. `mission.fresh-authorize-wheels-up-observation.v1` — authority-none exact
   repository, branch, HEAD/base-ancestry, journal/projection, signer-binding,
   and other freshness observations required to decide whether the existing
   transition can be prepared. A0 accepts this as validated data and does not
   itself perform I/O or claim production provenance.
5. `mission.next-transition-selection.v1` — one ready selection or one stable
   first-match reason from the frozen table below.
6. `mission.fresh-authorize-wheels-up-candidate.v1` — exact intent/plan/evidence
   digests, selection, existing action input, adapter-fixed facts, intrinsic
   exclusions, and human decision projection.
7. `mission.preparation-receipt.v1` — content-addressed, authority-none proof of
   exact inputs, output, and observation digest; never an authorization receipt.

Every external value must be a plain, non-proxy, own-data-property object/array
with exact keys, bounded strings/arrays/bytes/depth, no accessors, symbols,
sparse arrays, duplicate values, unknown variants, or implicit coercion.
Canonical JSON and SHA-256 helpers are package-local, deterministic, and reject
hostile or non-canonicalizable values. Digests are lowercase hexadecimal over
the exact UTF-8 bytes defined by each contract and are recomputed before use.

Synthetic parent-review evidence/projections are permitted only when explicitly
marked `synthetic_test`; they are always `productionEligible: false` and cannot
be upgraded by caller fields. A0 validates closed review envelopes, projections,
identities, and digest linkage but never asserts that raw receipts prove Fury
attribution. In #270, Team System remains the sole production raw-receipt
verifier through `evaluateSeatDispatchAttributionV1`.

## Candidate compiler

For the only supported V1 transition, emit the existing 11-field
`authorize-wheels-up` input unchanged:

- `baseRevision`
- `modelId`
- `approvedRelativePaths`
- `approvedActionIds`
- `approvedEffectClasses`
- `approvedEffectKeys`
- `approvedCapabilities`
- `validationCommandIds`
- `reasoningRuntimeId`
- `toolExecutorId`
- `publicationPaths`

The adapter fixes `seatId: "may"`, the two initial-draft effects
`review.branch.push` and `review.pull_request.create_draft`, the applicable event
kinds, and the existing intrinsic exclusions. Intent input cannot select or
override these values. The candidate also carries only the concise deterministic
decision projection required for the later human display.

The candidate must not contain or create signatures, signed payloads, journal
entries, journal sequence mutations, timestamps, PIN/passcode bytes, human
decisions, authority verdicts, commands, or effects.

Preserve the current `localeCompare` ordering contract for
`approvedRelativePaths`, `approvedActionIds`, `approvedEffectClasses`,
`approvedEffectKeys`, `approvedCapabilities`, and `validationCommandIds`.
Use the explicit UTF-16 code-unit comparator (`left < right`, `left > right`)
only for `publicationPaths`. Do not globally replace either ordering rule.

## Stable first-match selection table

Evaluate in this exact order and return the first matching stable reason; do not
combine, reorder, or infer a fallback transition:

| Order | Condition | Result |
| --- | --- | --- |
| 1 | any contract shape, canonicalization, limit, or digest failure | `invalid_preparation_input` |
| 2 | repository, mission, parent-plan, transition-plan, or review identity mismatch | `reviewed_plan_mismatch` |
| 3 | review verdict is not PASS, attribution projection is not closed/eligible, or synthetic evidence is presented for production | `parent_plan_review_ineligible` |
| 4 | observation repository, branch, HEAD, or planning-base ancestry differs from reviewed intent | `repository_observation_stale` |
| 5 | journal/projection is not a fresh schema-9 state eligible for the initial Wheels Up transition | `fresh_wheels_up_state_ineligible` |
| 6 | signer binding or required host observation is missing, ambiguous, or mismatched | `freshness_evidence_incomplete` |
| 7 | intent requests any unsupported transition or conflicts with adapter-fixed facts | `unsupported_transition` |
| 8 | all checks pass | ready `authorize-wheels-up` selection and candidate |

All non-ready results return no candidate and no effectful instruction.

## Raw receipt-set digest confirmation gate

The proposed definition of `rawReceiptSetSha256` is SHA-256 over the exact
ordered concatenation of the UTF-8 receipt bytes supplied to Team System replay,
with no JSON reserialization, sorting, delimiter insertion, or normalization.
Fury must explicitly confirm this definition or replace it with one unambiguous
framing rule before implementation authority is requested. A0 stores and binds
the digest only; it does not consume raw receipts.

## Exact writable paths

Implementation authority, if later granted, is limited to:

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

This plan artifact is the only additional planning write:
`docs/missions/issue-269-mission-preparation-plan.md`.

Every other path is forbidden, including `nx.json`, any `project.json`, all
`packages/shield-team-system/**`, CLI/store/signer/journal code, GitHub-facing
code, and #270 artifacts.

## Required tests and acceptance

| ID | Required proof |
| --- | --- |
| A0-01 | all seven contracts accept exact fixtures and reject extra/missing/accessor/proxy/symbol/sparse/over-limit/duplicate hostile values |
| A0-02 | canonical JSON and digest vectors are stable across fresh processes; hostile objects and ambiguous values fail closed |
| A0-03 | exact parent/transition plan, review, intent, observation, selection, candidate, and receipt digests bind transitively; substitution at each edge fails |
| A0-04 | synthetic evidence is test-only and production-ineligible; A0 never claims raw Fury attribution |
| A0-05 | first-match table returns the exact stable reason for every row and no candidate for any non-ready result |
| A0-06 | ready output has exactly the existing 11-field action input plus the frozen authority-none metadata/projection; no authority/effect fields are invented |
| A0-07 | ordinary approved arrays retain `localeCompare`; mixed-case/non-ASCII publication paths retain explicit UTF-16 order |
| A0-08 | adapter-fixed May, initial-draft effects, event kinds, and exclusions cannot be caller-selected or overridden |
| A0-09 | no signatures, journal entries, timestamps, human decisions, PIN handling, I/O, network, CLI, store, hooks, or runtime dependencies exist |
| A0-10 | `npm pack` contains only the declared `dist` surface; an isolated offline install of that exact tarball imports `"."` and compiles a fixed candidate |
| A0-11 | source, declarations, package metadata, lockfile, packed bytes, and installed tree contain no dependency, path, or import to `@shield/team-system` |
| A0-12 | Nx infers the project and focused build/test targets without `nx.json` or `project.json` changes |

May must run and record, at minimum, the focused package build, all three exact
test files, `npm pack --dry-run`, exact tarball creation, isolated
`npm install --offline` of that tarball, installed-package import/use, package
content scans, and Nx project/target discovery. Mack independently reruns the
same exact-head lanes plus repository diff/path-scope and clean-worktree checks.
The implementation revision is not eligible for acceptance unless every lane
passes and evidence is bound to that exact revision.

## Sequencing and stop conditions

1. Fury reviews this exact committed plan and its raw-byte SHA-256. Fury review
   is technical evidence, not human authority.
2. Any Fury REVISE changes the plan, commit, and digest and requires a new exact
   Fury review.
3. After Fury PASS, Hill may prepare—but not invoke—the fresh schema-9
   mission/PIN gate for Coulson using the exact approved revision and paths.
4. No May implementation starts without recorded Coulson authority. May may
   modify only the exact writable paths and must stop on ambiguity, path drift,
   stale HEAD, scope expansion, or failed validation.
5. Mack validates May's exact clean HEAD independently. Fury then performs
   exact-revision conformance review. Publication requires its separate existing
   human gate and may create only the authorized initial draft; no merge,
   deployment, release, or ready-for-review transition is authorized here.
6. #270 starts only after #269 is accepted. #270 must freeze whether Team System
   bundles the exact `@shield/mission-preparation` dependency in its tarball or
   distributes and pins both artifacts. That packaging decision does not block
   #269 and must not be implemented in this slice.

## Fury review questions

1. PASS or REVISE the exact package, contract, candidate, ordering, reason-table,
   path, test, authority, and sequencing boundaries above.
2. Explicitly confirm or replace the proposed `rawReceiptSetSha256` byte framing.
3. Confirm that distribution is correctly deferred to predecessor-bound #270.
