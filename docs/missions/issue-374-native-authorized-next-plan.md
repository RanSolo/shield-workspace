# Issue #374 — native authorized issue-intake `prepare-next`

## Exact planning context

- Repository: `RanSolo/shield-workspace`
- Planning base: `f01a43aab6a2a293ee10a9657cc33cbb29bba81f`
- Issue: `#374`
- Mission: `mission:issue-intake:XjoWAH9DGi0w2yX93T83ifac4cx_QO43s7QQS0VpUQY`
- Observed lineage: schema 9 entries `mission.begun` at sequence 0 and `governance.decided` at sequence 1; authorization `authorized`; execution `not-started`; no implementation, runtime-binding, publication, or effect state
- Authority: mission planning only; no implementation or publication authority

## Problem

After #372, sequence-0 issue intake correctly routes to Coulson authorization. Once that authorization is recorded, `mission prepare-next` treats the valid sequence-1 native journal as non-applicable, requests a Fury model, and falls into the five-entry legacy compositor, which rejects it as `unsupported_legacy_lineage`.

The sequence-1 journal does not contain enough evidence to invent approved implementation paths, effects, runtime identity, validation commands, or a Fury-ready transition plan. It does contain a durable issue source binding and acceptance-criteria digest. The smallest truthful successor is therefore a closed Hill planning packet, not fabricated implementation authority or a synthetic Fury review.

## Bounded design

1. Preserve sequence 0 as the only early issue-intake route. For every other state, call the existing reviewed-transition resolver first. Consider a sequence-1 planning packet only when that resolver returns `protected_evidence_mismatch` **and** the existing protected-graph absence preflight proves the graph root is absent. Valid or malformed protected graph evidence retains the existing resolver/preflight result and can never be shadowed by issue-intake planning.
2. After protected-graph absence is proven, apply an exact native authorized issue-intake classifier. It matches only the closed two-entry lineage described above, including the exact Coulson requirement/evidence binding and complete absence of later authority/effects. Any valid non-applicable lineage continues to the guarded legacy path unchanged.
3. Reuse the existing single-handle, no-follow journal snapshot and immediate readback discipline. Journal identity, bytes, digest, sequence, projection, repository branch/HEAD, prepared-worktree receipt, configuration, binding registry, issue observation, **and protected-graph absence** must remain exact through output. Immediately before output, rerun the existing graph-absence preflight. If the graph is no longer absent, suppress `planning_ready` and rerun or return the existing native resolver/protected-evidence result; never overwrite or reinterpret the concurrent graph.
4. Reobserve the bound GitHub issue through the existing hermetic issue observer. Require exact repository/issue host IDs, issue URL/number, issue revision, updated time, and acceptance-criteria digest from the durable source binding. Missing, drifted, ambiguous, malformed, or unauthenticated issue evidence blocks without downstream preparation or mutation.
5. Return a closed authority-none planning packet with exactly these top-level fields and origins:
   - `schemaVersion: 1`
   - `contractVersion: "mission.issue-intake-planning.v1"`
   - `state: "planning_ready"`
   - `authority: "none"`
   - `owner: "hill"`
   - `commandId: "hill.plan.freeze"`
   - `humanGate: false`
   - `pinRequired: false`
   - `missionId`, `repositoryId`, `branch`, `headRevision`, and `subjectId` from the exact journal/source binding after repository revalidation
   - `repositoryRoot` from the canonical host root
   - `issueUrl` and `issueRevisionId` from the exact matching source binding/observation
   - `objective` and closed `riskFlags` from the validated mission brief
   - ordered `acceptanceCriteria` and `criteriaDigest` from the exact matching issue observation/source binding
   - `instruction: "Freeze the smallest acceptance-driven implementation plan against this exact packet. The subsequent Fury and Wheels Up transition rail is unresolved; do not infer implementation scope, authority, runtime identity, or publication effects."`
6. Human output renders every field with equivalent meaning and explicitly says no PIN is required. It must not print a fake executable command. `--fury-model` is not required and must not dispatch Fury on this state because no plan exists yet.
7. Exact replay is byte-identical and performs no journal, graph, claim, dispatch, repository, or external communication effect beyond the bounded read-only GitHub observation.
8. This issue stops truthfully at the Hill planning packet. It does **not** claim the existing reviewed-transition/Fury/Wheels Up path can consume that packet or an already-authorized zero-publication lineage. That subsequent rail is separate bounded work discovered by this packet.
9. A missing journal remains delegated to reviewed-v2 initialization. Existing sequence-0, advanced-native, valid or malformed protected-graph, and five-entry legacy behavior remain unchanged.

## Smallest path set

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `docs/missions/issue-374-native-authorized-next-plan.md`

No mission journal schema, source-binding schema, implementation authority, runtime binding, publication authority, or legacy compositor change is required.

## Validation

- Real issue-intake CLI flow: begin, authorize, then `prepare-next` returns the exact planning packet with ordered criteria and no Fury model.
- Exact replay preserves journal bytes and packet identity.
- Dependency-spy tests prove the normal resolver runs first and graph absence is proven before the sequence-1 packet; then no legacy continuation, Fury dispatch, claim, graph write, or journal mutation occurs.
- A two-entry sequence-1 fixture with a valid protected graph proves the resolver wins and the planning packet is not emitted. Malformed protected evidence preserves the existing blocked result.
- A race fixture materializes or substitutes protected graph state between the first absence proof and final output; the packet is suppressed and the existing resolver/protected-evidence result wins without mutation by the planning path.
- GitHub observation drift, criteria mismatch, repository/HEAD drift, journal replacement, malformed/tampered evidence, and advanced lineages fail closed or delegate only to their existing native successor.
- Existing sequence-0, absent-journal reviewed-v2, protected-graph, and eligible five-entry legacy tests pass unchanged.
- Run Node 22.22.0, cache-enabled Nx build, focused/filtered Nx tests, and `git diff --check`; exclude `@shield/multiband`.

## Delivery sequence

Fury reviews this exact plan. After Fury PASS, Coulson grants bounded Wheels Up. May implements, Mack validates the exact revision, and Fury performs final conformance review. Publication, merge, deployment, release, and final acceptance remain separate decisions.
