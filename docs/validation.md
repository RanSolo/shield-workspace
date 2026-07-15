# Validation

## Secret-free workspace validation

Run from the workspace root:

```bash
npm install
npm run nx -- show projects
npm test
npm run affected:test -- --base=main --head=HEAD
git diff --check main...HEAD
```

The expected Nx projects are `@shield/multiband` and
`@shield/team-system`. The root lockfile is authoritative for both npm
workspaces; the imported Multiband lockfile is removed during migration.

Prisma client generation is secret-free and may be run independently:

```bash
npm exec --workspace @shield/multiband -- prisma generate
```

An optional `tsc --noEmit` reconnaissance check currently reports two existing
Server Action return-type errors in `delete-post-form.tsx` and
`delete-site-form.tsx`. Their blobs match the imported Multiband source tip, so
they are recorded as baseline application debt rather than migration changes.

## Dependency preservation

The root workspace lockfile is seeded from Multiband's imported lockfile before
adding Nx metadata. This prevents workspace initialization from silently
upgrading application dependencies. The validated lock retains Next.js 14.2.3,
React 18.3.1, and Prisma 5.14.0 while adding Nx 23.1.0.

`npm ci --ignore-scripts` currently reports 40 inherited audit findings (4 low,
16 moderate, 19 high, and 1 critical). No automatic audit fix is authorized in
this migration because it could change application behavior. Security upgrades
require a separate reviewed mission.

## History validation

The imported source tips must remain ancestors of the workspace branch:

```bash
git merge-base --is-ancestor 6bfb983aa03b62498d7ae71b93216e93b06376c4 HEAD
git merge-base --is-ancestor 0286396b04bf7ab25397adc08118a47fdd0c6129 HEAD
```

## Credential-dependent validation

Multiband's production build, development server, middleware behavior, database
connectivity, uploads, custom domains, and AI-assisted writing may require
PostgreSQL, GitHub OAuth, Vercel, KV, Blob, or OpenAI configuration. Those checks
are a separate deployment checkpoint and are not authorized by this migration.

Do not run migrations, reconfigure Vercel, or infer deployment readiness from
secret-free workspace checks.

`npm run affected:build` is intentionally separate because Multiband build
validation may cross the credential-dependent boundary.
