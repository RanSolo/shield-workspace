# Issue #276 — Nx improvement-intake design and dogfood

Status: planning and read-only dogfood only. No production code, plugins,
authority, merge, deploy, or release actions were performed.

## Exact revision and scope

- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-276-improvement-intake`
- Revision: `d3f29002fe6c249152763815a633132589b5a9b1`
- Worktree state: pre-existing tracked modifications in
  `.codex/agents/daisy.toml` and `.codex/agents/mack.toml`; preserved.
- Nx: `23.1.0`
- Collection command: `shield improve codebase --focus build,test,lint,boundaries --max-candidates 3`

The historical issue text was reconciled against `nx show projects --json` and
`nx show project <name> --json`. The resolved workspace has exactly three
projects: `@shield/mission-preparation`, `@shield/team-system`, and
`@shield/multiband`.

## Observed baseline

| Project | Kind | Root | Tags | Targets | Exports | Graph edges |
|---|---|---|---|---|---|---|
| `@shield/mission-preparation` | lib | `packages/mission-preparation` | `npm:public` | build, test, pretest, prepack | `.` | none |
| `@shield/team-system` | lib | `packages/shield-team-system` | `npm:public` | build, test, pretest, prepack | `.`, `./mission`, `./intake`, `./dispatch-receipts`, `./journal`, `./modes`, `./workspace`, `./hill-readiness`, `./config`, `./supervision`, `./delegation`, `./adapter`, `./runner`, `./permission`, `./schema9-permission-context`, `./governed-may-dispatch`, `./roles`, `./permission-audit`, `./review-publication`, `./pipeline`, `./mission-profile`, `./profile-aware-mission`, `./implementation-authority`, `./feature-operation`, `./feature-integration`, `./daisy-coordination-authority`, `./mission-runtime`, `./mission-builder`, `./sonarqube`, `./mack-validation`, `./qa-mode`, `./knowledge`, `./local-tools`, `./github` | `@shield/multiband → @shield/team-system` |
| `@shield/multiband` | app | `apps/multiband` | `npm:private` | build, test, pformat, dev, db:push, prebuild, format:write, format, start, lint | none | source above |

All resolved targets use `nx:run-script`; build and test are cache-enabled by
`nx.json`. There are no explicit typecheck targets. The package projects have
no lint targets. The app's `lint` target invokes `next lint`, so it is an app
focused target, not evidence for extracting a library. Package manifests show
the app consumes `@shield/team-system`; no package-manager dependency connects
the two libraries.

## Evidence collection and environmental separation

Read-only project/graph inspection succeeded with `npm exec -- nx`. Nx's normal
shared cache path resolved outside this worktree and failed with `EPERM` while
creating a lock/output file. The collector must classify this as
`environmental_failure`, retain the command and path, and retry only with an
explicit disposable cache directory. With `NX_WORKSPACE_DATA_DIRECTORY` and
`NX_CACHE_DIRECTORY` under `/private/tmp`, the following succeeded:

- `@shield/mission-preparation:build`, uncached: Nx critical path 455 ms.
- Same build after populating the disposable cache: 100% local cache hit,
  Nx run duration 5 ms (shell wall time 0.27 s).
- `@shield/mission-preparation:test`: 19 passed, 0 failed; Nx critical path
  864 ms. Its first attempt exposed an npm cache permission failure in the
  host cache; an isolated disposable npm cache made the same test pass.

The initial failures are not product failures. A collector records both the
failed and successful attempts, environment fingerprints only as normalized
categories, and never converts an environmental failure into a candidate.

`nx affected` with `HEAD..HEAD` is a valid empty-change negative observation;
the direct `--files` form is not accepted together with `--base`. The contract
therefore uses one explicit change selector per run and records the exact
selector rather than guessing affectedness.

## Collector artifact contract v1

The collector emits one JSON artifact at
`.shield/artifacts/improve-codebase-v1/<revision>/<digest>.json`. The digest is
SHA-256 over canonical UTF-8 JSON of the `body` member, using sorted object keys,
no insignificant whitespace, and UTF-16 code-unit key ordering. The outer
envelope contains `schemaVersion: "shield/improve-codebase/v1"`, the exact
`revision`, `cleanState`, `focus`, `maxCandidates`, `bodyDigest`, `body`, and
`collectionStatus`. A detached `.sha256` file is optional evidence, never a
substitute for recomputation.

The body is closed: `repository`, `revision`, `observedAtCategory` (duration
bucket only, no wall-clock timestamp), `projects`, `targets`, `graph`,
`dependencies`, `imports`, `exports`, `consumers`, `tests`, `fixtures`,
`size`, `churn`, `timings`, `environment`, `negativeControls`, and `candidates`.
Each evidence row carries `sourcePath` or command, normalized values, and an
`evidenceDigest`. Unknown, duplicate, conflicting, stale, partial, or
non-canonical rows make the artifact invalid. No caller-supplied candidate,
conclusion, absolute path, host path, timestamp, random value, network result,
or authority is accepted.

Collection is read-only: resolve projects through `nx show project --json`,
derive graph/affected data through Nx, inspect manifests/source/tests/Git
history, and run only bounded existing targets. It never installs plugins,
rewrites config, invokes generators, changes production sources, or creates a
SHIELD authority record. A failed optional probe is retained as an
environment/product classification; it is not silently omitted.

## Ranking semantics

Candidates are scored only from measured evidence. The deterministic score is
`0.30 targetGap + 0.25 boundarySignal + 0.20 validationSignal + 0.15
consumerSignal + 0.10 churnSignal`, each normalized to `[0,1]`. Risk and
uncertainty are reported separately and break ties before score. The collector
sorts by `riskOrder`, descending confidence, descending score, then canonical
project/path. It emits at most three candidates, and every candidate has
exactly one disposition: `Extract library`, `Add focused target`, `Split
internally`, `Leave in place`, or `Insufficient evidence`.

## Reusable Hill/Daisy prompt

```text
You are Hill/Daisy reviewing shield/improve-codebase/v1 artifact ${artifactDigest}
for revision ${revision}. Recompute and verify the artifact digest before using it.
Do not rediscover facts already present. If any envelope, row digest, clean-state
claim, or revision check fails, stop with Insufficient evidence.

Return at most three candidates in artifact order. Give each exactly one allowed
disposition: Extract library, Add focused target, Split internally, Leave in place,
or Insufficient evidence. Preserve dependency/risk order; identify easy wins
separately without promoting them. Include confidence, uncertainty, negative
controls, affected projects, acceptance criteria (one to three), bounded
validation commands, rollback, and a stop condition. Do not propose production
edits, plugin installation, authority, merge, deploy, or release. A focused target
is not a library extraction. Environmental failures remain environmental.
```

## Dogfood candidate matrix

| Rank | Candidate | Disposition | Confidence | Evidence / boundary | Validation and stop condition |
|---:|---|---|---|---|---|
| 1 | Add `lint` and `typecheck` focused targets to `@shield/team-system` | Add focused target | high | Public package has 34 export subpaths but only build/test; existing app dependency gives a consumer boundary; no evidence supports immediate extraction | ACs: target commands are explicit, cacheable, and do not change exports. Validate `nx show project`, uncached/cached target runs, and package tests. Stop if target ownership or toolchain is ambiguous. |
| 2 | Add a focused `typecheck` target to `@shield/mission-preparation` | Add focused target | medium-high | Small public package has build/test and package-boundary tests but no typecheck target; its existing compiler is a bounded signal | ACs: typecheck is read-only, cache inputs are declared, and failures separate from package-boundary failures. Validate target metadata and strict compile. Stop if it duplicates build without a distinct contract. |
| 3 | Separate cohesive internal domains inside `@shield/team-system` before any project extraction | Split internally | medium-low | Export surface is broad, but graph has no internal edges and import/fan-in evidence is incomplete; internal split is safer than a new package boundary | ACs: produce an import/consumer map first, no public export moves, and preserve package API. Validate map completeness and API snapshot. Stop and mark Insufficient evidence if consumers cannot be attributed. |

Negative control (not ranked): `@shield/multiband` is a known focused-target
case. Its `lint`/format/app lifecycle targets should remain app-owned; extracting
it as a library is explicitly rejected. It is not scored as a library candidate.

## Child issues, dependency order

1. **Collector schema and canonicalization v1** — implement the closed envelope,
   row digests, canonical JSON, clean/revision binding, and fail-closed parser.
2. **Nx/repository evidence probes** — implement project/target/graph/affected,
   import/export/consumer/test/fixture/size/churn and bounded timing probes;
   preserve environmental failures.
3. **Deterministic candidate selector** — implement scoring, risk order,
   uncertainty, five dispositions, and the max-three budget.
4. **Hill/Daisy artifact consumer prompt** — add digest verification, compact
   context consumption, AC/validation/rollback/stop-condition output.
5. **Read-only CLI integration** — wire `shield improve codebase` only after
   items 1–3 are reviewed; no authority or production mutation.
6. **Exact-revision validation fixtures** — Mack validates clean/dirty/stale/
   malformed/conflicting evidence, empty affected set, cache variation, and the
   multiband focused-target negative control.

Production target additions, internal splits, extraction, plugin installation,
and any authority-bearing operation require separate exact plans and gates.
