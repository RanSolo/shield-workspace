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
