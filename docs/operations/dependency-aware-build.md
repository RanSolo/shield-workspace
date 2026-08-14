# Dependency-aware Team System build

From the repository root, refresh committed dependencies and build the Team
System CLI with:

```sh
npm ci && npm exec nx run @shield/team-system:build
```

The package-local Nx task schedules `@shield/mission-preparation:build` first
through the existing project dependency and caches each package's `dist`
directory. The resulting CLI is
`packages/shield-team-system/dist/cli.mjs`.

For the deeper clean-checkout and cache-restoration proof, run:

```sh
npm run verify:team-system-clean-build
```

That command archives the exact current commit into a system temporary
directory, installs its lockfile, uses fresh absolute Nx cache and workspace
data directories with the daemon and Nx Cloud disabled, and verifies the exact
task edge, two consecutive cache hits, deletion/restoration cache hits,
byte-identical SHA-256 output manifests, runtime and declaration files, and
`mission prepare-next` CLI help. It does not use or modify the ordinary
workspace cache or generated output.
