# Workspace Architecture

## Decision

The canonical workspace is neutral: neither the SHIELD framework nor Multiband
owns the other.

- `apps/multiband` contains the proving-ground application and preserves its
  Next.js, Prisma, environment, and Vercel-oriented runtime boundaries.
- `packages/shield-team-system` contains the portable team framework and remains
  isolated from Multiband implementation details.
- Multiband references SHIELD through the npm workspace package name
  `@shield/team-system`, not through private relative paths.

Nx layers task discovery, caching, and affected execution over npm workspaces.
The migration deliberately does not add an Nx framework plugin or rewrite the
existing project scripts.

## Provenance

Both source repositories were imported without squashing:

- `RanSolo/shield-team-system` at
  `6bfb983aa03b62498d7ae71b93216e93b06376c4`
- `RanSolo/multiband-starter-kit` at
  `0286396b04bf7ab25397adc08118a47fdd0c6129`

Their original commit graphs remain ancestors of the workspace migration branch.
The source repositories remain active until a separate archival decision.

## Deferred decisions

- Repository and package licensing
- Source-repository archival
- Vercel root-directory and deployment migration
- Mission Adapter API and model-adapter consolidation
- CI and remote caching
- Publishing `@shield/team-system`
