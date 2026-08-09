# Hill Plan — Issue #251 Feature Flight Controller Slice 1

## Exact basis

- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-1`
- Base: `8aa12cb9d16171aa1b5289b75eb5e71128cac858`
- Initial planning commit: `d0c7fd0cad3a42a94729566c45bb3e5f2ff3018d`
- Initial plan SHA-256: `03a17e2f6a8d6512fe5eba21f02f3d3cc1c9bfc9cc7579554b732e4743d87011`
- Mission: `mission:issue-251-slice-1`
- Mission revision: `sha256:HivRohiNSFF5NQUFnicklVqT9eBHaG2OXvOTYyBytVU`

This revision supersedes the initial plan after Fury review. The exact revised
plan commit and file SHA-256 are supplied externally in the next Fury packet;
the file does not attempt a self-referential commit binding.

## Decision

Issue #251 becomes the canonical consolidation point for the Feature Flight
plan/state/status subset. Open PRs are untrusted parts inventory, not Git,
runtime, or review dependencies. The implementation re-reviews and adapts the
selected bytes as new code on current `main`.

The controller machine identity is `shield-feature-flight-controller`. It does
not replace, wrap, or reinterpret the existing certified compilation kernel
whose identity is `shield-helicarrier.v0`.

## Source inventory

| Source PR/head | Path | Git blob | File SHA-256 | Disposition |
| --- | --- | --- | --- | --- |
| #243 `bfbb65f2506a96d2583d5fe2c7dc93a9ae6fe5fc` | `packages/shield-team-system/scripts/operations/flight-common.mjs` | `b4e3f9a2db63c958abfe92fab4357b48dc044274` | `5a37694a3160377699b53561583723f130b1009fbbd55bef64be9d6a6a04d488` | Adapt its resolved-plan validator into the sole canonical contract owner. |
| #244 `22c3a46004de30805e4f723f099467c64f446d4d` | `packages/shield-team-system/scripts/operations/flight-state-init.mjs` | `1e793952d498b94cbe587fea29ec3ba0d3a93986` | `286717733c7c1593893d6aab19efb70381d2f8dd081adf67b9c7b5c8eae3623c` | Reuse only fixed state constants and genesis shape; state creation is deferred. |
| #244 `22c3a46004de30805e4f723f099467c64f446d4d` | `packages/shield-team-system/scripts/operations/hill-kernel.mjs` | `0454f474fc981604684993132795452f4fed161c` | `441c9efeaadc072f75a7aa0701937ca92748e47bb546912ab9ccb52f747a1394` | Adapt validation/projection into the sole controller; reject its authority-unlock behavior and output writer. |
| #244 `22c3a46004de30805e4f723f099467c64f446d4d` | `packages/shield-team-system/tests/operations-flight-control.test.mjs` | `b5be75343360dc27ba9df23eb7e9c9e50059a88c` | `b9066f56fc023f14331b03a568d867aedb12d595defabe3a3a86a392dba01894` | Use as adversarial inventory; write new tests against the consolidated boundary. |

No prior review or test result transfers to this implementation.

## Canonical ownership and supersession

| Concern | Canonical owner after this slice | Superseded overlapping inventory |
| --- | --- | --- |
| Resolved plan schema and validator | `flight-contracts.mjs` in #251 | PR #243 `flight-common.mjs` plan validation |
| State schema and validator | `flight-contracts.mjs` in #251 | PR #244 `flight-state-init.mjs` shape and `hill-kernel.mjs` state validation |
| Status projection and machine identity | `feature-flight-controller.mjs` in #251 | PR #244 `hill-kernel.mjs` routing report |
| CLI command | `shield-ops flight status` in #251 | PR #244 `flight route` command |
| Contract tests | #251 controller tests | Overlapping PR #244 control tests |

These superseded components must not later merge or cherry-pick unchanged.
Closing or rewriting the old PRs remains an external human action. PRs #245,
#246, and #250 remain inventory for later slices only.

## Slice objective

Add one effect-free `shield-ops flight status` command. It snapshots a prepared
resolved plan and current state once, validates exact bytes and one immediate
predecessor edge when supplied, and prints one non-authoritative status
projection to stdout.

It performs no state initialization or write, dispatch, model/seat invocation,
command execution, GitHub call, journal mutation, authority projection, merge,
deployment, release, or cleanup.

## Exact resolved-plan contract

The only accepted plan is closed `feature-flight-resolved-plan` schema version
1, preserving the selected #243 type/version exactly. Unknown, inherited,
accessor-backed, symbolic, sparse, or extra data fails closed.

- Top level: exactly `schemaVersion`, `planType`, `prototype`, `flightId`,
  `objective`, `repository`, `integration`, `lanes`, `missions`,
  `evaluationContract`; optional `sourceIssue` is the only optional key.
- Constants: `schemaVersion:1`, `planType:"feature-flight-resolved-plan"`;
  `prototype` is exactly `{name:"flight-prep", version:"1.0.0",
  authority:"none", notice:<fixed planning-only notice>}`.
- `repository`: exactly `root`, `remoteUrl`, `baseRef`, `baseRevision`,
  `inspectedHead`, `inspectedBranch`, `inspectedWorktreeClean`, `collisions`.
  Revisions are lowercase 40-hex Git commits; `inspectedHead` equals
  `baseRevision`; `collisions` is empty. Root and refs are structural
  declarations only and do not prove live repository identity.
- `integration`: exactly `branch` and `status`; status is
  `declared-not-created`.
- Each lane: exactly `id`, `chatLabel`, `teamLabel`.
- Each mission: exactly `id`, `slug`, `title`, `library`, `lane`, `branch`,
  `worktree`, `activationWave`, `dependsOn`, `writablePaths`, `scope`,
  `deliverables`, `dependencyLevel`, `initialEligibility`,
  `constructionStatus`, `authorityStatus`.
- Mission constants are `constructionStatus:"planned-not-created"` and
  `authorityStatus:"not-initialized"`. `dependencyLevel` is recomputed;
  `initialEligibility` is recomputed. Mission, slug, lane, branch, worktree,
  and writable-path identities are unique under exact and Unicode-default
  case-folded comparison.
- Dependencies reference known missions, are duplicate-free, exclude self,
  and form an acyclic graph. Plan array order is authoritative tie order.
- Writable paths use normalized `/`, reject absolute paths, `.`/`..`, empty
  components, control characters, BOM, backslash, traversal, and wildcards
  except a final ownership `/**`; ownership may not overlap across missions.
- `evaluationContract`: exactly `fixtureId`, positive integer `version`, and a
  duplicate-free nonempty `scorecard` string array.

## Exact state contract

The only accepted state is closed `non-authoritative-flight-state` schema
version 2, preserving the selected #244 type/version.

- Top level: exactly `schemaVersion`, `stateType`, `authority`, `notice`,
  `flightId`, `plan`, `sequence`, `predecessorSha256`, `repository`, `wave`,
  `lanes`, `missions`, `observedAt`, `tool`.
- Constants: `schemaVersion:2`, `stateType:"non-authoritative-flight-state"`,
  `authority:"none"`, and the fixed observed-coordination notice.
- Artifact identity is exactly `{path, bytes, sha256}` where bytes is a
  non-negative safe integer and SHA-256 is raw lowercase 64-hex.
- `plan` equals the exact supplied plan artifact identity. `flightId` equals
  the plan. `sequence` is a non-negative safe integer.
- Sequence 0 requires `predecessorSha256:null`, no predecessor CLI flags, and
  tool `{name:"flight-state-init",version:"1.0.0"}`. Sequence greater than 0
  requires raw lowercase predecessor SHA-256, both predecessor CLI flags, and
  tool `{name:"flight-state-successor-recorder",version:"1.0.0"}`.
- `repository` is exactly `root`, `baseRef`, `baseRevision`,
  `integrationBranch` and equals the plan declarations.
- `wave` is exactly `{current}` where current is null or a positive safe
  integer. It is recomputed from plan order, dependency status, and mission
  statuses; mismatch fails closed.
- `lanes` is an object with exact plan lane membership. Each value is exactly
  `{activeMissionId}`, but Slice 1 requires every value to be null because any
  active state is an unverified-authority global stop.
- `missions` is an object with exact plan mission membership. Each value is
  exactly `lane`, `activationWave`, `status`, `revision`, `authorityEvidence`.
  Lane/wave equal the plan and `authorityEvidence` is always null.
- Status is one of `planned`, `authorized`, `active`, `blocked`, `failed`,
  `complete`, `integrated`, `cancelled`, `superseded`. `planned`, `blocked`, and
  `failed` require revision null. Every other status requires lowercase 40-hex
  revision and triggers the global authority stop below.
- `observedAt` is a valid timestamp string. It is recorded data, not trusted
  freshness evidence.

## Input bytes, paths, and replay limits

- Plan, current state, and predecessor inputs are canonical absolute existing
  regular files. Symlink files, symlink/canonical-alias parents, missing files,
  and identity changes during snapshot fail closed.
- Decode exact bytes with fatal UTF-8. Reject malformed UTF-8 and a leading BOM.
- The caller independently supplies exact plan and state SHA-256 plus state
  sequence. Non-genesis calls also supply predecessor path and exact digest.
- A predecessor proves only that one supplied edge: same plan, flight,
  sequence-minus-one, exact predecessor digest, allowed structural transition,
  no revision clearing/substitution, and no wave regression.
- The result never proves complete history, earlier edges, globally latest
  state, live repository identity, or trusted lifecycle authority.

## Global stops and deterministic precedence

Validation errors throw in deterministic contract/plan/state/predecessor order
and emit no status document. After valid structural replay, apply exactly:

1. If current or predecessor contains `authorized`, `active`, `complete`,
   `integrated`, `cancelled`, or `superseded`, return global stop
   `authority-verification-required`.
2. Else if current contains `blocked` or `failed`, return global stop
   `operator-disposition-required`.
3. Else choose the first `planned` mission in the lowest recomputed current
   wave whose dependency list is empty. Its candidate action is
   `request-exact-child-authorization`.
4. If none exists, return global stop `no-structurally-eligible-candidate`.

Whenever a global stop exists, `nextCandidate` is null. The controller never
emits `dispatch_ready`, PASS, approval, acceptance, or verified authority.

## Exact status output

The output is closed schema version 1 with exactly:

- `schemaVersion:1`, `statusType:"shield-feature-flight-status"`;
- `authority:"none"`, `gateEligible:false`, fixed advisory `notice`;
- `controller:{id:"shield-feature-flight-controller",version:"1.0.0"}`;
- `freshness:{latestStateProven:false,completeHistoryProven:false,
  immediatePredecessorProven:<boolean>}`;
- `flightId`, `sequence`, `currentWave`;
- exact `plan`, `state`, and nullable `predecessor` artifact identities;
- nullable `globalStop:{code}` using only the three fixed codes above;
- nullable `nextCandidate:{missionId,lane,activationWave,
  action:"request-exact-child-authorization"}`;
- `missions` in plan order, each exactly `{id,lane,activationWave,status,
  revision,unmetDependencies,disposition}`.

Mission disposition is one of `candidate`, `waiting-for-dependencies`,
`authority-verification-required`, `operator-disposition-required`, or
`not-selected`. Dependency and error ordering follows plan array order, never
locale or object enumeration.

## CLI

Exact command:

```text
shield-ops flight status --plan FILE --expected-plan-sha256 SHA256 \
  --state FILE --expected-state-sha256 SHA256 --expected-state-sequence N \
  [--predecessor-state FILE --expected-predecessor-sha256 SHA256]
```

Every required flag appears exactly once with a nonempty value. The two
predecessor flags appear together only for non-genesis state. Duplicate,
missing, unknown, empty, non-integer, negative, extra positional, and
genesis-predecessor arguments fail before projection. JSON is printed only on
success; diagnostics go to stderr with nonzero exit.

## Files

- Add `packages/shield-team-system/scripts/operations/flight-contracts.mjs`.
- Add `packages/shield-team-system/scripts/operations/feature-flight-controller.mjs`.
- Update `packages/shield-team-system/scripts/operations/ops-cli.mjs`.
- Add `packages/shield-team-system/tests/operations-feature-flight-controller.test.mjs`.
- Update `packages/shield-team-system/tests/operations-cli.test.mjs`.
- Add mirrored `docs/operations/feature-flight-controller.md` and
  `packages/shield-team-system/docs/operations/feature-flight-controller.md`.
- Update `packages/shield-team-system/README.md` and
  `packages/shield-team-system/tests/package-surface.test.mjs`.
- Retain this mission plan.

## Tests and validation

- Valid genesis produces one exact candidate; plan order breaks ties.
- Every authority-derived status in current and predecessor globally stops;
  `nextCandidate` is null. Blocked/failed use the lower-precedence operator
  stop. No output contains `dispatch_ready`.
- Exact plan/state digest and sequence drift fail closed.
- Genesis predecessor flags fail. Non-genesis absence, digest mismatch,
  sequence discontinuity, cross-flight/plan replay, lifecycle regression,
  revision clearing/substitution, and wave regression fail closed.
- An internally valid immediate edge reports that earlier history is unproven.
- Unknown keys, sparse/accessor/inherited/symbolic data, identity membership
  drift, cycles, duplicate/case-folded identities, lane ambiguity, path overlap,
  traversal, BOM, control characters, backslash, symlinks, canonical aliases,
  malformed UTF-8, and path replacement during snapshot fail closed.
- CLI help and every argument error use the real operations CLI.
- Packed install includes the command and mirrored documentation.
- Run focused tests, package-surface/pack, full team-system, and Multiband.
- Mack validates and Fury reviews the exact implementation revision.

## Exclusions

- No state initializer, successor writer, `run --max-steps`, resume,
  execute-once claim, durable result, recovery mutation, or remote drift check.
- No model, seat, command, adapter, or GitHub invocation.
- No new authority, journal, or signed-evidence schema.
- No automatic merge, deployment, release, cleanup, or final acceptance.
- No merge, cherry-pick, or runtime dependency on PRs #243, #244, #245, #246,
  or #250.
