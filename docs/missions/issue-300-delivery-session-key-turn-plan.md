# Issue #300 — Turnkey fresh-mission Delivery Session key turn

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base and reviewed implementation parent: `6958dba9ed287069b286b9f0f01d889ff600938f`
- Parent issue: #268
- Child issue: #300
- Canonical command: `shield mission prepare-next --mission-id <id> --root <path>`

This plan incorporates Charlie Hill's exact-base SPLIT audit and Fury's architecture advisory. Fury rejected host-selected mission defaults because the existing reviewed graph does not bind profile, risk, participant, mode, or gate intent. The implementation therefore adds the smallest protected intake contract required to initialize a fresh proposed journal truthfully.

## Bounded outcome

Given exactly one fresh `fresh_authorize_wheels_up` reviewed transition whose protected graph contains a valid standard Delivery mission-intake template, `mission prepare-next` may:

1. verify the reviewed graph, Fury attribution, repository/configuration, signer binding, and live Git state;
2. create or reuse exactly the reviewed authority-neutral sequence-zero `mission.begun` journal;
3. resolve the existing fresh Wheels Up candidate again from durable state;
4. display the existing bounded human decision;
5. route one PIN through the unchanged `executeAuthorizeWheelsUpV1` four-entry atomic append.

Cancellation or signing failure may leave only the exact reviewed sequence-zero proposed journal. It creates no human evidence, implementation authority, runtime binding, publication authority, Git/GitHub effect, model invocation, or dispatch.

## Contract decision

### Reviewed intake template

Add `mission.profile-aware-intake-template.v1` as closed, ordinary, authority-none, content-addressed data in `@shield/mission-preparation`. Its body carries exactly the existing `ProfileAwareMissionBriefContentV1` fields, without `revisionId`:

- schema version, mission ID, objective, and subject ID;
- all nine risk flags;
- ordered participants and activated modes;
- `requireSimmons`;
- reviewed `createdAt`;
- profile ID/version;
- required execution and final-acceptance gate role IDs;
- predecessor mission ID and journal digest.

The package owns a structurally independent representation and validator; it does not import Team System. The template has its own `id` and `digest`. Team System converts the validated template into the existing profile-aware intake input and then relies on the existing Team System validators.

### Transition-plan compatibility

Do not reinterpret an existing `mission.transition-plan.v1` or a missing template as `standard`. Add the exact schema `mission.transition-plan.v2`, retaining the generic `transition-plan:` content-ID prefix. V2 contains every V1 body field plus exactly one `intakeTemplate` field containing the complete validated template object, not merely its ID/digest. V2 is eligible here only when `transitionKind` is `fresh_authorize_wheels_up`.

The intake template schema ID is exactly `mission.profile-aware-intake-template.v1` and its content-ID prefix is `profile-aware-intake-template:`. Register both schema IDs in the canonical registry. Define plan/compiler/protected-graph inputs as the explicit `TransitionPlanV1 | TransitionPlanV2` union. Existing V1 fields, bytes, IDs, digests, and behavior remain unchanged. Parent review and intent continue binding the exact plan ID/digest, so the embedded template bytes are covered by both plan and graph digests.

The enriched variant must preserve all current transition-plan fields and semantics. Its intake template must bind the same mission ID and subject ID. The fresh-journal route additionally requires:

- `standard@1`;
- `requireSimmons: false`;
- execution gates exactly `["coulson"]`;
- final acceptance exactly `["coulson"]`;
- unique canonical participants containing at least May and Coulson;
- one or more delivery-only activations whose seats are participants and supported by repository configuration;
- risk flags copied byte-for-byte from reviewed evidence, never inferred;
- objective equal to the reviewed bounded outcome;
- canonical predecessor identity accepted by the existing profile-aware validator.

Array rules are exact:

- participants contain 2–16 unique entries and are sorted by `seatId` with the repository UTF-16 code-unit comparator;
- activations contain 1–16 unique entries and are sorted by the tuple `modeId`, `modeVersion`, `seatId`, `activationSource` with that comparator;
- execution and final-acceptance gate arrays preserve canonical profile-defined order and reject duplicates;
- validators never sort caller data: unsorted or duplicate reviewed arrays are invalid.

Legacy plans remain eligible only when their mission journal already exists. A legacy plan plus a missing journal returns `mission_intake_template_required` without mutation.

## Host flow

Add one package-internal preparation facade used by `mission prepare-next`. Keep `resolvePreparedMissionTransitionV1` as the read/replay resolver used by post-sign freshness checks and existing executors.

Add a package-internal no-follow journal presence probe returning exactly `absent | present | unsafe_or_uncertain`. It accepts a journal path derived from a stable, validated repository-configuration snapshot and first proves lexical confinement beneath the configured journal root. It then walks the confined path component by component without following links. The first verified `ENOENT` anywhere in the confined journal-root suffix—including a missing journal root, missing intermediate directory, or missing final journal file—is `absent`. A symlink, non-directory intermediate component, non-regular final object, inaccessible component, path escape, unstable or replaced observation, or any other filesystem error is `unsafe_or_uncertain`. Never infer absence by matching resolver prose.

The facade performs this order:

1. Reread and validate the protected graph and raw Fury attribution.
2. Read one stable no-follow repository-configuration snapshot. Validate only repository identity, configured journal-root/path derivation, and confinement before probing. These failures precede all journal-presence and missing-template decisions; do not read or require the live trusted-binding registry yet.
3. Probe journal presence from that validated snapshot. `unsafe_or_uncertain` blocks.
4. For `present`, branch by reviewed graph version. A legacy V1 graph invokes the existing resolver unchanged and without a new live-registry prerequisite. An enriched V2 graph reads the trusted-binding registry, validates profile admission, participants, modes, and signer bindings through existing Team System functions, then performs exact reviewed-intake reconciliation before returning any resolver result.
5. For verified `absent`, a legacy V1 graph immediately returns `mission_intake_template_required` without reading the live registry. An enriched V2 graph validates the intake template and cross-bindings, then reads the registry and proves profile admission, participants, modes, and signer bindings.
6. Reuse exported `observePublicationRepositoryV1` for journal-independent Git observation. Validate canonical root, configured remote repository identity, branch, base, HEAD, cleanliness, changed paths, symlinks, gitlinks, and reviewed scope before mutation. Do not duplicate the private Wheels Up observer. Any stale or ambiguous fact blocks.
7. Convert the reviewed template to `ProfileAwareMissionBriefContentV1`, reuse `profileAwareMissionIntakeV1`, and call `initializeProfileAwareMissionJournalV1` once; that initializer may create the verified-missing confined journal-root suffix.
8. If concurrent initialization reports `mission_exists`, never overwrite or repair. Reread configuration and the journal through the same stable no-follow validation, then continue only after V2 registry validation and exact reviewed-intake reconciliation.
9. Invoke `resolvePreparedMissionTransitionV1` again from scratch. Return only its closed result.
10. The CLI then follows its current rendering/PIN/executor path. `executeAuthorizeWheelsUpV1` remains unchanged.

The initial journal entry's bytes, brief revision, requirements, and bindings come only from reviewed template content plus existing trusted binding derivation. A restart never regenerates `createdAt` or substitutes a new template.

For every enriched V2 graph—whether the journal was newly created, concurrently created, proposed, authorized, publication-ready, runtime-binding-ready, or already authorized—derive the expected sequence-zero entry from the reviewed template and current trusted-binding derivation before returning any resolver result. Compare complete brief content/revision, trusted bindings, generated requirements, sequence/type/entry identity/timestamp, and exact canonical first-line bytes. Binding and requirement comparisons include order and every field.

Any mismatch returns `mission_intake_mismatch`, preserves all bytes, and cannot produce `ready`, retry, publication, or runtime-binding results. V1 graphs with existing journals retain current behavior. V1 graphs with absent journals return `mission_intake_template_required`.

## Exact file scope

Expected implementation paths:

- `docs/missions/issue-300-delivery-session-key-turn-plan.md`
- `packages/mission-preparation/src/canonical-json-v1.mts`
- `packages/mission-preparation/src/contracts-v1.mts`
- `packages/mission-preparation/src/index.mts`
- `packages/mission-preparation/src/preparation-compiler-v1.mts`
- `packages/mission-preparation/tests/contracts-v1.test.mjs`
- `packages/mission-preparation/tests/package-boundary.test.mjs`
- `packages/mission-preparation/tests/preparation-compiler-v1.test.mjs`
- `packages/shield-team-system/src/mission-builder-v1.mts`
- `packages/shield-team-system/src/mission-preparation-store-v1.mts`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/mission-builder-v1.test.mjs`
- `packages/shield-team-system/tests/mission-preparation-store-v1.test.mjs`
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

`mission-store.mts`, the signer, authorization executor, runtime-binding executor, publication executor, Helicarrier, and GitHub adapters are reuse-only. Add another path only if a failing exact test proves the stated seam impossible; otherwise stop for Fury disposition.

## Rapid-strike implementation packets

### Packet 1 — reviewed intake and compatibility

- Add the closed intake template and enriched transition-plan variant.
- Extend Mission Builder and protected graph validation/materialization without changing existing V1 bytes.
- Prove canonical digest, hostile-data rejection, cross-binding, tamper rejection, and legacy compatibility.

### Packet 2 — fresh proposed-journal preparation

- Add the missing-journal preparation facade and strict eligibility checks.
- Reuse trusted binding derivation, profile-aware intake, existing durable initializer, and exact resolver.
- Prove no mutation for missing template, stale graph/receipt/config/repository/binding, or unsupported profile.

### Packet 3 — operator path and restart

- Route `prepare-next` through the facade.
- Prove fresh graph → one command → reviewed sequence zero → one decision/PIN → unchanged four-entry append → entries 0–4.
- Prove cancellation, wrong PIN, signing failure, concurrent initialization, process restart, exact replay, conflicting replay, and existing command compatibility.

These are packets under one Delivery Session, not separate missions or human gates.

## Failure precedence

Before proposed-journal creation:

1. malformed invocation or unsafe root;
2. missing/malformed/ambiguous protected graph or Fury attribution;
3. missing/malformed/unstable repository configuration, repository identity, or journal-path confinement;
4. unsafe or uncertain journal-path observation;
5. `mission_intake_template_required` for a legacy graph with a verified-absent journal;
6. for enriched V2 only, invalid intake template, plan/template identity mismatch, missing/malformed live registry, or profile/participant/mode/binding mismatch;
7. stale root/remote/branch/base/HEAD/worktree/path-kind/reviewed-scope observation;
8. initialization conflict, `mission_intake_mismatch`, or `recovery_required`.

After initialization, existing resolver and executor precedence remains authoritative. Do not mask an existing malformed or partially authorized journal as a fresh initialization opportunity.

## Required validation

- Nx build and focused tests for `@shield/mission-preparation`.
- Nx build and focused tests for `@shield/team-system` builder/store/host/CLI surfaces.
- Full `@shield/team-system` suite.
- Package-surface and declaration compatibility.
- `git diff --check`.
- Nx affected project selection from exact base to implementation HEAD; unrelated environmental failures must remain separately classified.

## Adversarial evidence

Tests must cover:

- accessor, proxy, symbol, non-enumerable, duplicate, unsorted, oversized, or extra-field template data, including exact array bounds/order;
- template ID/digest tamper, plan/template/graph cross-substitution, embedded-template plan/graph digest coverage, installed-consumer execution, and unchanged V1 vectors;
- profile, gates, risk, participant, activation, predecessor, objective, mission, and subject mismatch;
- Fury receipt replacement/reordering/truncation and reviewer identity drift;
- repository/config/remote/root/branch/base/HEAD/path/symlink/gitlink/dirty-worktree drift before initialization;
- an entirely missing configured journal root and a missing intermediate configured journal directory both initialize through the verified `absent` path, while symlinked, replaced, inaccessible, and non-directory components fail closed;
- signer binding/key rotation;
- cancellation, wrong PIN, signer failure, post-PIN drift, and process loss;
- exact and conflicting concurrent initialization;
- exact proposed-journal restart and malformed/partial/advanced conflicting journals;
- for enriched graphs, otherwise-valid journals differing only in risk, participant, mode, `createdAt`, profile, requirement, or any non-Coulson binding field;
- no duplicate signed authority on exact retry;
- present and absent legacy V1 graphs preserve their existing resolver or `mission_intake_template_required` result when the live trusted-binding registry is missing, malformed, or rotated;
- unchanged behavior for legacy begin/authorize/authorize-wheels-up/bind/publication-authorize, existing-journal prepare-next, prepared publication, and prepared runtime binding.

## Exclusions

- No new authority class, session schema, operator command, passcode handling, journal storage transaction, or verbal authorization.
- No inference of profile, risk, participants, modes, gates, or runtime identity from prose or filenames.
- No runtime supersession, model invocation, specialist dispatch, wake-up relay, local packet generation, Mack aggregation, GitHub/Jira dependency, merge, deployment, release, ready-for-review, or final acceptance.
- No automatic repair or deletion of an existing journal.

## Human gate

Implementation begins only after Fury passes this exact plan revision and Coulson turns one Wheels Up key for the exact approved paths and effects. Same-scope corrections remain inside that Delivery Session.
