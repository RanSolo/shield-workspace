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

### Doctor truth

Keep the existing doctor report version and check ordering. The existing
`bindings` check must report the selected repository trust profile and its
required cryptographic seats. For `coulson_only_platform_review`, it must state
that Fitz is GitHub-enforced external review, Simmons is conditional external
feedback, and neither is admitted as SHIELD evidence. Missing Coulson,
unsupported profiles, or Fitz/Simmons references under this profile fail
closed. Doctor remains read-only and performs no network request.

### Mission startup

Refactor repository binding selection to accept an exact required cryptographic
seat set rather than deriving Coulson/Fitz from `requireSimmons` globally.

- Profile-aware `standard@1` under `coulson_only_platform_review` selects and
  embeds only the exact Coulson trusted binding.
- `high_assurance@1` and `product_sensitive@1` retain their signed Fitz/Simmons
  requirements and therefore fail closed under the Coulson-only repository
  profile; they continue to work under `signed_human_gates` with matching
  bindings.
- Legacy supervised missions retain their existing Coulson/Fitz and optional
  Simmons binding requirements and cannot silently weaken under the new
  profile.
- Coulson-only signer setup, authorization, delegation, publication authority,
  Wheels Up, runtime binding, and final acceptance continue to use verified
  Coulson cryptography.

No username, GitHub review, Jira comment, issue status, branch-protection
observation, prompt text, or caller assertion may become a trusted binding or
signed human evidence through this change.

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

The mission brief and plan are immutable during implementation. Generated
declarations and build artifacts are validation output, not committed scope.

## Required tests

- schema-1 config remains valid, formats byte-stably, and doctors as legacy
  signed-human trust;
- schema-2 signed-human init preserves old CLI behavior and exact binding rules;
- explicit Coulson-only init succeeds without Fitz/Simmons flags and repeated
  identical init is a no-op;
- omitted profile keeps the signed-human default and still requires Fitz;
- Coulson-only rejects missing Coulson, Fitz/Simmons flags or refs,
  unsupported/hostile profile values, placeholders, and unknown fields;
- doctor reports each profile truthfully, performs no external lookup, and
  fails contradictory configuration;
- a profile-aware `standard@1` mission begins from config plus registry
  containing only Coulson and creates no Fitz/Simmons requirement or evidence;
- high-assurance and product-sensitive missions fail closed without their exact
  signed bindings and remain green with `signed_human_gates`;
- legacy supervised mission behavior remains unchanged;
- existing Coulson signer setup/authorization, Wheels Up, binding, publication,
  and final-acceptance paths remain green;
- existing draft-PR publication tests prove the workflow stops at platform
  review without merge or fabricated Fitz/Simmons evidence; and
- package surface/type-consumer tests remain green.

## Validation

Run sequentially without filtering failures:

```text
npm run build --workspace @shield/team-system
node --test packages/shield-team-system/tests/config.test.mjs packages/shield-team-system/tests/cli.test.mjs packages/shield-team-system/tests/mission-v2.test.mjs packages/shield-team-system/tests/supervised-cli.test.mjs
node --test --test-concurrency=1 packages/shield-team-system/tests/*.test.mjs
npm pack --workspace @shield/team-system --dry-run
git diff --check
```

## Stop conditions

Stop on any requirement for a GitHub/Jira ingestion adapter, external service
call, repository-specific Asmark data, fabricated Fitz/Simmons evidence,
weakening of signed high-assurance/product-sensitive profiles, automatic config
migration, merge/deploy/release effect, public API outside the frozen config and
binding-selection contracts, or a path outside the ten authorized files.

Stop after Mack validation, Fury exact-revision conformance review, and one
draft pull request awaiting ordinary platform review.
