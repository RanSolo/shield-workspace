# Issue #411 — standing break-glass authorization binding

## Exact planning packet

- Issue: `#411`
- Repository: `RanSolo/shield-workspace`
- Planning base: `5a2ed45b29972e8098f375ede4eac309e5100668`
- Authority: `none`

## Smallest bounded correction

Add a repository-owned closed input/result that binds an explicit
standing/manual human authorization to one bounded implementation dispatch.
The binding must include the exact mission, plan identity, repository
revision, approved relative paths, approved action/effect/capability classes,
and exclusions. It must be authority-neutral and must never fabricate a
signature, journal entry, dispatch receipt, or canonical authority.

Reject missing, stale, conflicting, widened, malformed, or caller-only
authorization. Identical replay must be deterministic and must preserve all
journal, receipt, and authority bytes and filesystem identities with zero
effect on failure or replay.

Only the explicitly bounded implementation dispatch is admitted. Publication,
merge, deployment, release, final acceptance, credential/security expansion,
destructive effects, and material issue-scope expansion remain excluded.

## Approved implementation paths

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/review-publication-executor-v1.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

## Required focused coverage

- valid exact binding and bounded implementation projection;
- deterministic replay with byte/identity-preserved journals and receipts;
- zero-effect failure for missing, stale, conflicting, widened, malformed,
  and caller-only authorization;
- explicit rejection of publication, merge, deployment, release, final
  acceptance, credential/security expansion, destructive effects, and scope
  expansion.

No #408, #406, or #386 state is copied or modified. No implementation is
authorized by this planning artifact alone.
