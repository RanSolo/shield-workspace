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

1. Add an exact native authorized issue-intake classifier beside the sequence-0 classifier. It matches only the closed two-entry lineage described above, including the exact Coulson requirement/evidence binding and complete absence of later authority/effects.
2. Reuse the existing single-handle, no-follow journal snapshot and immediate readback discipline. Journal identity, bytes, digest, sequence, projection, repository branch/HEAD, prepared-worktree receipt, configuration, binding registry, and issue observation must remain exact through output.
3. Reobserve the bound GitHub issue through the existing hermetic issue observer. Require exact repository/issue host IDs, issue URL/number, issue revision, updated time, and acceptance-criteria digest from the durable source binding. Missing, drifted, ambiguous, malformed, or unauthenticated issue evidence blocks without downstream preparation or mutation.
4. Return a closed authority-none planning packet:
   - `state: "planning_ready"`
   - `authority: "none"`
   - `owner: "hill"`
   - `commandId: "hill.plan.freeze"`
   - `humanGate: false`
   - `pinRequired: false`
   - mission, repository, branch, exact HEAD, subject, issue URL/revision, objective, ordered acceptance criteria, criteria digest, and risk flags
   - one directional instruction: freeze the smallest acceptance-driven plan against this exact packet, then route that plan through the existing Fury reviewed-transition path; do not infer implementation authority
5. Human output renders the same facts and explicitly says no PIN is required. It must not print a fake executable command. `--fury-model` is not required and must not dispatch Fury on this state because no plan exists yet.
6. Exact replay is byte-identical and performs no journal, graph, claim, dispatch, repository, or external communication effect beyond the bounded read-only GitHub observation.
7. Any valid non-applicable lineage continues into the existing native reviewed-transition resolver and guarded legacy fallback unchanged. A missing journal remains delegated to reviewed-v2 initialization. Existing sequence-0, advanced-native, protected-graph, and five-entry legacy behavior remain unchanged.

## Smallest path set

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `docs/missions/issue-374-native-authorized-next-plan.md`

No mission journal schema, source-binding schema, implementation authority, runtime binding, publication authority, or legacy compositor change is required.

## Validation

- Real issue-intake CLI flow: begin, authorize, then `prepare-next` returns the exact planning packet with ordered criteria and no Fury model.
- Exact replay preserves journal bytes and packet identity.
- Dependency-spy tests prove no protected graph, legacy continuation, Fury dispatch, claim, or mutation occurs.
- GitHub observation drift, criteria mismatch, repository/HEAD drift, journal replacement, malformed/tampered evidence, and advanced lineages fail closed or delegate only to their existing native successor.
- Existing sequence-0, absent-journal reviewed-v2, protected-graph, and eligible five-entry legacy tests pass unchanged.
- Update the package-surface assertion that currently requires every `prepare-next` path to remain graph-only; preserve that rule for all non-issue-intake planning states.
- Run Node 22.22.0, cache-enabled Nx build, focused/filtered Nx tests, and `git diff --check`; exclude `@shield/multiband`.

## Delivery sequence

Fury reviews this exact plan. After Fury PASS, Coulson grants bounded Wheels Up. May implements, Mack validates the exact revision, and Fury performs final conformance review. Publication, merge, deployment, release, and final acceptance remain separate decisions.
