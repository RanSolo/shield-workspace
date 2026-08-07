# Issue #236 — canonical publication-path ordering plan

## Frozen boundary

- Mission: `mission:issue-236`
- Repository: `RanSolo/shield-workspace`
- Base revision: `1acdc17715df0d9c11f4129fc55d4db3c2e91299`
- Mode: Delivery
- Human gates: Coulson authorizes; Fitz remains the human technical-review gate.

Correct the one-passcode `authorize-wheels-up` path-ordering collision found
during issues #211 and #212. Do not change authority classes, journal schemas,
signatures, effects, publication semantics, human gates, or any external system.

## Implementation

1. Define one locale-independent comparator for canonical repository-relative
   publication-path ordering in `mission-cli.mts`. It must compare JavaScript
   strings by deterministic UTF-16 code-unit order and must not depend on host
   locale.
2. Add a dedicated publication-path validator, or parameterize the existing
   helper explicitly, and apply the comparator only to `publicationPaths` and
   Git-observed changed, symlink, and gitlink path arrays used by the combined
   authorization flow. Preserve the existing `localeCompare` contract for
   `approvedRelativePaths`, all other `approved*` arrays, capabilities, and
   `validationCommandIds`; add a regression assertion proving those arrays did
   not silently adopt the publication-path comparator.
3. Preserve exact array equality after both sides use the same canonical
   ordering. Do not replace the exact closed-set check with set-only matching.
4. Add focused CLI tests proving a legitimate mixed uppercase/lowercase
   base-to-HEAD change set can be authorized and that unsorted, duplicate,
   missing, extra, malformed, symlink, and gitlink cases remain fail closed.
5. Cover non-ASCII ordering with deterministic inputs or reject unsupported
   path characters explicitly. In two fresh Node/CLI processes, construct from
   byte-equivalent controlled inputs with fixed timestamps, root, revisions,
   signer material, and starting journal bytes; assert identical manifest and
   receipt digests. Assert canonical order in the manifest changed/authorized
   paths and receipt authorized paths.

## Exact implementation scope

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `docs/missions/issue-236-canonical-path-order-brief.json` (immutable during implementation)
- `docs/missions/issue-236-canonical-path-order-plan.md` (immutable after Fury approval)

Only the two package paths are implementation-mutable.

## Required validation

- Focused supervised CLI tests pass.
- Full direct serial `@shield/team-system` tests pass.
- Package build and package dry-run pass.
- `git diff --check` passes.
- Mack validates the exact implementation revision and Fury performs
  exact-revision conformance review.

## Stop condition

Publish at most one bounded draft PR under separate exact publication authority.
Do not merge, deploy, release, amend #212, or resume #212 implementation until
this prerequisite is merged and #212 is reconciled against fresh main.
