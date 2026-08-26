# Issue #411 — standing break-glass authorization binding

## Exact planning packet

- Issue: `#411`
- Repository: `RanSolo/shield-workspace`
- Planning base: `5a2ed45b29972e8098f375ede4eac309e5100668`
- Authority: `none`

## Smallest bounded correction

Add a repository-owned closed input/result that binds one repository-loaded,
signature-verified Coulson authorization contract to one bounded
implementation dispatch. The contract is versioned and includes the
authorization ID and digest, human principal/binding/signing-key identity,
decision, source kind, active validity/revocation state, and exact trusted
registry digest. Callers may provide only an ID/digest locator; caller fields
are never authoritative. The binding/result must include the exact mission,
subject, repository, branch, plan ID and digest, base and HEAD, approved
relative paths, approved action/effect/capability classes, May seat/model/
runtime/tool-executor identities, dispatch and receipt identities, action and
effect keys, validation-command IDs, and authorization-evidence digest. Derive
a content-addressed identity from this complete tuple; identical input is
deterministic, while any changed field fails stale or conflicting.

Validation and projection are read-only for every outcome, including initial
success: never append or rewrite canonical authority, mission journals,
dispatch receipts, locks, or preparation receipts. Any optional result is a
separate content-addressed artifact created atomically once. The adapter must
never fabricate a signature, journal entry, dispatch receipt, or canonical
authority.

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
