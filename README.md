# Multi-Band Starter Kit

A multi-tenant platform for building professional band websites — fast.

Independent bands get their own branded site with blog posting, custom domains, and rich content sections, all managed from a single dashboard. No developer required.

---

## Project Mission

Build software that real people are grateful exists.

Every feature should remove friction, create delight, or solve a genuine problem. Bands are our first customers. Their success is the measure of our success.

---

## Product Vision

Create the easiest and most enjoyable way for independent bands to establish and manage a professional online presence.

We are building a multi-tenant platform whose first vertical is independent music bands. The long-term opportunity is a reusable platform that can support additional industries — but we earn that flexibility by first becoming exceptional for bands.

**What we are building:**

- Site creation with custom branding
- Blog/news publishing
- Custom domain support
- Social media integration
- A dashboard band owners actually enjoy using

**What we are not building (Version 1):**

- A Wix competitor
- A social network
- Music distribution or ticketing
- Merch fulfillment
- Team collaboration tools

---

## Current Status

The project is under active development. Core platform capabilities are in place, and current development is focused on completing the Version 1 ("Band Site in a Box") experience.

See [REPOSITORY_STATE_REPORT.md](docs/REPOSITORY_STATE_REPORT.md) for an evidence-based inventory of implemented capabilities and remaining gaps.

---

## Getting Started

Project setup instructions are evolving. For now:

1. Clone the repository.
2. Review [FLIGHT_PLAN.md](docs/FLIGHT_PLAN.md) to understand the product vision.
3. Review [REPOSITORY_STATE_REPORT.md](docs/REPOSITORY_STATE_REPORT.md) to understand the current implementation.
4. Configure the required environment variables (see below).
5. Start the local development server (`npm run dev`).

Detailed setup instructions will be expanded as the platform matures.

---

## Documentation Guide

| Document | Purpose | Audience |
|----------|---------|----------|
| [FLIGHT_PLAN.md](docs/FLIGHT_PLAN.md) | Product vision, MVP scope, epic roadmap, release strategy | Everyone |
| [REPOSITORY_STATE_REPORT.md](docs/REPOSITORY_STATE_REPORT.md) | Evidence-based inventory of current codebase vs. plan | Implementation team |
| [TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) | Architecture, system design, data model, deployment topology | Architects, implementers |
| [TEAM.md](docs/TEAM.md) | Team roles, operating workflow, decision rights | New members |

The Flight Plan is the strategic source of truth. The Repository State Report is the reality check. See [TEAM.md](docs/TEAM.md) for documentation hierarchy and how these documents relate.

---

## Project Principles

See [TEAM.md](docs/TEAM.md) for project principles, team roles, and operating workflow.

---

## Development Workflow

This project follows a disciplined workflow designed to separate strategy, understanding, and execution.

1. **Strategy** — The Flight Plan defines the product vision, MVP, and roadmap.
2. **Reconnaissance** — The Repository State Report verifies the current implementation against the Flight Plan using evidence from the codebase.
3. **Planning** — Epics and implementation work are defined based on the gap between the Flight Plan and the current repository state.
4. **Approval** — Proposed work is reviewed for scope, alignment, and impact before implementation begins.
5. **Implementation** — Approved work is completed in small, focused GitHub issues.
6. **Verification** — Changes are tested, documentation is updated when necessary, and the Repository State Report evolves to reflect the new reality.

This workflow helps ensure that implementation follows an intentional roadmap rather than reacting to assumptions or incomplete information.

---

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL database (Vercel Postgres recommended)
- GitHub OAuth app (for authentication)
- Vercel account with Blob and KV enabled

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your configuration
# Required: AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, POSTGRES_PRISMA_URL, BLOB_READ_WRITE_TOKEN

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Start development server
npm run dev
```

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `AUTH_GITHUB_ID` | GitHub OAuth App Client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Client Secret |
| `AUTH_SECRET` | Encryption key for JWT sessions |
| `POSTGRES_PRISMA_URL` | PostgreSQL connection URL (with pooling) |
| `POSTGRES_URL_NON_POOLING` | Direct PostgreSQL connection URL |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for tenant resolution |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token |
| `OPENAI_API_KEY` | OpenAI API key (AI-assisted writing) |
| `KV_REST_API_URL` | Vercel KV cache URL |
| `KV_REST_API_TOKEN` | Vercel KV cache token |
| `VERCEL_PROJECT_ID` | Vercel project ID (custom domains) |
| `VERCEL_TEAM_ID` | Vercel team ID (custom domains) |
| `AUTH_BEARER_TOKEN` | Bearer token for API auth |

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Prisma generate |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Node.js smoke and regression tests |
| `npm run format` | Check code formatting |
| `npm run format:write` | Apply code formatting |
| `npm run pformat` | Format Prisma schema |

---

## Project Structure

```
multiband-starter-kit/
├── app/                          # Next.js App Router
│   ├── [domain]/                # Tenant routes (public band sites)
│   ├── api/                     # API routes
│   ├── app/                     # Admin routes (dashboard, auth)
│   │   ├── (auth)/              # Login flow
│   │   └── (dashboard)/         # Dashboard pages
│   └── home/                    # Root domain (landing page)
├── components/                  # React components
├── lib/                         # Business logic, auth, database
├── prisma/                      # Database schema and migrations
├── public/                      # Static assets
├── docs/                        # Project documentation
└── middleware.ts                # Multi-tenant routing middleware
```

### Key Files

| File | Purpose |
|------|---------|
| `middleware.ts` | Multi-tenant route resolution |
| `lib/auth.ts` | Authentication configuration |
| `lib/actions/actions.ts` | Server Actions (site/post CRUD) |
| `lib/fetchers.ts` | Cached data fetching |
| `lib/domains.ts` | Vercel Domains API integration |
| `prisma/schema.prisma` | Database schema |

---

## Contributing Guidelines

### Before You Start

1. **Read the Flight Plan.** Understand what we are building and why before contributing.
2. **Check the Repository State Report.** Know what already exists to avoid duplicating work.
3. **Find or create an issue.** Every piece of work should be tracked. If no issue exists, create one describing the problem.

### Making Changes

1. Work against an approved issue or Epic.
2. Keep changes focused — small complete missions.
3. Write clear commit messages that reference the issue number.
4. Ensure `npm run lint` and `npm run build` pass before submitting.
5. Update documentation if your change affects user-facing behavior or architecture.

### Code Standards

- TypeScript strict mode everywhere
- App Router only — no Pages Router
- Server Actions over API routes where practical
- Multi-tenant isolation is mandatory — every data query must verify ownership
- Vercel-first deployment for Version 1

---

## License

Private — Multi-Band Starter Kit
