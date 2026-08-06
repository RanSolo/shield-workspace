# Issue #216 — Coulson-only repository trust profile

## Mission binding

- Mission: `mission:issue-216-coulson-only-trust`
- Mission revision: `sha256:TlBM6kktTvl73qZbACfzwmXRlrbNo3DEFj4f0puFBeg`
- Subject: `github:RanSolo/shield-workspace/issue/216`
- Base: `81b4c393e1a5b98e78ee93e30b8867c7802c910a`
- Branch: `agent/issue-216-coulson-only-profile`
- Mode: Delivery

## Objective

Add one explicit, persisted repository trust profile that requires only a
Coulson SHIELD Ed25519 binding while declaring Fitz review and conditional
Simmons feedback as external platform surfaces. Preserve the existing
cryptographically signed human-gate configuration and all three mission
assurance profiles. Do not ingest, synthesize, translate, or satisfy GitHub or
Jira evidence in this issue.

The supported work flow must stop at an ordinary draft pull request awaiting
the repository's existing review and branch-protection policy.

## Frozen contract

### Repository trust profiles

Introduce a closed `repository.trust-profile.v1` registry with exactly two
profile IDs:

1. `signed_human_gates`
   - required SHIELD signing bindings: Coulson and Fitz;
   - optional Simmons binding remains available for product-sensitive missions;
   - preserves current initialization and mission behavior.
2. `coulson_only_platform_review`
   - required SHIELD signing binding: Coulson only;
   - Fitz source: `github_required_review_external`;
   - Simmons source: `conditional_external_feedback`;
   - external evidence admission: `not_admitted`.

The profile registry is immutable and descriptive. It creates no authority,
does not inspect GitHub or Jira, and cannot report an external gate satisfied.

### Configuration versioning

- Add configuration schema version 2 with required field
  `repositoryTrustProfileId`.
- Freeze the public version surface as:
  - `LEGACY_CONFIG_SCHEMA_VERSION = 1`;
  - `CONFIG_SCHEMA_VERSION = 2`, meaning the version produced by new config
    creation;
  - `SUPPORTED_CONFIG_SCHEMA_VERSIONS = [1, 2]`;
  - closed `ShieldConfigV1` and `ShieldConfigV2` types plus their
    `ShieldConfig` union.
- Continue to parse, format, and doctor valid schema-1 configurations as the
  legacy `signed_human_gates` profile without rewriting them.
- New initialization always writes schema 2 and an explicit profile.
- Existing `shield init` invocation without `--repository-trust-profile`
  defaults to `signed_human_gates` and still requires
  `--fitz-binding-ref`.
- `--repository-trust-profile coulson_only_platform_review` requires
  `--coulson-binding-ref` and rejects Fitz or Simmons binding flags.
- `signed_human_gates` requires Coulson and Fitz and retains optional Simmons.
- A Coulson-only config contains exactly one configured human binding reference;
  placeholder, unconfigured, or contradictory Fitz/Simmons references fail.

Do not infer the trust profile from omitted keys. The operator must select it
explicitly or accept the existing signed-human default.

An existing valid schema-1 config plus equivalent default signed-human init
arguments is an exact no-op: preserve its bytes and create nothing. Divergent
bindings fail without mutation. Selecting Coulson-only against schema 1 is an
unsupported migration and fails before any file is created. This issue adds no
automatic migration command or rewrite.

### Doctor truth

Keep the existing doctor report version and check ordering. The existing
`bindings` check must report the selected repository trust profile and its
required cryptographic seats. For `coulson_only_platform_review`, it must state
that Fitz is GitHub-enforced external review, Simmons is conditional external
feedback, and neither is admitted as SHIELD evidence. Missing Coulson,
unsupported profiles, or Fitz/Simmons references under this profile fail
closed. Doctor remains read-only and performs no network request.

Doctor must retain the raw parsed object and complete config-validation result
long enough to classify failures truthfully. Malformed JSON, unsupported schema,
and unknown unrelated top-level fields route to `config-schema`. Missing,
wrong-type, or unsupported `config.repositoryTrustProfileId`, plus
profile/binding cardinality, missing Coulson, and contradictory Fitz/Simmons
refs, route to `bindings` and take precedence over generic structural closure
classification for that field. Human and JSON output use stable, exact
messages; doctor must not replace the invalid candidate with `{}` and report a
secondary missing-field error.

### Mission startup

Replace the raw `requireSimmons` binding selector with one trusted derivation
function. Callers may supply the validated mission kind/profile context, never
an arbitrary seat list. The complete matrix is:

| repository config | mission admission | exact selected signing bindings |
| --- | --- | --- |
| schema 1 (implicit `signed_human_gates`) | legacy supervised, `requireSimmons=false` | Coulson + Fitz |
| schema 1 (implicit `signed_human_gates`) | legacy supervised, `requireSimmons=true` | Coulson + Fitz + Simmons |
| schema 2 `signed_human_gates` | legacy supervised, `requireSimmons=false` | Coulson + Fitz |
| schema 2 `signed_human_gates` | legacy supervised, `requireSimmons=true` | Coulson + Fitz + Simmons |
| schema 1 or schema 2 `signed_human_gates` | profile-aware `standard@1` | Coulson + Fitz |
| schema 1 or schema 2 `signed_human_gates` | profile-aware `high_assurance@1` | Coulson + Fitz |
| schema 1 or schema 2 `signed_human_gates` | profile-aware `product_sensitive@1` | Coulson + Fitz + Simmons |
| schema 2 `coulson_only_platform_review` | profile-aware `standard@1` | Coulson only |
| schema 2 `coulson_only_platform_review` | legacy, `high_assurance@1`, or `product_sensitive@1` | blocked before journal creation |

Profile-aware derivation occurs only after the brief passes the existing
canonical profile validator. A separate repository mission-admission check then
requires `requireSimmons` to be `true` exactly for
`product_sensitive@1` and `false` for `standard@1` and `high_assurance@1`;
contradiction is `repository_mission_profile_inconsistent` and cannot influence
binding selection or journal creation. This rule applies only to future CLI
admission: do not tighten the shared brief validator or reinterpret historical
schema-9 journals. The stable admission failure code for a mission/profile
unsupported by the repository trust profile is
`repository_trust_profile_incompatible`.

Coulson signer setup and delegation operations select exactly Coulson by a
fixed internal operation rule. They do not reuse the mission-admission matrix
or accept caller-provided seat sets.

Legacy supervised missions retain their existing Coulson/Fitz and optional
Simmons requirements and cannot silently weaken under the new profile.

- Coulson-only signer setup, authorization, delegation, publication authority,
  Wheels Up, runtime binding, and final acceptance continue to use verified
  Coulson cryptography.

No username, GitHub review, Jira comment, issue status, branch-protection
observation, prompt text, or caller assertion may become a trusted binding or
signed human evidence through this change.

### Replay boundary

The repository trust profile is CLI admission policy only; it is not added to
schema-9 journal entries and is not mission evidence. Sequence 0 freezes the
exact selected trusted bindings and canonical requirements. Later config or
repository-profile changes cannot reinterpret an existing journal. A blocked
admission writes no journal. Fitz/Simmons evidence has no matching requirement
in a Coulson-only `standard@1` journal and therefore cannot advance it. External
GitHub/Jira state is never represented as a requirement or evidence by this
issue.

## Exact implementation scope

May may modify only:

1. `packages/shield-team-system/src/config.mts`
2. `packages/shield-team-system/src/cli.mts`
3. `packages/shield-team-system/src/mission-v2.mts`
4. `packages/shield-team-system/src/mission-cli.mts`
5. `packages/shield-team-system/tests/config.test.mjs`
6. `packages/shield-team-system/tests/cli.test.mjs`
7. `packages/shield-team-system/tests/mission-v2.test.mjs`
8. `packages/shield-team-system/tests/supervised-cli.test.mjs`
9. `packages/shield-team-system/INSTALLATION.md`
10. `packages/shield-team-system/SUPERVISED_MISSION.md`
11. `packages/shield-team-system/tests/package-surface.test.mjs`
12. `packages/shield-team-system/PUBLIC_API.md`

The mission brief and plan are immutable during implementation. Generated
declarations and build artifacts are validation output, not committed scope.

## Required tests

- schema-1 config remains valid, formats byte-stably, and doctors as legacy
  signed-human trust;
- public runtime and TypeScript surfaces expose schema 2 as the creation
  version, schema 1 as the named legacy version, both supported versions, and
  the closed V1/V2 config union;
- schema-2 signed-human init preserves old CLI behavior and exact binding rules;
- explicit Coulson-only init succeeds without Fitz/Simmons flags and repeated
  identical init is a no-op;
- omitted profile keeps the signed-human default and still requires Fitz;
- Coulson-only rejects missing Coulson, Fitz/Simmons flags or refs,
  unsupported/hostile profile values, placeholders, and unknown fields;
- doctor reports each profile truthfully, performs no external lookup, and
  fails contradictory configuration with exact `bindings` classification;
- equivalent legacy re-init preserves bytes, while divergent legacy re-init and
  explicit Coulson-only migration fail before mutation;
- a profile-aware `standard@1` mission begins from config plus registry
  containing only Coulson and creates no Fitz/Simmons requirement or evidence;
- contradictory profile/`requireSimmons` briefs fail repository mission
  admission with `repository_mission_profile_inconsistent` before binding
  selection or journal creation, while historical replay remains unchanged;
- high-assurance and product-sensitive missions fail closed without their exact
  signed bindings, return `repository_trust_profile_incompatible` under the
  Coulson-only profile, create no journal, and remain green with
  `signed_human_gates`;
- legacy supervised mission behavior remains unchanged;
- schema-2 signed-human default initialization starts legacy supervised missions
  with the same Coulson/Fitz and optional Simmons binding sets as schema 1;
- later config/profile mutation does not alter replay of an existing journal,
  and unsolicited Fitz/Simmons evidence cannot satisfy a Coulson-only standard
  journal;
- existing Coulson signer setup/authorization, Wheels Up, binding, publication,
  and final-acceptance paths remain green;
- existing draft-PR publication tests prove the workflow stops at platform
  review without merge or fabricated Fitz/Simmons evidence; and
- package surface/type-consumer tests remain green.

## Validation

Run sequentially without filtering failures:

```text
npm run build --workspace @shield/team-system
node --test packages/shield-team-system/tests/config.test.mjs packages/shield-team-system/tests/cli.test.mjs packages/shield-team-system/tests/mission-v2.test.mjs packages/shield-team-system/tests/supervised-cli.test.mjs packages/shield-team-system/tests/package-surface.test.mjs
node --test --test-concurrency=1 packages/shield-team-system/tests/*.test.mjs
npm pack --workspace @shield/team-system --dry-run
git diff --check
```

## Stop conditions

Stop on any requirement for a GitHub/Jira ingestion adapter, external service
call, repository-specific Asmark data, fabricated Fitz/Simmons evidence,
weakening of signed high-assurance/product-sensitive profiles, automatic config
migration, merge/deploy/release effect, public API outside the frozen config and
binding-selection contracts, or a path outside the twelve authorized files.

Stop after Mack validation, Fury exact-revision conformance review, and one
draft pull request awaiting ordinary platform review.
