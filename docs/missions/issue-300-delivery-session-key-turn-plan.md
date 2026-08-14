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

Do not reinterpret an existing `mission.transition-plan.v1` or a missing template as `standard`. Add a tagged backward-compatible transition-plan variant that binds the intake template through the transition-plan digest. Existing V1 plan and protected-graph bytes remain valid and continue through every current path.

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

Legacy plans remain eligible only when their mission journal already exists. A legacy plan plus a missing journal returns `mission_intake_template_required` without mutation.

## Host flow

Add one package-internal preparation facade used by `mission prepare-next`. Keep `resolvePreparedMissionTransitionV1` as the read/replay resolver used by post-sign freshness checks and existing executors.

The facade performs this order:

1. Call the existing resolver. Return every non-missing-journal result unchanged.
2. For a genuinely missing journal only, reread and validate the protected graph and raw Fury attribution.
3. Require the enriched fresh-Wheels-Up plan and validate the intake template and cross-bindings.
4. Read repository config and trusted binding registry; prove profile admission, participants, modes, and signer bindings through existing Team System functions.
5. Observe canonical root, configured remote repository identity, branch, base, HEAD, cleanliness, changed paths, symlinks, gitlinks, and reviewed scope before mutation. Any stale or ambiguous fact blocks.
6. Convert the reviewed template to `ProfileAwareMissionBriefContentV1`, reuse `profileAwareMissionIntakeV1`, and call `initializeProfileAwareMissionJournalV1` once.
7. If concurrent initialization reports `mission_exists`, never overwrite or repair. Reread and continue only through normal exact resolver semantics.
8. Invoke `resolvePreparedMissionTransitionV1` again from scratch. Return only its closed result.
9. The CLI then follows its current rendering/PIN/executor path. `executeAuthorizeWheelsUpV1` remains unchanged.

The initial journal entry's bytes, brief revision, requirements, and bindings come only from reviewed template content plus existing trusted binding derivation. A restart never regenerates `createdAt` or substitutes a new template.

## Exact file scope

Expected implementation paths:

- `docs/missions/issue-300-delivery-session-key-turn-plan.md`
- `packages/mission-preparation/src/contracts-v1.mts`
- `packages/mission-preparation/tests/contracts-v1.test.mjs`
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
3. `mission_intake_template_required` for a legacy graph with no journal;
4. invalid intake template or plan/template identity mismatch;
5. repository configuration, profile admission, participant, mode, or binding mismatch;
6. stale root/remote/branch/base/HEAD/worktree/path-kind/reviewed-scope observation;
7. initialization conflict or `recovery_required`.

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

- accessor, proxy, symbol, non-enumerable, duplicate, unsorted, oversized, or extra-field template data;
- template ID/digest tamper and plan/template/graph cross-substitution;
- profile, gates, risk, participant, activation, predecessor, objective, mission, and subject mismatch;
- Fury receipt replacement/reordering/truncation and reviewer identity drift;
- repository/config/remote/root/branch/base/HEAD/path/symlink/gitlink/dirty-worktree drift before initialization;
- signer binding/key rotation;
- cancellation, wrong PIN, signer failure, post-PIN drift, and process loss;
- exact and conflicting concurrent initialization;
- exact proposed-journal restart and malformed/partial/advanced conflicting journals;
- no duplicate signed authority on exact retry;
- unchanged behavior for legacy begin/authorize/authorize-wheels-up/bind/publication-authorize, existing-journal prepare-next, prepared publication, and prepared runtime binding.

## Exclusions

- No new authority class, session schema, operator command, passcode handling, journal storage transaction, or verbal authorization.
- No inference of profile, risk, participants, modes, gates, or runtime identity from prose or filenames.
- No runtime supersession, model invocation, specialist dispatch, wake-up relay, local packet generation, Mack aggregation, GitHub/Jira dependency, merge, deployment, release, ready-for-review, or final acceptance.
- No automatic repair or deletion of an existing journal.

## Human gate

Implementation begins only after Fury passes this exact plan revision and Coulson turns one Wheels Up key for the exact approved paths and effects. Same-scope corrections remain inside that Delivery Session.
