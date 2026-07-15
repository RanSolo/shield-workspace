# JavaScript Monorepo Example

Use this example as the target shape when Maria Hill is discovering a conventional
TypeScript or JavaScript web repository.

## Mission target

- Issue / PR / request: Polish public band site visual design
- Current branch: `main`
- Worktree state: clean

## Repository shape

- Purpose: multi-tenant platform for band websites
- Monorepo or single app: single app with supporting scripts
- Main directories: `app/`, `components/`, `lib/`, `prisma/`, `tests/`
- Important docs: `README.md`, `TECHNICAL_DESIGN.md`

## Runtime and dependency stack

- Package manager: `npm`
- Primary language(s): TypeScript, React
- Primary framework(s): Next.js App Router, Prisma, Tailwind
- Platform / hosting: Vercel
- Important integrations: GitHub OAuth, Postgres, Blob storage, OpenAI

## Testing and validation stack

- Unit / integration: Jest or Node test runner if present
- Browser / E2E: Playwright if present
- Lint: `npm run lint`
- Type check: included in build if no dedicated script exists
- Build: `npm run build`
- Other validation: `git diff --check`

## Local environment expectations

- Required services: local dev server only unless the mission needs auth, DB, or
  Vercel-backed features
- Required env vars: those referenced by `README.md`, `.env.example`, or
  deployment docs
- Credentials or external systems: Vercel, GitHub, DB credentials only when the
  mission depends on them

## Current mission slice

- Files the next seat should read: the issue-relevant route/component files,
  plus any design or technical docs that explain the feature
- Commands the next seat should trust: `npm run lint`, `npm run build`, focused
  tests if they exist
- Known blockers or caveats: custom domain, auth, or storage features may not be
  testable without credentials
