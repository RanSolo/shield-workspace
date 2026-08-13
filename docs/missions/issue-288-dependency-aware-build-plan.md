# Issue #288 — dependency-aware Team System build

Status: proposed implementation plan for Fury review
Mission: `mission:issue-288`
Repository: `RanSolo/shield-workspace`
Planning base: `8d48a21ea152b06d5d8168ef44acb5a5706b4aef`

## Objective

Make the ordinary Nx build for `@shield/team-system` produce a runnable CLI
from a clean checkout by building and cache-restoring its existing
`@shield/mission-preparation` dependency first. Do not change mission,
authority, preparation, journal, or publication behavior.

## Observed baseline

- Nx discovers three projects: `@shield/mission-preparation`,
  `@shield/team-system`, and `@shield/multiband`.
- The project graph already contains the static edge
  `@shield/team-system -> @shield/mission-preparation` from the declared npm
  workspace dependency.
- Neither build target declares `dependsOn: ["^build"]`.
- Neither package build target declares its generated `dist` directory as an
  Nx output.
- Therefore building Team System alone can start before preparation output
  exists, and cache restoration has no explicit runtime-output boundary.

## Frozen design

Use the existing project graph; do not create another library or duplicate the
dependency edge.

1. Add `dependsOn: ["^build"]` to the workspace build target default in
   `nx.json`. Nx must derive the predecessor from the graph rather than from a
   package-specific shell command.
2. Declare `{projectRoot}/dist` as the build output for both
   `@shield/mission-preparation` and `@shield/team-system` in their package-local
   Nx target metadata. Do not commit generated output.
3. Add a deterministic regression command which creates a disposable
   repository snapshot containing the candidate files, installs from the exact
   lockfile, proves `nx build @shield/team-system` schedules preparation first,
   proves the resulting CLI starts and exposes `mission prepare-next`, removes
   both generated `dist` directories, reruns through cache, and proves both
   runtime and declaration outputs were restored.
4. Keep the regression isolated from the ordinary package unit-test process so
   it cannot race shared `dist` artifacts. Expose it as one explicit root npm
   validation command and document that command as the canonical clean-build
   proof.

## Rapid-strike packets under one Wheels Up

### Packet A — AC-1/AC-2/AC-3: graph, build, runnable CLI

- Add graph-derived build ordering and package-local output declarations.
- Prove a single Team System build schedules its dependency and yields a CLI
  exposing `mission prepare-next`.

### Packet B — AC-4/AC-5/AC-6: cache, clean checkout, operator command

- Add the isolated clean-checkout/cache-restoration regression.
- Prove runtime JavaScript and TypeScript declarations restore together.
- Document one canonical refresh/build command and one deeper regression
  command.

## Initial implementation paths

- `docs/operations/dependency-aware-build.md`
- `nx.json`
- `package.json`
- `packages/mission-preparation/package.json`
- `packages/shield-team-system/package.json`
- `tools/verify-team-system-clean-build.mjs`

The reviewed plan is not a May write path. Fury may remove paths or require a
smaller test seam before implementation.

## Validation

- resolved Nx project graph shows the existing static dependency;
- resolved Team System build target includes `^build` ordering;
- resolved package build targets declare exact `dist` outputs;
- `npm exec nx run @shield/team-system:build --skipNxCache` from absent package
  outputs builds preparation first and starts the CLI;
- the isolated clean-build/cache regression passes;
- focused existing Team System and mission-preparation tests pass;
- exact-base/head `npm exec nx affected -t build,test` reports unrelated
  application environment prerequisites separately;
- exact changed-path allowlist and `git diff --check` pass.

## Exclusions

- no new Nx library or project;
- no generated `dist` committed;
- no mission or authority behavior change;
- no package extraction or source refactor;
- no Multiband application change;
- no merge, deployment, release, or ready-for-review transition.
