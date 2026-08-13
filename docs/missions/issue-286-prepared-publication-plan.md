# Issue #286 — prepared review-publication key turn

## Exact mission identity

- Parent: GitHub issue `#268`
- Child: GitHub issue `#286`
- Repository: `RanSolo/shield-workspace`
- Planning base and exact plan revision before commit: `6b954a82bb53d44043c6d0b95c3e6891c516fc21`
- Mission: `mission:issue-286`
- Authority during planning: none

## Objective

Extend the merged #270 preparation path with the next meaningful phase for a
protected-graph schema-9 mission. After the initial Wheels Up delivery session
has advanced to a clean implementation HEAD, the same operator command derives
the existing `review.publish` authority input, presents one bounded publication
decision, accepts one PIN, and appends exactly one signed authorization.

Hill supplies only mission ID and repository root. No publication JSON, sorted
path list, effect list, journal sequence, authorization ID, or signer data is
caller-authored.

## Observed boundary

The missing `.shield/audit` result observed while dogfooding #270 is expected
for a legacy mission that predates the protected reviewed-transition graph. It
must remain a stable pre-PIN failure; this mission does not backfill history.

For a graph-backed mission, `resolvePreparedMissionTransitionV1` currently has
only two successful outcomes: initial Wheels Up readiness and exact initial
four-entry retry. Once implementation advances HEAD, the resolver returns an
authority conflict. Separately, `publication-authorize` already performs the
correct repository observation, review-publication evaluation, signing,
freshness recheck, and schema-9 append, but requires Hill to hand-author a JSON
input. A2 composes those existing seams without changing their authority
meaning.

## Frozen design

### 1. Host selection and derived publication intent

Extend the package-internal preparation host result with two closed outcomes:

- `publication_ready`: one exact derived publication intent plus the protected
  graph and live observation identities required to recheck it;
- `publication_already_authorized`: the one exact current semantic
  authorization identity and unchanged journal bytes.

Selection occurs only after all #270 protected-graph and raw Fury-attribution
checks pass. The current schema-9 projection must contain one valid initial
Wheels Up lineage: mission authorization, active implementation authority,
active May runtime binding, and its initial publication record. Duplicate,
partial, revoked, ambiguous, or structurally conflicting lineage fails before
rendering or PIN access. The mission must remain `execution === "not-started"`
because the existing profile-aware publication producer admits no other state.

Derive the publication intent as follows:

- `baseRevision`: the active implementation authority's approved base revision,
  equal to the protected transition plan's planning base;
- `authorizedPaths`: the live canonical base-to-current-HEAD changed-path set,
  sorted by the existing review-publication comparator;
- `permittedEffects`: exactly `review.branch.push` and
  `review.pull_request.create_draft`.

Every changed path must be a regular, non-symlink, non-gitlink path included in
the active implementation authority's approved relative paths and the protected
plan's approved relative paths. Containment is exact and segment-aware:
`path === approvedRoot || path.startsWith(approvedRoot + "/")`. The initial
Wheels Up HEAD must be a strict ancestor of the current HEAD. The worktree must
be clean; root, repository,
branch, base ancestry, mission revision, signer binding, journal sequence, and
current HEAD must be unambiguous. Empty change sets and paths outside either
scope fail closed.

Selector priority is closed: fresh initial Wheels Up, exact initial retry,
strict-descendant publication readiness, exact publication retry, otherwise
blocked. Legacy `publication-authorize --input` retains its existing capture
and presentation path and does not acquire a protected-graph requirement.

Do not require a caller assertion that implementation, Mack, or Fury is
complete. The publication PIN is the deliberate human phase boundary; technical
review remains a later independent gate. Do not infer authority from chat,
memory, or review prose.

### 2. One shared package-internal publication component

Create `review-publication-executor-v1.mts` as one package-internal component
with two explicit modes used by:

- legacy `mission publication-authorize --input ...`; and
- the `publication_ready` branch of `mission prepare-next`.

The component accepts a validated in-memory publication intent, mission/root,
the optional exact preparation observation, and four bounded dependencies:
decision renderer, passcode reader, signer, and journal append. Production uses
the existing implementations. Tests inject counters and faults.

The mode-specific preflight is closed:

- `legacy`: replay the schema-9 mission only and preserve the existing input
  shape, authorization-ID formula, `sourceRef`, stdout/stderr, success
  projection, and absence of a new decision display. It does not require or
  inspect a protected reviewed-transition graph.
- `prepared`: replay the schema-9 mission, protected graph, and raw Fury
  attribution; revalidate the exact prepared observation; and render the
  bounded decision before PIN access.

Prepared mode must:

1. replay the mission and protected graph;
2. observe repository identity and exact changed paths;
3. build and evaluate the existing `review-publication.v1` authority/proposal;
4. render the exact mission/revision, repository/branch/HEAD, paths, effects,
   exclusions, and remaining human gates.

Both modes then share repository evaluation, one PIN/signature, signer snapshot
comparison, post-sign freshness, producer invocation, and one-entry atomic CAS.
After signing, prepared mode rereads configuration, journal, protected graph, signer
identity, and repository observation. Any drift returns one stable failure and
appends nothing. Legacy mode preserves its existing freshness captures without
acquiring a graph requirement. The append dependency calls the existing
`appendProfileAwareMissionEntriesAtomicV1` with `entries: [publicationEntry]`
and the exact expected pre-signing journal SHA-256. That existing API locks,
rereads and compares exact bytes/digest, replays, atomically replaces, syncs,
and verifies readback. A same-sequence journal replacement therefore cannot
pass as fresh, and this slice adds no second append primitive. On success it uses the existing
`createProfileAwareReviewPublicationAuthorizationEntryV1` producer and atomic
append path. It performs no Git or GitHub effect.

Identity formulas remain closed. Both modes retain
`authorization:${missionId}:review-publish:${sequence}` as authorization ID and
authority reference. Legacy retains
`cli:publication-authorize:${sequence}` as `sourceRef`; prepared uses exactly
`cli:prepare-next:publication-authorize:${sequence}`.

`mission-cli.mts` becomes a thin adapter that parses either the legacy file or
the prepared host result, selects presentation mode, and delegates to this
component. It must not duplicate observation, authority construction, signing,
freshness, or append logic.

The direct JSON command retains its current contract and behavior. Prepared
publication adds `--human`/`--json` presentation through `prepare-next`; it does
not broaden `publication-authorize` inputs.

This component remains inside `@shield/team-system`: signer access, schema-9
journal replay/append, repository observation, and human rendering are host
responsibilities. `@shield/mission-preparation` remains authority-none and must
not depend back on Team System. Add a focused package script exposed as an
Nx-inferred target for the component tests. Treat an explicit internal Nx
project as the preferred future graph boundary once its inputs can be injected
without a Team System dependency cycle; do not expand this key-turn slice into
that extraction.

### 3. Narrow semantic retry

For this graph-backed prepared path only, compare the recomputed current
publication semantic tuple:

- authority kind and contract;
- mission, subject, and mission revision;
- repository, canonical root, branch, base, and HEAD;
- exact paths and effects.

If exactly one signed current record matches and no publication request has
consumed or conflicted with it, return
`publication_already_authorized`/`ALREADY AUTHORIZED — nothing repeated.` with
the existing authorization ID, digest, journal sequence, and unchanged bytes.
Do not prompt or append.

Zero matches selects a new decision. Multiple equivalent legacy records,
non-equivalent current records, ambiguous requests, or altered meaning fail
closed; general legacy duplicate recovery remains #279. A changed HEAD or path
set is not an unchanged retry.

## Acceptance mapping

### AC-1 — prepared transition selection

- Graph-backed initial delivery state with a new clean in-scope HEAD returns
  `publication_ready`.
- Missing graph, legacy mission, partial/duplicate/revoked lineage, stale raw
  Fury attribution, dirty worktree, empty diff, path-kind violation, scope
  escape, and root/branch/base/HEAD drift stop before renderer/PIN/sign/append.
- Initial Wheels Up and its exact retry remain byte-compatible.

### AC-2 — no caller JSON

- Real CLI fixture runs `mission prepare-next --mission-id ... --root ...`
  without `--input` and renders the exact derived publication decision.
- One PIN causes one signer call and one append of the existing schema-9
  publication entry; cancellation and every post-display drift class append
  nothing.
- Direct `publication-authorize --input` compatibility tests remain green.

### AC-3 — harmless retry

- Fresh-process unchanged retry returns the existing authorization identity,
  does not request a PIN, and preserves exact journal bytes.
- Changed HEAD/path/effect meaning cannot reuse the record.
- General duplicate legacy history stays blocked and explicitly routes to #279.

## TDD intent and rapid-strike packets

The merged `tdd.mission.v1` contract governs this implementation. Mack records
the executable checkpoint and expected failure class for each packet before May
changes production code. A prepared checkpoint is not PASS or implementation
authority. All packets remain inside this one mission and one Wheels Up phase;
packet completion advances directly to its legal successor without another PIN.

The reviewed packet contract is literal; Mack records observed evidence but may
not select or alter acceptance meaning, paths, interfaces, commands, or expected
failure after plan review.

```json
{
  "packetId": "packet:issue-286:p1",
  "criterionIds": ["AC-1"],
  "couplingRationale": null,
  "minimalPaths": [
    "packages/shield-team-system/src/mission-preparation-host-v1.mts",
    "packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs"
  ],
  "requiredInterfaces": [
    "live-git-observation",
    "protected-reviewed-transition-loader",
    "resolvePreparedMissionTransitionV1",
    "schema9-replay"
  ],
  "allowedEffects": ["filesystem.read", "filesystem.write", "process.execute"],
  "focusedValidation": [
    {"checkpointId":"checkpoint:issue-286:p1:build","commandId":"nx:team-system:build","command":"npm exec nx run @shield/team-system:build","executableKind":"build"},
    {"checkpointId":"checkpoint:issue-286:p1:test","commandId":"node:test:mission-preparation-host","command":"node --test packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs","executableKind":"test"}
  ],
  "expectedOutput": "Deterministic publication_ready selection plus closed pre-PIN failure precedence.",
  "stopConditions": ["authority-meaning-change", "graph-api-contradiction", "packet-scope-exceeded"],
  "successor": "packet:issue-286:p2"
}
```

P1 pre-implementation state evidence records expected failure classification
`missing_behavior`: strict-descendant publication selection is absent.

```json
{
  "packetId": "packet:issue-286:p2",
  "criterionIds": ["AC-2"],
  "couplingRationale": null,
  "minimalPaths": [
    "packages/shield-team-system/package.json",
    "packages/shield-team-system/src/mission-cli.mts",
    "packages/shield-team-system/src/review-publication-executor-v1.mts",
    "packages/shield-team-system/tests/review-publication-executor-v1.test.mjs",
    "packages/shield-team-system/tests/supervised-cli.test.mjs"
  ],
  "requiredInterfaces": [
    "appendProfileAwareMissionEntriesAtomicV1",
    "legacy-publication-cli",
    "prepared-host-result",
    "profile-aware-publication-producer",
    "review-publication.v1"
  ],
  "allowedEffects": ["filesystem.read", "filesystem.write", "process.execute", "test-fixture.sign", "test-fixture.journal-append"],
  "focusedValidation": [
    {"checkpointId":"checkpoint:issue-286:p2:build","commandId":"nx:team-system:build","command":"npm exec nx run @shield/team-system:build","executableKind":"build"},
    {"checkpointId":"checkpoint:issue-286:p2:test-cli","commandId":"node:test:supervised-cli","command":"node --test packages/shield-team-system/tests/supervised-cli.test.mjs","executableKind":"test"},
    {"checkpointId":"checkpoint:issue-286:p2:test-executor","commandId":"node:test:review-publication-executor","command":"node --test packages/shield-team-system/tests/review-publication-executor-v1.test.mjs","executableKind":"test"}
  ],
  "expectedOutput": "One prepared PIN, one signer call, and one existing schema-9 append while legacy output remains byte-compatible.",
  "stopConditions": ["external-publication-effect-required", "legacy-identity-or-output-drift", "new-append-primitive-required"],
  "successor": "packet:issue-286:p3"
}
```

P2 pre-implementation state evidence records expected failure classification
`missing_behavior`: caller-free prepared publication and its shared one-entry
CAS executor are absent.

```json
{
  "packetId": "packet:issue-286:p3",
  "criterionIds": ["AC-3"],
  "couplingRationale": null,
  "minimalPaths": [
    "packages/shield-team-system/src/mission-cli.mts",
    "packages/shield-team-system/src/mission-preparation-host-v1.mts",
    "packages/shield-team-system/src/review-publication-executor-v1.mts",
    "packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs",
    "packages/shield-team-system/tests/review-publication-executor-v1.test.mjs",
    "packages/shield-team-system/tests/supervised-cli.test.mjs"
  ],
  "requiredInterfaces": ["prepared-cli-projection", "prepared-semantic-tuple-projector", "schema9-replay"],
  "allowedEffects": ["filesystem.read", "filesystem.write", "process.execute"],
  "focusedValidation": [
    {"checkpointId":"checkpoint:issue-286:p3:build","commandId":"nx:team-system:build","command":"npm exec nx run @shield/team-system:build","executableKind":"build"},
    {"checkpointId":"checkpoint:issue-286:p3:test-cli","commandId":"node:test:supervised-cli","command":"node --test packages/shield-team-system/tests/supervised-cli.test.mjs","executableKind":"test"},
    {"checkpointId":"checkpoint:issue-286:p3:test-executor","commandId":"node:test:review-publication-executor","command":"node --test packages/shield-team-system/tests/review-publication-executor-v1.test.mjs","executableKind":"test"},
    {"checkpointId":"checkpoint:issue-286:p3:test-host","commandId":"node:test:mission-preparation-host","command":"node --test packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs","executableKind":"test"}
  ],
  "expectedOutput": "ALREADY AUTHORIZED — nothing repeated. Journal bytes remain identical and changed semantics are rejected.",
  "stopConditions": ["duplicate-legacy-authority-selection-required", "historical-journal-rewrite-required"],
  "successor": "mack_validation_complete"
}
```

P3 pre-implementation state evidence records expected failure classification
`missing_behavior`: unchanged restart retry does not project the existing
authorization.

Each packet binds criterion, plan digest, checkpoint, permitted paths, May
revision, focused Mack evidence, and Fury disposition. Any expectation change
returns to the merged amendment gate instead of weakening a test. Fury may
challenge packet coupling before Wheels Up; four or more criteria require the
explicit packet-size exception rather than an invented split.

## Writable paths

- `docs/missions/issue-286-prepared-publication-plan.md`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/review-publication-executor-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- `packages/shield-team-system/tests/review-publication-executor-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

## Validation

- Focused host, component, and real-CLI tests for AC-1 through AC-3 through the
  package's Nx-inferred focused target.
- Existing #270 preparation, executor, profile-aware mission, publication,
  mission-store CAS, and
  supervised CLI suites.
- `@shield/team-system` build and test through Nx.
- Exact-base/head `nx affected -t build,test` with required repository
  environment and serialized execution if generated-output ownership overlaps.
- Package-surface strict consumer and `git diff --check`.
- Mack validates the exact implementation revision; Fury reviews the complete
  base-to-HEAD result.

## Proving flight

Use a disposable graph-backed schema-9 fixture with a real protected reviewed
transition. Activate its initial Delivery Session through #270 `prepare-next`,
advance only approved files to a clean committed HEAD, then invoke
`prepare-next` again. Prove exact derived publication display, one PIN, one
append, restart-safe unchanged retry, no external effect, and byte-identical
journal preservation on retry.

The live #286 mission should dogfood the merged #270 path after this exact plan
receives durable Fury review. Failure to materialize genuine Fury dispatch
evidence remains a host-integration blocker and must not be replaced with a
caller-authored PASS.

## Exclusions

- No legacy graph backfill or audit repair.
- No automatic publication request, push, PR creation, lane wake-up, runtime
  switch, model invocation, Mack aggregation, merge, deployment, release,
  ready-for-review transition, or final acceptance.
- No new authority class, public Mission Preparation expansion, internal Nx
  project extraction, passcode
  storage/transmission, verbal authorization, or fabricated human/Fury/Mack
  evidence.
- No general recovery of #278-style duplicate publication authority; #279 owns
  that broader contract.
