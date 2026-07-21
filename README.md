# shield-workspace

**S.H.I.E.L.D. governs autonomous coding agents for enterprise software development.**

This repository is the canonical Nx workspace for the S.H.I.E.L.D. Team System, its portable framework package, and the applications used to prove and refine its workflows.

## Projects

* `apps/multiband` — the first proving-ground application for S.H.I.E.L.D. workflows.
* `packages/shield-team-system` — the portable S.H.I.E.L.D. framework package.
* `benchmarks` — repeatable fixtures for evaluating agent behavior, team workflows, and mission outcomes.
* `tools` — workspace-level generators, installation utilities, and validation helpers.
* `docs` — architecture decisions, provenance, operating boundaries, and validation guidance.

## Migration Status

The initial migration is tracked in `RanSolo/shield-team-system#4`.

The source repositories remain active until migration, development, installation, and deployment validation are complete. This workspace should not be treated as the sole production source until those boundaries have been explicitly verified.

## Setup

```bash
npm install
npm run nx -- show projects
```

## Secret-Free Validation

The following commands should run without database credentials, cloud access, or other application secrets:

```bash
npm test
npm run test:shield
npm run test:multiband
```

Multiband build and runtime validation may require database, authentication, or cloud configuration. Review `docs/validation.md` before running environment-dependent checks.
