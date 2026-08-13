# Issue #275 — Nx extraction-generator design report

Status: design spike complete; no production extraction performed.

Evidence revision: `d3f29002fe6c249152763815a633132589b5a9b1`  
Repository: `RanSolo/shield-workspace`  
Branch: `agent/issue-275-nx-extraction-spike`  
Mission: `.shield/tmp/issue-275-terminal-hill.md`

## Decision

Adopt a repository-local, authority-none `@shield/nx-extraction` generator for
future production work. V1 uses only public, explicitly pinned
`@nx/devkit@23.1.0` APIs. It does not compose `@nx/js` or `@nx/plugin`, and
neither is installed in the primary checkout.

The generic generator is insufficient as the public contract: Nx 23.1.0
reports that `@nx/js:library` does not support `--dry-run`; its source performs
workspace initialization, project configuration, optional lint/test setup,
package changes, and an install task. `@nx/plugin` is also the wrong semantic
level: its initialization composes the JS library generator and adds plugin
runtime dependencies and plugin assets. SHIELD needs a closed extraction
manifest, compatibility checks, authority checks, and a no-production-touch
mode before any generic generator runs.

## Baseline at the evidence revision

- Declared Nx version: `23.1.0`.
- Declared workspace projects: `apps/*` and `packages/*`.
- Fresh exact-revision disposable install (`npm ci` from the lockfile) found
  three Nx projects: `@shield/mission-preparation`, `@shield/team-system`, and
  `@shield/multiband`. The graph has one static edge:
  Multiband → Team System; the other two projects have no Nx dependencies.
- Team System has build and test scripts but no lint script.
- Team System source/scripts/tests contain about 92,957 counted lines; this is
  context only and was not used as a selection criterion.
- Primary checkout had no installed `node_modules`; only `nx` is present in
  `package.json`/lockfile. `@nx/js` and `@nx/plugin` are not primary-checkout
  dependencies.
- Team System exposes many stable subpath exports, including `journal`,
  `dispatch-receipts`, `runner`, `permission`, `supervision`, and
  `mission-runtime`, but source coupling remains substantial.

## Ranked disposition matrix

| Candidate | Disposition | Evidence and boundary rule | Initial build mode |
| --- | --- | --- | --- |
| Mission journal and replay contracts | Library, rank 1 | Stable journal/replay API; persistence and replay tests can be isolated; first extraction candidate after a dependency inventory proves no authority imports. | Buildable with `tsc`; publish only after compatibility tests pass. |
| Dispatch receipt/store contracts | Library, rank 2 | Named public export and cohesive receipt/store pair; ownership is meaningful, but store dependencies and receipt projections must be explicitly allowed. | Buildable if the manifest closes persistence dependencies; otherwise focused target first. |
| Runner/permission/runtime contracts | Focused target, rank 3 | High fan-in and authority-sensitive coupling across runner, permissions, mission runtime, and execution effects. Splitting now risks artificial graph edges and authority drift. | Existing Team System build/test plus focused target. |
| Mission preparation/evidence construction | Focused target, rank 4 | Cohesive contract surface, but current preparation/runtime and evidence consumers need a compatibility seam before ownership can move. | Non-publishable focused target initially. |
| Local-model adapter and May/Mack execution surfaces | Leave in place, rank 5 | Seat semantics, runtime identity, and authority boundaries are governed surfaces; extraction cannot be justified until an explicit ownership contract exists. | Existing targets only. |
| Feature Flight operations | Focused target, negative control | Prior issue evidence says this is a target, not a library; operations are tightly coupled and a library would create an artificial boundary. | Focused target; no extraction. |

Selection is based on API cohesion, fan-in/fan-out, ownership, test isolation,
compatibility, and authority risk. File size is not a selection rule.

## Frozen local generator contract

Generator name: `@shield/nx-extraction:library`  
Authority: `none`  
Contract identifier: `shield-nx-extraction/v1`  
Operation: `plan | apply | rollback` (there is no `dryRun` input)

Closed inputs:

- `expectedRepositoryRevision`, `capabilityName`, `description`, `ownerId`,
  sorted `sourceFiles`, sorted `exports`, sorted typed `dependencies`, and
  `executionClass` are required for every operation.
- `manifestPath` and `manifestDigest` are required only for `apply` and
  `rollback`.
- Unknown, duplicate, ambiguous, absolute, traversal, symlink, and
  case-colliding inputs fail.
- `executionClass` must equal `synthetic`; V1 accepts only buildable
  npm-workspace libraries. A non-buildable candidate returns
  `out_of_contract` and causes no generated target or mutation.
- Derived values cannot be overridden: `projectName=@shield/<capabilityName>`,
  `root=packages/<capabilityName>`, `buildable=true`, `authority=none`, and
  tags `scope:shield`, `type:library`, `owner:<ownerId>`, `authority:none`.
  `ownerId` is checked-in ownership metadata, never a seat, executor,
  approver, or authority identity.
- `compatibilityPackage`, Team System re-exports, transitional dependencies,
  and public API moves are future-production concepts and are rejected by V1.

Deterministic manifest and naming:

1. Normalize and sort every path, export, dependency, and tag.
2. Reject paths outside the declared source boundary, symlinks, generated
   authority files, and files not present at the pinned revision.
3. Emit a canonical UTF-8 JSON manifest before writing. Hash the canonical
   manifest body excluding `manifestDigest`, then place that SHA-256 in the
   outer envelope. The manifest includes
   every created, updated, deleted, dependency, and configuration mutation,
   each pre/post image hash, exact Git SHA, toolchain/project/target/edge
   baseline digest, normalized inputs, and a SHA-256 digest. No timestamps,
   random IDs, host paths, or environment-dependent values are allowed.
4. `plan` produces only the manifest and never calls an install task.

Generated shape and constraints:

- `packages/<name>/package.json`, `project.json`, `src/index.mts`,
  `tests/`, `tsconfig.build.json`, and `README.md` are the only default files.
- Package name is `@shield/<name>`; exports are explicit and point only to
  generated `dist` artifacts. Compatibility re-exports are future-production
  work and are not generated by V1.
- Tags are derived as `scope:shield`, `type:library`, `owner:<ownerId>`, and
  `authority:none`; authority-bearing tags are rejected.
- Dependencies are allowlisted by the manifest. V1 does not permit a Team
  System transitional dependency, app dependency, or seat executor surface.
- Workspace linking uses the existing npm workspace globs and package names;
  `plan` never updates a lockfile; fixture-only `apply` records exact lockfile
  impact and restores it transactionally.

Build and target rules:

- Buildable is allowed only when the manifest has a closed dependency graph,
  explicit package exports, declaration output, and an explicit
  manifest/export-conformance test.
- An ineligible candidate returns a fail-closed `out_of_contract` result; V1
  generates no focused target and performs no mutation.
- Build, test, and lint are cacheable with declared inputs and outputs. Build
  outputs are limited to the package `dist`; test/lint outputs are empty unless
  the runner explicitly creates a report.
- `graph` runs project discovery and dependency graph assertions.
- `affected` runs the relevant target against the configured base revision.
- No generated target may use an open-ended shell command or mutate authority,
  seat identity, dispatch policy, schemas, or public exports implicitly.

Safety, compatibility, and rollback:

- Before `apply`, validate exact revision, clean target paths, package-name
  uniqueness, export compatibility, dependency allowlist, and authority-none
  markers. Persist and fsync a canonical recovery journal before mutation and
  record progress before and after every write. A valid unfinished journal
  with a matching manifest digest triggers internal compensation under the
  lock; a stale, mismatched, or invalid journal returns `recovery_required`
  with zero mutation. Partial/divergent state without a valid matching journal
  also returns `recovery_required` with zero mutation.
- The plan operation performs no Tree/filesystem mutation and never invokes
  package managers, formatters, subprocesses, nested generators, or install
  callbacks. The implementation may use public, exactly pinned
  `@nx/devkit@23.1.0` APIs only; it must not depend on Nx private internals or
  silently rely on absent `@nx/js`/`@nx/plugin` packages.
- Apply accepts only the reviewed manifest, recomputes revision, graph,
  toolchain, inputs, and preimages, and produces zero mutation on mismatch.
  Exact replay is `already_applied` only when every postimage matches; partial
  or divergent state is `recovery_required`. Rollback requires matching
  postimages and applies the inverse manifest only.
- No production extraction, import rewrite, public API removal, schema
  migration, package installation, merge, deploy, or release is permitted by
  this generator.

## Disposable proof

Fixture: `/private/tmp/shield-275-nx-fixture` (outside the primary checkout).
The conformance fixture now installs exactly `nx@23.1.0` and
`@nx/devkit@23.1.0`; its lockfile contains no `@nx/js`, `@nx/plugin`, or
private Nx import path. Generic-generator source reconnaissance was performed
in a separate disposable installation and is not used as conformance proof.

Observed proof:

- Nx local version: `23.1.0`.
- The conformance fixture’s Nx dependencies are exact, non-range `nx@23.1.0`
  and `@nx/devkit@23.1.0`; its TypeScript toolchain is exact
  `typescript@5.4.5` and `@types/node@20.12.12`. `npm ls` and lockfile
  inspection found no `@nx/js` or `@nx/plugin` entries.
- After clean `npm ci`, the fixture links `@shield/synthetic-generated`
  successfully. Its canonical non-node_modules tree digest is
  `da5bc9a8a0fafb422ff36f7259791647e9d7b297473b82530cae30ffc3c99a32`, and
  its lockfile digest is
  `70a78b81c2c64138ec5cdbcd9f6689f7fc36c1fc555858c28bdeacfd7f511973`.
- The tree digest is reproducible with this exact algorithm from the fixture
  root: enumerate regular files with `find`, excluding `.git`, `node_modules`,
  and `.nx`; sort paths with `LC_ALL=C`; emit one line per file as
  `<path>  <sha256(file)>` using the path exactly as emitted (including `./`);
  hash that UTF-8 byte stream with SHA-256. Generated `dist` files are
  included; only the named volatile/control directories are excluded.
- Direct Node package import succeeded, and a strict TypeScript consumer
  compiled successfully against the declared `dist` exports and declarations.
- Project discovery found `@shield/synthetic-generated` and the original
  synthetic package.
- `nx show project` showed explicit build, test, and lint targets; required
  project tags were `scope:shield`, `type:library`, `owner:synthetic`, and
  `authority:none`.
- `nx run-many -t build,test,lint` passed for the synthetic project.
- Repeating `nx run synthetic-generated:build` produced a local cache hit
  (`1/1 hit`, command not rerun).
- `nx affected -t test --base=HEAD --head=HEAD` selected no tasks for an
  unchanged revision.
- `nx graph --file=graph.json` produced graph JSON in the disposable fixture.
- The generated package exposed explicit `exports` and was detected under the
  npm workspace package convention.
- The corrected fixture uses package name `@shield/synthetic-generated`, tags
  `scope:shield`, `type:library`, `owner:synthetic`, `authority:none`, and an
  `.mts` entrypoint; its marker is the exact LF-terminated canonical marker
  specified by the v1 plan.
- A first lint run intentionally failed because the fixture checked the wrong
  file; after correcting the fixture check, the full target run passed. This
  failure is retained as evidence that the validation catches a bad boundary
  marker rather than being silently ignored.
- The generic `@nx/js:library --dry-run` invocation failed with Nx’s explicit
  “does not support --dry-run” message. This is the decisive reason for the
  repository-local manifest layer.

No primary-checkout plugin installation or production file mutation occurred.
Fixture-only lockfile work is permitted only under a canonical, non-symlink
fixture root containing a required marker; the generator rejects the primary
checkout and any lockfile outside that identity before mutation.

## Measurements for future production extractions

For each child PR, record before/after wall time and cache status for Team
System build, test, lint, the extracted project’s build/test/lint, and the
affected target set. Also record project count, graph edge count, changed-file
count, test count, and cache hit/miss counts on a clean and a one-file change.
An extraction is beneficial only if the boundary remains cohesive and the
measured affected/test/build work decreases without compatibility failures.

## Dependency-ordered child issues

These are issue drafts, not created external tracker issues.

1. **Manifest and authority validator** — implement the closed schema,
   canonical manifest hashing, path/dependency allowlists, authority-none
   checks, and plan-only behavior. Depends on none.
2. **Journal/replay boundary pilot** — use the generator against a synthetic
   copy, then propose the smallest production compatibility seam with before /
   after measurements. Depends on 1.
3. **Dispatch receipt/store boundary pilot** — inventory persistence and
   projection imports, generate compatibility exports, and measure affected
   selection. Depends on 1 and 2 where shared journal contracts are proven.
4. **Focused target coverage** — add focused Feature Flight and
   mission-preparation targets without moving ownership. Depends on 1; informs
   the negative-control validation for 2 and 3.
5. **Production extraction PRs** — one truthful capability per PR, using the
   approved manifest and exact child boundary. Depends on the applicable pilot,
   Fury review, and human authority for production mutation.

## Review gates

Daisy reconnaissance was dispatched but could not run because the host
reported the `gpt-5.3-codex-spark` usage limit. Local evidence above is marked
as Hill-collected; no Daisy findings are fabricated. The report and plan are
frozen as content-addressed artifacts; each digest is recorded in its adjacent
sidecar. The baseline remains `d3f29002fe6c249152763815a633132589b5a9b1`.
Fury’s technical
reviews returned `REVISE`; the current revision incorporates the recovery,
fixture-identity, acceptance-isolation, and contract-reconciliation findings.
No implementation, human authority, merge, deployment, or release is claimed.
