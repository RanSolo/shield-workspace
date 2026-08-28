# Profile-aware source-binding recovery — bounded successor to #416

## Planning identity

- Repository: `RanSolo/shield-workspace`
- Mission: `mission:issue-intake:cZePw1cHKbJMdb0yI-K4XxpP0xNU0RwNnTRxBVqIrzQ`
- Successor branch: `agent/issue-416-recovery-successor`
- Reviewed plan parent commit: `92347d60f795a26581713abbbc15ae54c4196aa6`
- Reviewed plan parent raw SHA-256: `c89cefb8fb01bbd09bf1cad31ea3cf8a7123f610b0561879ecffb96acddc10d3`
- Successor implementation base: `6506edf72acd9c19c959744d5e7ea69e97c94771`
- Issue URL: `https://github.com/RanSolo/shield-workspace/issues/416`
- Issue revision: `sha256:KE89aNbkhxnh3flruAMge8jgbD2D-LSygQy8VS3UGPY`
- Acceptance-criteria digest: `sha256:f793f0ac6217b1f039fee9e1202fdebf9ef60c5bafcd84a81d86e0a77152dfc4`
- Planning source: `92347d60f795a26581713abbbc15ae54c4196aa6:docs/missions/issue-416-dispatcher-allowance-recovery-plan.md`
- Related repair: [Issue #416](https://github.com/RanSolo/shield-workspace/issues/416)
- Authority: `none`
- Owner: Hill planning; one future writer only

The four previously reviewed compatibility corrections remain required and
must be regression-validated on the successor: signed and verified
`transitionPlanId`/`transitionPlanDigest`; authenticated content-addressed
Issue-406 source identity; bounded parse/replay failure handling; and terminal
revalidation of canonical root, revision, tree, origin, clean status, and
authenticated snapshots. Any changed path outside the two-file implementation
four-path implementation allowlist is a fail-closed plan mismatch.

## Proven profile-aware recovery dead end

The exact authority-none sequence is now a closed recovery case, not an
ordinary retry: the original profile-aware intake journal was authorized at
its bound HEAD and receipt; the canonical worktree refresh then produced an
exact same-branch successor receipt; `prepare-next` returned
`source_binding_drifted`; and a fresh begin for the same issue/profile returned
`conflicting_replay` because the deterministic mission identity already
exists. The stale authorized journal must remain byte-for-byte evidence.

The implementation must provide one durable, exact-revision terminal recovery
contract for this tuple. It must read and authenticate the existing
profile-aware journal, Coulson evidence, repository/config/registry snapshots,
old and current prepared-worktree receipt identities, and the exact ordered
planning commit range. It must emit a closed `source_binding_recovery_required`
result containing the existing mission ID, stale source-binding identity,
current HEAD/receipt identity, recovery reason, and one next action; it must
not create a second mission ID, rewrite or invalidate the journal, repeat
intake, carry authorization forward, append authority, or invoke a provider.
Identical replay returns the byte-identical terminal result; any mismatch,
malformed input, branch drift, non-descendant, dirty tree, or snapshot drift
returns blocked with zero writes. A future supported rebind, if separately
authorized and implemented, must consume this terminal contract rather than
retrying intake blindly.

## Excluded inherited repair

The inherited dispatcher/W8 repair is a separate terminal-result contract and
is not part of this profile-aware recovery. Its historical W8 request,
evidence, receipt, denial, dispatcher allowance, and any #386/#406 fixture
remain preserved external evidence only; this plan neither reads, rewrites,
replays, authenticates, nor modifies them. No copilot dispatcher path is in
the implementation allowlist below.

## Smallest recovery repair

Implement one repository-owned, durable terminal recovery contract for the
proven `source_binding_drifted` then `conflicting_replay` sequence. It must
authenticate the existing profile-aware journal and Coulson evidence, the
stale source binding, current repository/config/registry snapshots, old and
current prepared-worktree receipt identities, and the exact ordered planning
commit range. It returns a closed
`source_binding_recovery_required` result with the existing mission ID,
stale/current identities, reason, and one next action. It never creates a
second mission, rewrites or invalidates the journal, retries intake, carries
authorization forward, appends authority, or invokes a provider.

Focused tests must prove byte-identical terminal replay; rejection of every
authenticated-binding mutation; branch, non-descendant, dirty, and snapshot
drift; unchanged journal bytes and identities; zero writes; no second mission;
no authority carry-forward; and preservation of all four prior invariants.

## Exact implementation scope

The future writer may change only these four paths:

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/src/profile-aware-mission-v1.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs`

The plan artifact itself is the only current change. This plan does not authorize implementation.

## Explicit exclusions

No changes to #416 implementation files, #386 or #406 evidence, receipts, journals, plans, or branches; no evidence rewrite, receipt replay, receipt re-emission, ledger append, authority creation, new tool policy, broad search-policy change, read/search descriptor changes, argument/path/EOF changes, prompts, new rail activation, GitHub mutation, publication, merge, deployment, release, or final acceptance. No human gate is requested by this authority-none plan.

## Validation and review

One future writer must bind the exact plan revision and the immutable predecessor tuple above. Required evidence is focused Node 22 testing, normal-cache Nx validation, `git diff --check`, clean exact scope, fresh Mack validation, and independent Fury conformance. Any successor must be append-only, single-consumer, replay-safe, and exact-revision bound.
