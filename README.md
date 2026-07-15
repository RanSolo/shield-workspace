# shield-workspace

Canonical Nx workspace for the SHIELD Team System and its proving-ground
applications.

## Projects

- `apps/multiband` is the first proving-ground application.
- `packages/shield-team-system` is the portable SHIELD framework package.
- `benchmarks` is reserved for repeatable team and workflow fixtures.
- `tools` is reserved for workspace-level generators and validation helpers.
- `docs` records workspace architecture, provenance, and validation boundaries.

The initial migration is tracked in
[`RanSolo/shield-team-system#4`](https://github.com/RanSolo/shield-team-system/issues/4).
The source repositories remain active until migration, development, and deployment
validation are complete.

## Setup

```bash
npm install
npm run nx -- show projects
```

## Secret-free validation

```bash
npm test
npm run test:shield
npm run test:multiband
```

Multiband builds and runtime checks may require database or cloud configuration.
See `docs/validation.md` before running them.
