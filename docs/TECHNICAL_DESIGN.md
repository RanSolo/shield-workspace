# Technical Design Document: Multi-Band Starter Kit

**Reconnaissance Report by Jester**  
*Date: 2026-06-27*

---

## 1. Executive Summary

### What is this application?
A **multi-tenant platform** for creating individual band websites, built on Next.js App Router with custom domain support. Each "tenant" is a band that gets its own site (subdomain or custom domain) with blog/post capabilities.

### What problem is it solving?
The README states: *"White label front end for my bands websites. So I only have to make one and provide config object for each band."* It solves the problem of managing multiple band presences from a single codebase — one platform, many branded sites.

### What is its current state?
**Early-stage proof-of-concept.** The repository is a fork/adaptation of Vercel's Platforms Starter Kit (`vercel/platforms`). Core scaffolding exists but the band-specific domain model is only partially implemented.

### What appears production-ready?
- **Multi-tenant routing** — middleware + dynamic routes resolve tenants by subdomain/custom domain correctly
- **Authentication** — GitHub OAuth via NextAuth with Prisma adapter, JWT strategy
- **Custom domain management** — Vercel Domains API integration for adding/verifying/removing domains
- **Post CRUD** — create/edit/publish posts with MDX support
- **Image upload** — Vercel Blob storage integration
- **AI content generation** — OpenAI-powered post generation with Upstash rate limiting
- **Dashboard overview** — lists sites and posts for authenticated users
- **Site settings** — edit name, bio, description, logo, image, font, subdomain, custom domain

### What appears incomplete?
- **Band-specific data model is skeletal** — `bandName` field exists on Site but nothing else (no members, music, videos, shows, venues, merch, galleries)
- **Social media links** — YouTube, Facebook, Instagram models exist in schema but are not wired into any UI flow
- **No band management page** — `(dashboard)/band/[id]/` directory exists in the file tree listing but no files inside it
- **No site management page** — `(dashboard)/site/[id]/` similarly empty
- **No post management page** — `(dashboard)/post/[id]/` similarly empty
- **Home page is a placeholder** — literally just "Welcome to the Multi-band platform!" text
- **No mobile-specific optimizations** beyond responsive Tailwind classes
- **No tests of any kind**
- **Migration script is commented out** and kept for posterity only

---

## 2. High-Level Architecture

### Framework and Versions

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.2.3 |
| Language | TypeScript | 5.2.2 |
| React | React | 18.3.1 |
| Auth | NextAuth.js | 4.24.7 |
| Database | PostgreSQL (Vercel Postgres) | via `@vercel/postgres` 0.5.1 |
| ORM | Prisma | 5.5.2 |
| Styling | Tailwind CSS | 3.3.5 |
| UI Components | Tremor + DaisyUI | 3.11.1 / 4.11.1 |
| MDX | next-mdx-remote | 4.4.1 |
| Editor | Novel (rich text) | 0.1.22 |
| AI | OpenAI Edge + AI SDK | 2.2.22 |
| Storage | Vercel Blob | 0.15.1 |
| Cache/Rate Limit | Vercel KV + Upstash | 1.0.0 / 0.4.4 |
| Animations | Framer Motion | 10.16.4 |

### Folder Structure Analysis

```
multiband-starter-kit/
├── app/                          # Next.js App Router (root)
│   ├── layout.tsx                # Root layout (providers, metadata)
│   ├── providers.tsx             # Session + modal providers
│   ├── sitemap.ts               # Dynamic sitemap generation
│   │
│   ├── [domain]/                # TENANT ROUTE GROUP (catch-all)
│   │   ├── layout.tsx           # Tenant chrome (header, logo, font)
│   │   ├── page.tsx             # Tenant home (posts grid)
│   │   └── [slug]/              # Post route
│   │       ├── page.tsx         # Post detail (MDX render)
│   │       ├── not-found.tsx    # 404 per tenant
│   │       └── opengraph-image.tsx
│   │
│   ├── api/                     # API Routes (Server Actions alternative)
│   │   ├── auth/[...nextauth]/  # NextAuth handler
│   │   ├── domain/[slug]/verify/# Domain verification
│   │   ├── generate/            # AI content generation
│   │   ├── migrate/             # ⚠️ Dead code (commented out)
│   │   └── upload/              # Vercel Blob upload
│   │
│   ├── app/                     # ADMIN ROUTE GROUP
│   │   ├── (auth)/              # Auth layout wrapper
│   │   │   └── login/           # Login page
│   │   ├── (dashboard)/         # Dashboard layout wrapper
│   │       ├── page.tsx         # Overview (sites + posts)
│   │       ├── sites/page.tsx   # All sites list
│   │       ├── settings/page.tsx# User settings
│   │       ├── band/[id]/       # ⚠️ Empty directory (no files)
│   │       ├── site/[id]/       # ⚠️ Empty directory (no files)
│   │       └── post/[id]/       # ⚠️ Empty directory (no files)
│   │
│   └── home/                    # ROOT DOMAIN ROUTE
│       └── page.tsx             # ⚠️ Placeholder ("Welcome...")
│
├── components/                  # Shared React components
│   ├── editor.tsx               # Novel MDX editor (client)
│   ├── sites.tsx                # Sites grid (server)
│   ├── posts.tsx                # Posts grid (server)
│   ├── mdx.tsx                  # MDX renderer with custom components
│   ├── nav.tsx                  # Sidebar navigation
│   ├── profile.tsx              # User avatar + logout
│   ├── uploader.tsx             # Image upload component
│   ├── form/                    # Form components
│   │   ├── index.tsx            # Generic form wrapper
│   │   ├── domain-status.tsx    # Domain verification status
│   │   ├── domain-configuration.tsx
│   │   └── uploader.tsx
│   ├── modal/                   # Modal system
│   │   ├── create-site.tsx      # Create site modal
│   │   └── provider.tsx         # Modal context provider
│   └── icons/                   # SVG icons + loading states
│
├── lib/                         # Core business logic
│   ├── auth.ts                  # NextAuth config + getSession + withSiteAuth
│   ├── prisma.ts                # Prisma client singleton
│   ├── domains.ts               # Vercel Domains API wrapper
│   ├── fetchers.ts              # Server-side data fetching (cached)
│   ├── types.ts                 # TypeScript types (domain verification)
│   ├── utils.ts                 # cn(), truncate, blurhash, etc.
│   ├── remark-plugins.tsx       # MDX plugins (links, tweets, examples)
│   ├── actions/                 # Server Actions
│   │   └── actions.ts           # createSite, updateSite, updatePost, etc.
│   └── hooks/                   # Client hooks
│       └── use-window-size.ts
│
├── prisma/
│   ├── schema.prisma            # Database schema (9 models)
│   └── migrations/              # 3 migration files
│
├── middleware.ts                # Multi-tenant routing middleware
├── next.config.js               # Next config (origins, images)
├── tailwind.config.js           # Tailwind + Tremor + DaisyUI themes
└── package.json                 # Dependencies
```

### Routing Architecture

The routing has **three distinct zones**:

1. **Root domain** (`NEXT_PUBLIC_ROOT_DOMAIN`) → rewrites to `/home/*`
2. **App domain** (`app.NEXT_PUBLIC_ROOT_DOMAIN`) → rewrites to `/app/*` (auth-gated)
3. **Tenant domains** (anything else) → rewrites to `/{hostname}/*`

```
User Request
    │
    ▼
Middleware (middleware.ts)
    │
    ├── Host = app.XXX → /app/* (auth-gated)
    ├── Host = root domain → /home/*
    ├── Host = vercel.pub → redirect to blog
    └── Host = anything else → /[hostname]/*  ← TENANT ROUTE
                                    │
                                    ▼
                            [domain]/layout.tsx   ← tenant chrome
                            [domain]/page.tsx     ← tenant home (posts)
                            [domain]/[slug]/page.tsx ← post detail
```

### Authentication
- **Provider**: GitHub OAuth only (hardcoded `GitHubProvider`)
- **Strategy**: JWT-based sessions stored in httpOnly cookies
- **Adapter**: Prisma adapter (Account, Session, VerificationToken tables)
- **Security**: `__Secure-` prefix on production, `sameSite: lax`, secure flag on deployment
- **Authorization helper**: `withSiteAuth()` server wrapper that verifies `site.userId === session.user.id`

### Database & ORM
- **Provider**: PostgreSQL via Vercel Postgres
- **Connection pooling**: Primary URL for pooling, non-pooled URL for direct connections
- **ORM**: Prisma 5.5.2 with `@prisma/client`
- **Migrations**: 3 migrations exist (all from initial setup phase)
- **Global singleton**: Prisma client uses `global.prisma` pattern to avoid connection exhaustion in dev

### API Structure
| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /api/auth/[...nextauth]` | NextAuth handler | ✅ Active |
| `POST /api/upload` | Vercel Blob upload | ✅ Active |
| `POST /api/generate` | AI content generation (rate-limited) | ✅ Active |
| `GET/POST /api/domain/[slug]/verify` | Domain verification | ✅ Active |
| `GET /api/migrate` | Database migration | ⚠️ Dead code |

### Deployment Assumptions
- **Platform**: Vercel (hardcoded throughout — Vercel Blob, Vercel KV, Vercel Domains API, Vercel Postgres)
- **Required env vars**: `AUTH_GITHUB_ID/SECRET`, `POSTGRES_PRISMA_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `KV_REST_API_URL/TOKEN`, `PROJECT_ID_VERCEL`, `TEAM_ID_VERCEL`, `AUTH_BEARER_TOKEN`
- **Edge runtime**: `/api/upload` and `/api/generate` use `export const runtime = "edge"`
- **Custom domain**: Requires Vercel team project with domain management enabled

---

## 3. Multi-Tenant Architecture

### How Tenants Are Resolved

```typescript
// In middleware.ts:
let hostname = req.headers.get("host")
  .replace(".localhost:3000", `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`);

// Special case for Vercel preview URLs:
if (hostname.includes("---") && hostname.endsWith(DEPLOYMENT_SUFFIX)) {
  hostname = `${hostname.split("---")[0]}.${ROOT_DOMAIN}`;
}
```

Resolution logic:
1. Extract hostname from `host` header
2. Strip `.localhost:3000` suffix for local dev → maps to root domain
3. Handle Vercel preview deployment URLs (`---` separator)
4. If hostname = `app.XXX` → admin routes (auth-gated)
5. If hostname = root domain → home routes
6. **Everything else** → tenant route: `rewrite(/${hostname}${path})`

In the tenant route handler (`[domain]/page.tsx`):
```typescript
const domain = decodeURIComponent(params.domain);
// In fetchers.ts:
const subdomain = domain.endsWith(`.${ROOT_DOMAIN}`)
  ? domain.replace(`.${ROOT_DOMAIN}`, "")
  : null;
// Query: prisma.site.findUnique({ where: subdomain ? { subdomain } : { customDomain: domain } })
```

### How Routing Works

| Tenant Type | URL Pattern | Resolution |
|-------------|------------|------------|
| Subdomain tenant | `demo.localhost:3000` | `subdomain = "demo"` → `findUnique({ subdomain })` |
| Custom domain tenant | `myband.com` | `customDomain = "myband.com"` → `findUnique({ customDomain })` |
| Preview deployment | `abc123---project.vercel.app` | Strips prefix → treated as subdomain |

### Custom Domains
- Stored in `Site.customDomain` (unique constraint)
- Added to Vercel project via `addDomainToVercel()` API call
- Verified via `POST /api/domain/[slug]/verify`
- Config checked via Vercel Domains API (`configuredBy`, `misconfigured`)
- Optional redirect: `REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS=true` env var

### Subdomains
- Stored in `Site.subdomain` (unique constraint)
- 7-character random alphanumeric nanoid generated automatically
- Derived from site name in the create modal (lowercase, hyphenated)

### Middleware Responsibilities
1. **Host extraction** — parse incoming hostname
2. **Route classification** — admin vs home vs tenant
3. **Auth gating** — redirect unauthenticated users to `/login` on app domain
4. **URL rewriting** — transparently map hostnames to internal routes (no redirects for tenants)
5. **Preview URL handling** — special case for Vercel deployments
6. **Domain redirect** — optional redirect from subdomain to custom domain

### Request Lifecycle (Tenant Page)

```
1. User visits band.localhost:3000/blog/my-post
   │
2. Middleware extracts hostname = "band.localhost:3000"
   │
3. Rewrites to /band.localhost:3000/blog/my-post
   │
4. Next.js routes to [domain]/[slug]/page.tsx
   │   params.domain = "band.localhost:3000"
   │   params.slug = "my-post"
   │
5. generateMetadata() calls getSiteData("band.localhost:3000")
   │   → strips ROOT_DOMAIN suffix → subdomain = "band"
   │   → prisma.site.findUnique({ where: { subdomain: "band" } })
   │
6. Page component calls getPostData(domain, slug)
   │   → prisma.post.findFirst({ where: { site.subdomain, slug, published: true } })
   │
7. MDX renderer renders post content with tenant's font/theme
```

### Tenant Context
Tenant context flows through:
- **URL params** (`params.domain`) — primary mechanism
- **Database queries** — resolved via `getSiteData()` / `getPostsForSite()` fetchers
- **Caching tags** — `${domain}-metadata`, `${domain}-posts` (Next.js `unstable_cache`)
- **Revalidation** — `revalidateTag()` on site updates

### Data Isolation

**Strengths:**
- Every tenant query filters by `subdomain` OR `customDomain`
- Server Actions use `withSiteAuth()` to verify ownership (`site.userId === session.user.id`)
- Posts are scoped to sites via `siteId` foreign key
- Custom domain and subdomain have unique constraints (one-to-one)

**Weaknesses / Potential Leakage:**
1. **No tenant isolation at the database level** — all data in shared tables with no row-level security
2. **`getPostsForSite()` only checks site scope, not user ownership** — any authenticated user could potentially query another tenant's posts if they know the domain
3. **`generateStaticParams()` is hardcoded to `subdomain: "demo"`** — production deployment won't pre-render any tenant routes
4. **No multi-tenant caching isolation** — cache keys use domain string, but there's no namespace separation between environments
5. **`withSiteAuth()` only protects Server Actions** — the fetcher functions (`getSiteData`, `getPostData`) have no auth checks; they're used in public pages where this is correct, but the boundary is implicit

### Tenant Leakage Analysis

| Risk | Severity | Details |
|------|----------|---------|
| Cross-tenant data read via fetchers | Medium | Public pages correctly allow unauthenticated reads, but there's no audit trail |
| Hardcoded "demo" in generateStaticParams | Low | Only affects SSG; SSR/ISR still works |
| No RLS on PostgreSQL | Medium | If DB is compromised, all tenant data is accessible |
| Custom domain collision | Low | Unique constraint prevents this |
| Subdomain enumeration | Low | Any subdomain can be probed; no rate limiting on tenant lookup |

---

## 4. Data Model

### ER Summary

```
┌──────────┐     ┌───────────────┐
│   User   │────<│    Site       │
└──────────┘     └──────┬────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
        ┌─────▼──┐ ┌────▼─────┐ ┌──▼──────────────┐
        │  Post   │ │SocialMedia│ │  YouTube/FB/IG  │
        └─────────┘ │   Link    │ │  (orphaned)     │
                    └───────────┘ └─────────────────┘
```

### Entity-by-Entity Analysis

#### `User`
- **Purpose**: Platform user (band owner/admin)
- **Relationships**: One-to-many with Site, Post, Account, Session
- **Ownership**: Owns sites via `userId` foreign key
- **Tenant boundaries**: None — User is a platform-level entity, not tenant-scoped
- **Fields present**: id, name, username, gh_username, email, emailVerified, image, createdAt, updatedAt
- **Missing fields**: 
  - No role/permission system (all users are equal)
  - No `bandName` — this is on Site, not User
  - No avatar URL fallback handling
- **Improvements**: Add `role` enum (admin/member), `preferredDomain`

#### `Site` ⭐ (Core Tenant Entity)
- **Purpose**: Represents a band's website (the tenant)
- **Relationships**: One-to-many with Post, SocialMediaLink; Many-to-one with User
- **Ownership**: Single owner via `userId`
- **Tenant boundaries**: Identified by `subdomain` OR `customDomain` (mutually exclusive in practice)
- **Fields present**: id, name, bandName, bio, description, logo, font, image, imageBlurhash, subdomain, customDomain, message404, createdAt, updatedAt
- **Missing fields** (critical for band use case):
  - **Members** — no member list, roles, or join flow
  - **Music** — no tracks, albums, or audio storage
  - **Videos** — no video gallery (YouTube embed exists but is a single field)
  - **Shows/Events** — no tour dates or event management
  - **Venues** — no venue database
  - **Merch** — no products or commerce
  - **Photo galleries** — no gallery model
  - **Press kit** — no press materials
  - **Mailing list** — no subscriber management
  - **Contact info** — no address, phone, or booking email
  - **Social links** — only `SocialMediaLink` table exists but no UI to manage them
- **Improvements**: Add `status` enum (draft/published/archived), `theme` config, `seo` fields

#### `Post`
- **Purpose**: Blog/content article for a band's site
- **Relationships**: Many-to-one with Site, User
- **Ownership**: Inherited from Site owner via `userId`
- **Tenant boundaries**: Scoped to `siteId`
- **Fields present**: id, title, description, content (MDX), slug, image, imageBlurhash, published, createdAt, updatedAt
- **Missing fields**:
  - No author field beyond `userId` (could have multiple contributors)
  - No tags/categories
  - No cover image vs featured image distinction
  - No draft status (just boolean `published`)
  - No excerpt/summary separate from description
- **Improvements**: Add `tags[]`, `status` enum, `coverImage`, `readingTime`

#### `SocialMediaLink`
- **Purpose**: Generic social media embeds for a site
- **Relationships**: Many-to-one with Site
- **Ownership**: Inherited from Site owner
- **Tenant boundaries**: Scoped to `siteId`
- **Fields present**: id, featuredEmbed, link, siteId
- **Missing fields**: Platform type (Instagram/YouTube/Twitter/etc.), display order, visibility toggle
- **Improvements**: Add `platform` enum, `position` field, `isActive` boolean

#### `YouTube` ⚠️
- **Purpose**: YouTube channel/playlist configuration
- **Relationships**: Standalone (no foreign keys to Site or User)
- **Status**: **Orphaned model** — no relations, no UI, no code references
- **Verdict**: Dead code from template

#### `Facebook` ⚠️
- **Purpose**: Facebook page/events configuration
- **Relationships**: Standalone (no foreign keys)
- **Status**: **Orphaned model** — no relations, no UI, no code references
- **Verdict**: Dead code from template

#### `Instagram` ⚠️
- **Purpose**: Instagram featured embed
- **Relationships**: Standalone (no foreign keys)
- **Status**: **Orphaned model** — no relations, no UI, no code references
- **Verdict**: Dead code from template

#### `Account` (NextAuth)
- **Purpose**: OAuth account linkage (GitHub)
- **Relationships**: Many-to-one with User
- **Status**: Template-standard, functional

#### `Session` (NextAuth)
- **Purpose**: JWT session storage
- **Status**: Template-standard, functional

#### `VerificationToken` (NextAuth)
- **Purpose**: Passwordless/email verification tokens
- **Status**: Template-standard, present but unused (GitHub OAuth only)

#### `Example` ⚠️
- **Purpose**: Example cards shown in MDX content
- **Relationships**: Standalone
- **Status**: Used by `replaceExamples` remark plugin in MDX renderer
- **Verdict**: Keep if you want the "example card" MDX component; otherwise dead

---

## 5. User Experience

### Flow: Create Account
1. User visits `app.multi-band.com/login`
2. Clicks GitHub OAuth button
3. GitHub redirects back with auth code
4. NextAuth creates User + Account in Prisma
5. Redirected to dashboard overview

**Status**: ✅ Functional

### Flow: Create Tenant (Band Site)
1. Dashboard → "Create New Site" button
2. Modal opens with fields: name, bandName, subdomain, description, featuredEmbed
3. On submit: `createSite()` server action creates Site + SocialMediaLink
4. Subdomain auto-generated from name
5. Redirected to `/site/[id]` (which doesn't exist — dead end)

**Status**: ⚠️ Partially functional. Creates data correctly but redirects to a non-existent page.

### Flow: Configure Site
1. Dashboard → Settings
2. Edit: name, email, custom domain, logo, image, font, bio, description
3. Domain verification flow via Vercel API
4. Image upload via Vercel Blob

**Status**: ✅ Functional for basic fields. Custom domain flow is complete.

### Flow: Manage Content (Posts)
1. Dashboard → sees list of posts
2. Click to edit → Novel rich text editor opens
3. Edit title, description, content (MDX), cover image
4. Save (Cmd+S) or publish
5. Post appears on tenant home page and at `/{domain}/{slug}`

**Status**: ✅ Functional for basic blog. No post categories, no draft workflow, no media library.

### Flow: Public Visitor Experience
1. Visitor arrives at `band.multi-band.com` or custom domain
2. Middleware resolves to `[domain]/page.tsx`
3. Fetches site metadata + published posts
4. Renders tenant-branded page with logo, name, description, post grid
5. Clicking a post → `[domain]/[slug]/page.tsx` → MDX render

**Status**: ✅ Functional. Clean multi-tenant experience for visitors.

### Flow: Authentication
1. GitHub OAuth login
2. JWT token stored in secure cookie
3. `getSession()` available in server components
4. `withSiteAuth()` protects server actions

**Status**: ✅ Functional but **GitHub-only**. No email/password, no magic links, no other providers.

### Editing Workflow
- Novel editor (rich text/MDX) with live preview
- Cmd+S keyboard shortcut for save
- Transition states (saving/publishing indicators)
- Toast notifications via Sonner
- URL preview link shown in editor

**Status**: ✅ Functional and polished.

### Missing Flows
| Flow | Status | Notes |
|------|--------|-------|
| Band member invitation/join | ❌ Not implemented | No member model or invite system |
| Band member roles/permissions | ❌ Not implemented | All users are equal |
| Music upload/streaming | ❌ Not implemented | No audio model or player |
| Video gallery | ❌ Not implemented | YouTube embed is single-field only |
| Show/tour dates | ❌ Not implemented | No event model |
| Merch store | ❌ Not implemented | No commerce integration |
| Photo gallery | ❌ Not implemented | Only single cover image per post/site |
| Press kit download | ❌ Not implemented | No press materials model |
| Mailing list signup | ❌ Not implemented | No subscriber model |
| Contact form | ❌ Not implemented | No contact mechanism |
| Site preview before publishing | ❌ Not implemented | No draft site state |
| Multi-language/i18n | ❌ Not implemented | English only |
| SEO management per site | ⚠️ Partial | OpenGraph set from site data, but no meta tag customization |

---

## 6. Band Platform Evaluation

Assuming the first customers are **real working bands**, here's the capability assessment:

### Currently Supported (Template-Inherited)

| Capability | Status | Notes |
|-----------|--------|-------|
| Homepage | ✅ | Shows site name, logo, description, posts grid |
| Biography | ✅ | `bio` field on Site, rendered in settings |
| Custom domains | ✅ | Full Vercel Domains API integration |
| Social links | ⚠️ Partial | Schema exists but no UI to manage them |

### Missing Capabilities (Band-Specific)

| Capability | Why It Matters | Suggested Issue |
|-----------|---------------|-----------------|
| **Members** | Bands need to showcase lineup; multiple admins per band | "Add band members management" |
| **Music** | Core reason bands exist — streaming/uploading music is essential | "Add music/track management" |
| **Videos** | Music videos, live performances are critical for bands | "Add video gallery with YouTube/Vimeo embeds" |
| **Shows/Tour Dates** | Bands need to promote upcoming gigs | "Add show/tour date management" |
| **Venues** | Context for shows (location, capacity, maps) | "Add venue database with map integration" |
| **Contact** | Bookings, inquiries, press contacts | "Add contact/booking form per band" |
| **Merch** | Revenue stream for bands | "Add merch/product catalog" |
| **Photo galleries** | Live photos, promo shots, press kits | "Add photo gallery with upload" |
| **Press kit** | Press needs EPK (electronic press kit) | "Add downloadable EPK per band" |
| **Mailing list** | Direct fan communication channel | "Add mailing list integration (Mailchimp/etc.)" |
| **Social media feeds** | Live Instagram/Twitter feeds on site | "Add social media feed widgets" |
| **Merch integration** | Shopify/Square/WooCommerce embed | "Add third-party merch store embed" |

### Custom Domains
- ✅ Fully supported via Vercel Domains API
- ⚠️ Requires Vercel team project (not self-hostable without Vercel)

### Mobile Experience
- Responsive Tailwind classes throughout
- No dedicated mobile navigation (hamburger menu not implemented)
- No PWA capabilities
- Touch targets appear adequate based on component sizes

---

## 7. Technical Debt

### Old Dependencies

| Dependency | Version | Concern |
|-----------|---------|---------|
| `next-auth` | 4.24.7 | v4 is legacy; v5 (Auth.js) is current |
| `@next-auth/prisma-adapter` | ^1.0.7 | Tied to NextAuth v4 |
| `openai-edge` | ^1.2.2 | Superseded by `openai` npm package |
| `ai` | ^2.2.22 | AI SDK v3+ has breaking changes |
| `@vercel/postgres` | ^0.5.1 | Consider migrating to Prisma-native PostgreSQL |
| `react-iframe` | ^1.8.5 | Used for embeds; consider if still needed |

### Architectural Shortcuts

1. **Hardcoded Vercel dependencies** — Vercel Blob, KV, Domains API, Postgres are all Vercel-specific. Cannot be self-hosted without significant refactoring.
2. **GitHub-only auth** — No flexibility for other providers (Google, email/password, magic links).
3. **Server Actions mixed with API routes** — `/api/upload` and `/api/generate` use API routes but could be Server Actions. Inconsistent pattern.
4. **`unstable_cache` for tenant data** — Works but is experimental. Cache invalidation relies on tags which can leak across tenants if domain names collide.
5. **Global Prisma singleton** — `global.prisma` pattern works in dev but can cause issues in serverless/edge deployments.

### Styling Inconsistencies

1. **Mixed design systems** — Tremor (charts), DaisyUI (themes), and custom classes coexist without clear hierarchy
2. **Inline styles** — Some components use inline `style` attributes alongside Tailwind
3. **Dark mode** — Relies on `data-theme` attribute; not all components support dark mode variants
4. **Font system** — Three fonts (Cal Sans, Lora, Work Sans) with limited customization

### Security Concerns

| Concern | Severity | Details |
|---------|----------|---------|
| No rate limiting on tenant lookup | Medium | Any subdomain can be probed |
| No RLS on PostgreSQL | Medium | All data in shared tables |
| GitHub-only OAuth | Low | Not a vulnerability, but limits access |
| `withSiteAuth` only on server actions | Medium | Fetchers have no auth checks (correct for public pages, but boundary is implicit) |
| Hardcoded admin check | Low | `domain == "demo.XXX" || domain == "multi-band.com"` — string comparison for CTA visibility |

### Performance Concerns

1. **`generateStaticParams()` hardcoded to `"demo"`** — No SSG for real tenants in production
2. **No image optimization beyond blurhash** — All images go through Vercel's default optimizer
3. **Full site fetch on every page** — `getSiteData()` called in both layout and page for same domain
4. **No pagination** — Posts grid loads all posts; no infinite scroll or "load more"

### Deployment Risks

1. **Tied to Vercel ecosystem** — Cannot deploy elsewhere without rewriting Blob, KV, Domains, Postgres
2. **No CI/CD pipeline** — No GitHub Actions, no preview deployments configured
3. **Migration script is dead code** — `/api/migrate` is fully commented out but still in the codebase
4. **No environment validation** — Missing env vars cause runtime failures with no graceful degradation

### Missing Tests
- **Zero test files** in the entire repository
- No unit tests, integration tests, or E2E tests
- No lint rules beyond Next.js default

### Duplicated Logic
1. **Domain resolution** repeated in middleware, `getSiteData()`, `getPostsForSite()`, `getPostData()` — all do the same `domain.endsWith(ROOT_DOMAIN)` check
2. **Session checks** duplicated across every server component and server action
3. **Blurhash generation** in both `getBlurDataURL()` utility and inline in components

---

## 8. Codebase Health

### Most Important Files (Ranked)

| Rank | File | Importance | Why |
|------|------|-----------|-----|
| 1 | `middleware.ts` | Critical | All multi-tenant routing flows through here |
| 2 | `prisma/schema.prisma` | Critical | Data model foundation — defines all entities |
| 3 | `lib/auth.ts` | Critical | Authentication + authorization for entire app |
| 4 | `lib/fetchers.ts` | Critical | All tenant data resolution logic |
| 5 | `lib/actions/actions.ts` | High | Server Actions for CRUD operations |
| 6 | `app/[domain]/layout.tsx` | High | Tenant chrome (header, logo, font, theme) |
| 7 | `app/[domain]/page.tsx` | High | Tenant home page (posts grid) |
| 8 | `app/[domain]/[slug]/page.tsx` | High | Post detail with MDX rendering |
| 9 | `components/editor.tsx` | Medium | Novel MDX editor — core content creation |
| 10 | `components/modal/create-site.tsx` | Medium | Site creation flow |
| 11 | `lib/domains.ts` | Medium | Custom domain management |
| 12 | `components/nav.tsx` | Medium | Dashboard navigation |
| 13 | `components/mdx.tsx` | Low-Medium | MDX renderer with custom components |
| 14 | `app/home/page.tsx` | Low | Placeholder — needs replacement |

### Dead Code

| File/Code | Reason |
|-----------|--------|
| `app/api/migrate/route.ts` | Fully commented out migration script |
| `prisma/schema.prisma` → `YouTube` model | No relations, no UI, no code references |
| `prisma/schema.prisma` → `Facebook` model | No relations, no UI, no code references |
| `prisma/schema.prisma` → `Instagram` model | No relations, no UI, no code references |
| `prisma/schema.prisma` → `Example` model | Only used by remark plugin; not a core entity |
| `lib/remark-plugins.tsx` → `replaceExamples` | Used in MDX but Example model is orphaned |
| `(dashboard)/band/[id]/` directory | Empty — no files inside |
| `(dashboard)/site/[id]/` directory | Empty — no files inside |
| `(dashboard)/post/[id]/` directory | Empty — no files inside |
| `externalLinks` in `nav.tsx` | Commented out array |

### Hidden Gems Worth Preserving

1. **`withSiteAuth()` pattern** — Elegant authorization wrapper for server actions. Reusable pattern.
2. **Domain resolution abstraction** — The `domain.endsWith(ROOT_DOMAIN)` check, while duplicated, is a clean pattern for subdomain vs custom domain detection.
3. **`unstable_cache` with tags** — Smart caching strategy for multi-tenant data with proper invalidation.
4. **Novel editor integration** — Polished rich-text/MDX editing experience that would take significant effort to replicate.
5. **Vercel Blob upload flow** — Clean image upload pattern with progress indicators.
6. **AI content generation** — Rate-limited OpenAI integration for post generation.
7. **Modal system** — Context-based modal provider pattern is clean and reusable.

---

## 9. MVP Readiness — Blockers for One Real Band Today

**Assume the multi-tenant platform is feature-complete. Ignore future enhancements. Walk the codebase and identify everything preventing one real band from successfully creating, customizing, publishing, and maintaining a production website today. Rank those blockers by severity.**

### Severity: BLOCKER (Cannot proceed)

| # | Blocker | Location | Why It Blocks |
|---|---------|----------|---------------|
| 1 | **Home page is a placeholder** | `app/home/page.tsx` | The platform has no entry point. New visitors see only "Welcome to the Multi-band platform!" text. There is no way to discover or sign up for the platform. |
| 2 | **Site creation redirects to non-existent page** | `components/modal/create-site.tsx` → `/site/[id]` | After creating a site, the user is redirected to a route that has no file. The dashboard sub-pages (`band/[id]`, `site/[id]`, `post/[id]`) are empty directories with no files inside. Users cannot manage their site after creation. |
| 3 | **GitHub-only authentication** | `lib/auth.ts` → `GitHubProvider` | If the band doesn't use GitHub, there is no way to log in. No Google OAuth, no email/password, no magic links. This is a hard blocker for any non-GitHub user. |
| 4 | **No band-specific features** | Entire codebase | The platform creates "sites" but has zero band capabilities: no members, no music, no videos, no shows, no venues, no merch, no galleries. A band landing on a tenant site sees only a blog grid and a YouTube embed — not a functional band presence. |

### Severity: CRITICAL (Severely degrades production readiness)

| # | Blocker | Location | Why It Matters |
|---|---------|----------|----------------|
| 5 | **`generateStaticParams()` hardcoded to `"demo"`** | `app/[domain]/page.tsx` and `app/[domain]/[slug]/page.tsx` | SSG does not work for real tenants. The `where: { subdomain: "demo" }` filter means only the demo site is pre-rendered. All other tenant routes fall back to SSR, losing performance benefits and causing cold starts. |
| 6 | **No content moderation workflow** | `components/report-abuse.tsx` | The ReportAbuse component exists but only shows a toast with Vercel Analytics tracking. There is no admin review queue, no takedown process, and no way to moderate tenant content. A production platform needs this. |
| 7 | **Zero test coverage** | Entire repository | No unit tests, integration tests, or E2E tests exist. Any change to multi-tenant routing, auth, or data models can silently break the platform. This is a deployment risk, not just a quality concern. |
| 8 | **Orphaned schema models** | `prisma/schema.prisma` → `YouTube`, `Facebook`, `Instagram`, `Example` | Four models exist with no relations, no UI, and no code references. They confuse the data model and suggest incomplete planning. Running `prisma migrate` after removing them would be a breaking migration. |

### Severity: HIGH (Should be fixed before launch)

| # | Blocker | Location | Why It Matters |
|---|---------|----------|----------------|
| 9 | **Tenant homepage layout is blog-first** | `app/[domain]/page.tsx` | The hardcoded blog grid + YouTube iframe embed assumes every tenant is a band blog. A restaurant, photographer, or consultant would see irrelevant content. The platform makes vertical decisions in its public-facing layer. |
| 10 | **Social media links have no management UI** | `prisma/schema.prisma` → `SocialMediaLink` | The table exists but there is no settings page to add/remove/edit social links. The data model is there but the user experience is missing. |
| 11 | **Custom domain verification requires Vercel team project** | `lib/domains.ts` | Custom domains only work if deployed on a Vercel team project with domain management enabled. This is not self-hostable and not available on free Vercel accounts. A real band needs to understand this constraint before investing time. |
| 12 | **Dashboard terminology is blog-centric** | `app/app/(dashboard)/page.tsx` | The dashboard shows "Top Sites" and "Recent Posts." The nav uses blog-oriented icons (Newspaper, Edit3, Megaphone). A band owner would recognize this, but it reinforces the vertical assumption in the admin experience. |

### Severity: MEDIUM (Nice to have before launch)

| # | Blocker | Location | Why It Matters |
|---|---------|----------|----------------|
| 13 | **`bandName` field is unused** | `prisma/schema.prisma` → `Site.bandName` | The field exists but is never queried or displayed prominently. It signals band-specific design without providing value. |
| 14 | **No pagination on posts grid** | `components/posts.tsx` | All posts are loaded at once. For bands with many posts, this becomes a performance issue. No infinite scroll or "load more" exists. |
| 15 | **Migration script is dead code** | `app/api/migrate/route.ts` | Fully commented out but still in the codebase. Adds confusion about whether migration infrastructure exists. |
| 16 | **No environment variable validation** | Entire codebase | Missing required env vars cause runtime failures with no graceful degradation or startup errors. |

### Severity: LOW (Cosmetic or template artifacts)

| # | Blocker | Location | Why It Matters |
|---|---------|----------|----------------|
| 17 | **`message404` default has British colloquialism** | `prisma/schema.prisma` → `Site.message404` | Default is "Blimey! You've found a page that doesn't exist." Template flavor text that doesn't belong in a platform default. |
| 18 | **CTA component has hardcoded domain check** | `components/cta.tsx` | Shows only for `demo.multi-band.com` or `multi-band.com`. Template scaffolding, not a real feature. |
| 19 | **Mixed design systems** | `tailwind.config.js` | Tremor (charts), DaisyUI (themes), and custom classes coexist without clear hierarchy. Causes styling inconsistencies. |
| 20 | **External links array is commented out** | `components/nav.tsx` | Dead code that suggests planned features that were never implemented. |

---

### Summary: What Must Be Fixed Before One Real Band Can Use This

| Category | Items | Effort |
|----------|-------|--------|
| **Must fix (blockers)** | Home page, site management pages, Google OAuth, band features | High |
| **Should fix (critical)** | SSG params, content moderation, tests, orphaned models | Medium |
| **Should fix (high)** | Homepage layout flexibility, social links UI, domain constraints, dashboard terminology | Medium |
| **Nice to fix (medium/low)** | bandName field, pagination, dead code cleanup, env validation, cosmetic fixes | Low |

---

## 10. Platform vs Vertical Boundary Analysis

**Review the repository through two lenses: platform capabilities (reusable across industries) and vertical capabilities (specific to bands). Identify where boundaries already exist, where they are violated, and what the smallest path forward is.**

### 1. True Platform Capabilities

These are parts of the codebase that are **already generic enough to serve any vertical**. They solve problems every multi-tenant platform needs, regardless of industry.

#### Authentication & Authorization
**File**: `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`

GitHub OAuth is the only provider today, but the *architecture* is generic: NextAuth with Prisma adapter, JWT strategy, session management. The platform capability here is **identity infrastructure** — it just happens to be wired to GitHub right now.

**Verdict**: Platform capability. Adding Google/email providers would unlock any vertical without architectural change.

#### Multi-Tenant Routing
**File**: `middleware.ts`

The routing logic is **purely platform**. It resolves tenants by hostname, classifies routes into admin/home/tenant zones, and rewrites URLs transparently. There is zero band-specific logic in the middleware itself. The only vertical leakage is a hardcoded redirect for `vercel.pub` (template artifact).

**Verdict**: Clean platform capability. No changes needed.

#### Custom Domain Management
**File**: `lib/domains.ts`, `components/form/domain-status.tsx`, `components/form/domain-configuration.tsx`

The entire custom domain flow — add to Vercel project, verify DNS, check configuration, remove — is **generic infrastructure**. It operates on domain strings and Vercel API responses. No band semantics leak in.

**Verdict**: Clean platform capability. The only vertical coupling is the `vercel.pub` hardcode in `updateSite()` server action (see Section 5).

#### Tenant Data Resolution
**File**: `lib/fetchers.ts`

The fetcher functions (`getSiteData`, `getPostsForSite`, `getPostData`) resolve tenant context by stripping the root domain suffix and querying by `subdomain` or `customDomain`. The *pattern* is generic — it's how any multi-tenant system finds its tenant.

**Verdict**: Platform capability, but with a subtle vertical assumption (see Section 5).

#### File Storage
**File**: `app/api/upload/route.ts`, `@vercel/blob`

Vercel Blob upload is **generic object storage**. It doesn't care what the file is — image, audio, PDF, video thumbnail. The platform capability here is "tenants can store files."

**Verdict**: Clean platform capability.

#### Content Rendering Engine
**File**: `components/mdx.tsx`, `lib/remark-plugins.tsx`

MDX rendering with custom components (BlurImage, Tweet, Examples) is a **generic content engine**. The remark plugins for links and tweets are generic utilities. The `Examples` component is the only vertical-specific piece (it renders example cards from the orphaned `Example` model).

**Verdict**: Mostly platform. The `replaceExamples` plugin is tangentially coupled to the orphaned `Example` model but doesn't prevent reuse.

#### Theming System
**File**: `app/[domain]/layout.tsx` (font selection), `tailwind.config.js`

The font mapper (`fontMapper[data.font]`) applies tenant-specific typography. Tailwind config includes Tremor and DaisyUI themes. This is **generic branding infrastructure** — any vertical can pick fonts and color schemes.

**Verdict**: Clean platform capability.

#### Modal System
**File**: `components/modal/provider.tsx`, `components/modal/create-site.tsx`

The context-based modal provider pattern is **generic UI infrastructure**. The `create-site.tsx` content is vertical-specific, but the *mechanism* is reusable.

**Verdict**: Platform mechanism with vertical content. Clean separation.

#### Server Action Authorization Pattern
**File**: `lib/auth.ts` → `withSiteAuth()`, `withPostAuth()`

The authorization wrapper pattern (`withSiteAuth(action)`) that verifies `site.userId === session.user.id` is **generic multi-tenant authorization**. It's a reusable pattern for any resource-scoped operation.

**Verdict**: Clean platform capability. Worth preserving and documenting.

#### Dashboard Infrastructure
**File**: `components/nav.tsx`, `components/sites.tsx`, `components/posts.tsx`, `components/overview-stats.tsx`

The dashboard layout, navigation, site grid, post grid, and stats chart (Tremor) are **generic admin panel infrastructure**. The *content* displayed is blog-centric, but the *structure* works for any vertical's admin panel.

**Verdict**: Platform capability with vertical content (see Section 5).

### 2. Band-Specific Features

These are parts of the codebase that **only make sense for bands**. They solve band problems, not platform problems.

#### `bandName` Field on Site
**File**: `prisma/schema.prisma` → `Site.bandName`

The field exists but is never used in queries, never displayed prominently, and its purpose is unclear. It's a **vertical-specific data field** that was added for bands but never integrated into the platform layer.

**Verdict**: Vertical feature. If another vertical (restaurant, photographer) uses this, `bandName` would be semantically wrong. The field should either be renamed to something generic like `displayName` or removed.

#### Featured Embed (YouTube iframe)
**File**: `app/[domain]/page.tsx` → `<Iframe url={data.featuredEmbed} />`

The tenant homepage renders a single YouTube embed at the bottom. This is **band-specific** — bands embed their latest music video. A restaurant would want a menu, a photographer a gallery, a consultant a booking widget. The platform is making a vertical decision about what the homepage *must* contain.

**Verdict**: Vertical feature accidentally baked into the platform's public-facing layout. This is the most significant boundary violation I found.

#### Social Media Link Management
**File**: `prisma/schema.prisma` → `SocialMediaLink`, orphaned `YouTube`/`Facebook`/`Instagram` models

The schema has both a generic `SocialMediaLink` table (related to Site) and three standalone orphaned models (`YouTube`, `Facebook`, `Instagram`). The orphaned models are **template dead code**. The `SocialMediaLink` table is band-oriented (social media is a band concern). A restaurant's "social presence" might be Google Business or Yelp, not Instagram embeds.

**Verdict**: Vertical feature. The standalone models should be removed. The `SocialMediaLink` table is usable but narrow in scope.

#### Blog-First Content Model
**File**: `app/[domain]/page.tsx`, `components/posts.tsx`, `components/post-card.tsx`

The tenant homepage renders **posts as a blog grid**. Every public-facing page assumes the primary content type is "blog posts." A restaurant's homepage should show menu + hours + reservation, not blog posts. This is the deepest vertical coupling in the codebase — it affects every visitor-facing page.

**Verdict**: Vertical feature masquerading as platform infrastructure. The Post model itself is generic (title, description, content MDX), but the *presentation layer* assumes "band blog."

#### Show/Tour/Event Infrastructure
**Absent entirely.** No show model, no venue model, no ticketing integration. These are **vertical features for bands** that don't exist yet. They would be added as new models and components without touching platform code — which is the correct separation.

**Verdict**: Not implemented (expected). When built, they should live in `components/band/` or similar, not mixed with platform code.

#### Music/Video/Merch/Gallery
**Absent entirely.** Same analysis as above. These are vertical features that should be added as new models and components without touching platform infrastructure.

**Verdict**: Not implemented (expected). Correct separation in principle — the platform doesn't need to know about music or merch.

#### Report Abuse Component
**File**: `components/report-abuse.tsx`

This is a **platform capability** — any multi-tenant platform needs content moderation. The implementation is minimal (just a form that tracks via Vercel Analytics), but the pattern is correct.

**Verdict**: Platform capability, under-implemented but architecturally sound.

#### CTA Component
**File**: `components/cta.tsx`

The CTA shows only for specific domains (`demo.multi-band.com` or `multi-band.com`). This is **template scaffolding**, not a platform or vertical feature. It should be removed or made configurable.

**Verdict**: Template artifact. Not platform, not vertical — just leftover scaffolding.

### 3. Band Features That Would Naturally Become Reusable Modules

These are band-specific features whose *pattern* is generic enough that another vertical could adopt them with minimal changes.

#### Post Model → Generic Content Items
**File**: `prisma/schema.prisma` → `Post`

The Post model has: `title`, `description`, `content` (MDX), `slug`, `image`, `imageBlurhash`, `published`, `createdAt`, `updatedAt`. These fields are **generic enough for any vertical**. A restaurant could use them for "menu items," a photographer for "gallery entries," a consultant for "case studies."

The only band-specific aspect is the *naming* (`Post`) and the *presentation* (blog grid). The data model itself is vertical-agnostic.

**Future module**: Rename to `ContentItem` or keep as `Post` but add a `contentType` enum. The schema doesn't need to change — just the presentation layer per tenant.

#### SocialMediaLink → Generic Embeds
**File**: `prisma/schema.prisma` → `SocialMediaLink`

The table has: `featuredEmbed`, `link`, `siteId`. This is **generic enough for any vertical**. A restaurant could store a Google Maps embed, a photographer an Instagram feed URL, a consultant a Calendly link.

**Future module**: Rename to `Embed` or `Widget` with a `type` field (youtube, instagram, google-maps, calendly, spotify). The schema change is one column addition.

#### Font/Theme Selection → Generic Branding
**File**: `prisma/schema.prisma` → `Site.font`, `tailwind.config.js`

The font mapper and DaisyUI themes are **generic branding infrastructure**. A restaurant picks fonts/colors, a photographer picks fonts/colors. The current options (Cal Sans, Lora, Work Sans + light/dark/cupcake themes) are limited but the *pattern* is correct.

**Future module**: Expand theme options per-tenant. The platform already supports per-tenant font selection — just needs more options and color palette controls.

#### Custom Domain → Generic Domain Management
Already covered in Section 1. This is a platform capability that any vertical inherits for free.

#### File Upload → Generic Media Library
**File**: `app/api/upload/route.ts`

Vercel Blob upload is **generic media storage**. A restaurant uploads menu photos, a photographer uploads portfolio images, a band uploads cover art. The platform doesn't care what the files are.

**Future module**: Add a media library UI component that lists uploaded files per tenant. The infrastructure already exists.

### 4. Architectural Boundaries Already Worth Preserving

These boundaries **already exist** in the codebase and should be consciously maintained as the platform grows.

#### Boundary 1: `lib/` vs `components/`
Platform logic lives in `lib/` (auth, domains, fetchers, utils). UI components live in `components/`. This separation is clean — platform code has no React dependencies, and components have no direct database access (they use fetchers).

**Preserve**: Keep `lib/` free of React imports. Keep components using fetchers rather than direct Prisma calls.

#### Boundary 2: `[domain]/` Route Group
The tenant-facing routes (`[domain]/layout.tsx`, `[domain]/page.tsx`, `[domain]/[slug]/page.tsx`) are the **only place** where platform meets vertical. Everything else (middleware, auth, dashboard, API routes) is platform-only.

**Preserve**: The tenant route group should be the *only* place that makes assumptions about what a tenant's homepage looks like. If another vertical needs a different homepage layout, it should be configurable per-tenant, not a code change.

#### Boundary 3: Dashboard (`app/app/(dashboard)/`) vs Public (`[domain]/`)
The dashboard is admin-only and platform-generic. The public routes are tenant-branded but currently blog-centric. These two zones are **correctly separated** — admin doesn't leak into public and vice versa.

**Preserve**: Keep dashboard components generic (site list, post list, stats). Don't add band-specific widgets to the dashboard without making them opt-in per-tenant.

#### Boundary 4: Server Actions (`lib/actions/`) vs API Routes (`app/api/`)
Server actions handle CRUD for Site and Post. API routes handle Vercel-specific operations (upload, generate, domain verify). This separation is **accidental but useful** — server actions are tenant-resource operations, API routes are infrastructure operations.

**Preserve**: Don't mix infrastructure calls into server actions or vice versa. Keep the pattern: server actions = "tenant does X to their resource," API routes = "platform does Y on behalf of tenant."

#### Boundary 5: Schema Models — Platform vs Vertical
The schema has a clear split:
- **Platform models**: `User`, `Account`, `Session`, `VerificationToken` (auth), `Site` (tenant), `Post` (content), `SocialMediaLink` (embeds)
- **Vertical/orphaned models**: `YouTube`, `Facebook`, `Instagram`, `Example` (dead code)

**Preserve**: New vertical features should add new models (e.g., `Show`, `Track`, `Venue`) without modifying platform models. The `Site` model is the only place where platform and vertical data meet — keep it lean.

### 5. Where the Platform Is Accidentally Coupled to Bands

These are places where the codebase **assumes bands** when it shouldn't have to. They're not architectural disasters, but they narrow what the platform can do without code changes.

#### Coupling 1: Tenant Homepage Layout is Blog-First
**File**: `app/[domain]/page.tsx`

The tenant homepage has three hardcoded sections:
1. Hero image (generic — OK)
2. Blog post grid (vertical-specific — **problem**)
3. YouTube iframe embed (vertical-specific — **problem**)

A restaurant, photographer, or consultant landing on a tenant site would see a blog with a YouTube video. The platform is making vertical decisions about the public-facing experience.

**Impact**: High. This is the most visible boundary violation. Every visitor to every tenant site sees band-centric content.

**Smallest fix**: Make the homepage layout configurable per-tenant (e.g., a `homepageLayout` field: `blog`, `grid`, `hero`, `custom`). Or better: allow tenants to define their own homepage sections via a WYSIWYG or block-based editor.

#### Coupling 2: `bandName` Field Semantics
**File**: `prisma/schema.prisma` → `Site.bandName`

The field exists but is unused in queries and not displayed prominently. It's semantically band-specific. A restaurant owner would find this confusing.

**Impact**: Low (it's unused). But it signals that the schema was designed for bands, not a generic platform.

**Smallest fix**: Rename to `displayName` or remove if unused.

#### Coupling 3: `message404` Has British Colloquialism
**File**: `prisma/schema.prisma` → `Site.message404` default: `"Blimey! You've found a page that doesn't exist."`

This is template flavor text, not a platform concern. A restaurant in Tokyo wouldn't want this.

**Impact**: Negligible (it's configurable per-tenant). But it reveals template DNA.

**Smallest fix**: Change default to something neutral like `"Page not found."`

#### Coupling 4: `createSite` Creates YouTube Embed by Default
**File**: `lib/actions/actions.ts` → `createSite()`

When creating a site, the server action always creates a `SocialMediaLink` with `featuredEmbed: "add your embed under settings"`. This assumes every tenant needs a social media embed. A consultant might not.

**Impact**: Low (it's just a placeholder). But it shows the platform assumes band social presence.

**Smallest fix**: Make social media links optional during site creation, or add a `hasSocialPresence` boolean to Site.

#### Coupling 5: Nav Icons Are Blog-Centric
**File**: `components/nav.tsx`

The navigation uses icons like `Newspaper`, `Edit3`, `Megaphone` — all blog/content-creation oriented. A restaurant owner navigating their dashboard would see content-creation metaphors, not business-management metaphors.

**Impact**: Low (cosmetic). But it reinforces the vertical assumption in the admin experience.

**Smallest fix**: Add configurable nav items per-tenant or use generic icons (Layout, Settings, Users) that work for any vertical.

#### Coupling 6: `generateStaticParams()` Hardcoded to "demo"
**File**: `app/[domain]/page.tsx` and `app/[domain]/[slug]/page.tsx`

Both have `where: { site: { subdomain: "demo" } }` in their `generateStaticParams()`. This is a **template artifact** that prevents SSG for real tenants. It's not band-specific per se, but it's a leftover from the template that breaks production deployment.

**Impact**: Medium (breaks SSG for all tenants). But it's a simple fix.

**Smallest fix**: Remove the `where` filter or make it configurable via env var.

#### Coupling 7: Dashboard Terminology is Blog-Centric
**File**: `app/app/(dashboard)/page.tsx`

The dashboard shows "Top Sites" and "Recent Posts." The stats component (`overview-stats.tsx`) uses Tremor charts with hardcoded visitor data. A restaurant owner would see "sites" (OK) but "posts" (confusing — they'd expect "menu items" or "reviews").

**Impact**: Low (terminology only). But it reinforces the vertical assumption in the admin experience.

**Smallest fix**: Make dashboard labels configurable per-tenant, or use generic terms ("Content" instead of "Posts").

### 6. Smallest Path to an Outstanding Band Platform Without Over-Engineering

Based on the analysis above, here is the **minimal set of changes** that would make this an outstanding platform for bands without abstracting for hypothetical future customers.

#### Tier 1: Fix What's Broken (No Abstraction Needed)

| Change | Why | Effort |
|--------|-----|--------|
| Remove `where: { subdomain: "demo" }` from `generateStaticParams()` in both `[domain]/page.tsx` and `[domain]/[slug]/page.tsx` | SSG doesn't work for real tenants. This is a template artifact, not a band feature. | Low |
| Replace home page placeholder (`app/home/page.tsx`) with actual landing page | The platform has no entry point for new visitors. | Low |
| Wire up the three empty dashboard directories (`band/[id]`, `site/[id]`, `post/[id]`) | Dashboard is incomplete — users can create sites but can't manage them after creation. | Medium |
| Remove orphaned schema models (`YouTube`, `Facebook`, `Instagram`, `Example`) | Dead code that confuses the data model. | Low |
| Remove `/api/migrate` dead code | Commented-out migration script in the codebase. | Low |

#### Tier 2: Separate Platform from Vertical (Minimal Changes)

| Change | Why | Effort |
|--------|-----|--------|
| Make tenant homepage layout configurable per-tenant | The hardcoded blog grid + YouTube embed is the deepest vertical coupling. Fix by adding a `homepageLayout` field to Site (`blog`, `hero`, `grid`, `custom`). | Medium |
| Rename `bandName` to `displayName` on Site | Semantic correctness for future verticals, without changing functionality. | Low |
| Make social media links optional during site creation | Not every tenant needs them. The current code always creates one. | Low |
| Change `message404` default to neutral text | Template flavor text that doesn't belong in a platform default. | Trivial |

#### Tier 3: Band Features That Prove the Platform (Vertical-Only)

These are band-specific features that **prove the platform works** for its first vertical without touching platform code:

| Feature | Where It Lives | Why |
|---------|---------------|-----|
| Shows/tour dates | New `Show` model + `components/band/shows.tsx` | Core band need. Purely vertical. |
| Music/track player | New `Track` model + `components/band/player.tsx` | Core band need. Purely vertical. |
| Band members | New `Member` model + `components/band/members.tsx` | Core band need. Purely vertical. |
| Video gallery | New `Video` model + `components/band/gallery.tsx` | Core band need. Purely vertical. |
| Photo gallery | New `Photo` model + `components/band/photos.tsx` | Core band need. Purely vertical. |

**Key insight**: All of these live in new models and new components. They don't touch `lib/`, middleware, auth, or the tenant routing layer. The platform boundary is preserved by design — these are *additions*, not modifications to platform code.

#### What NOT to Do (Anti-Patterns to Avoid)

| Anti-Pattern | Why It's Wrong |
|-------------|----------------|
| Abstract `Site` into a generic `Tenant` with `tenantType` enum | Premature abstraction. You don't know what other verticals need yet. |
| Create a "widget system" for homepage layouts | Over-engineering. A simple `homepageLayout` field solves the immediate problem. |
| Build a plugin system for vertical features | Bands don't need plugins. They need features that work. Plugins are for platforms with developers. |
| Rename everything to be "industry-neutral" now | Confuses the current use case. `bandName` is fine as long as it's configurable. |
| Add multi-tenant database schemas (row-level security, tenant_id on every table) | Overkill for Vercel Postgres with Prisma. The current `siteId` foreign key pattern is sufficient. |

### Summary: Platform vs Vertical Map

```
┌─────────────────────────────────────────────────────────┐
│                    PLATFORM LAYER                       │
│  (Generic — serves any vertical)                        │
├─────────────────────────────────────────────────────────┤
│  middleware.ts           Multi-tenant routing           │
│  lib/auth.ts            Identity & authorization       │
│  lib/domains.ts         Custom domain management       │
│  lib/fetchers.ts        Tenant data resolution         │
│  app/api/upload/        File storage                   │
│  app/api/generate/      AI content generation          │
│  components/modal/      Modal system                   │
│  components/form/       Form infrastructure            │
│  prisma: User, Account, Session       Auth models      │
│  prisma: Site (core fields)           Tenant entity    │
│  prisma: Post (core fields)           Content model    │
├─────────────────────────────────────────────────────────┤
│                    VERTICAL LAYER                       │
│  (Band-specific — first implementation)                 │
├─────────────────────────────────────────────────────────┤
│  app/[domain]/page.tsx  Blog-first homepage layout     │
│  components/posts.tsx   Blog post grid                 │
│  components/editor.tsx  MDX blog editor                │
│  prisma: bandName       Band-specific field name       │
│  prisma: SocialMediaLink Band social presence          │
│  components/nav.tsx     Blog-centric nav icons         │
│  components/cta.tsx     Template scaffolding           │
├─────────────────────────────────────────────────────────┤
│                    DEAD CODE                            │
├─────────────────────────────────────────────────────────┤
│  prisma: YouTube, Facebook, Instagram   Orphaned       │
│  prisma: Example                        Template artifact│
│  app/api/migrate/           Commented-out migration    │
│  app/[domain]/[id]/         Empty directories          │
└─────────────────────────────────────────────────────────┘
```

**The platform layer is already clean.** The vertical coupling exists almost entirely in the **presentation layer** (`app/[domain]/` routes and `components/`). The data model, routing, auth, and infrastructure are all generic.

**The smallest path forward**: Fix the broken template artifacts (Tier 1), make the homepage layout configurable (Tier 2), then build band features as pure vertical additions (Tier 3). No abstraction needed. The platform emerges naturally from solving bands' problems well.

---

## 12. GitHub Planning — First 15 Issues

### Issue 1: Replace home page placeholder with actual landing page
**Description**: The home page at `/home/page.tsx` currently displays only "Welcome to the Multi-band platform!" text. Replace with a proper landing page that explains the platform, shows features, and has a CTA to sign up.
**Acceptance Criteria**:
- [ ] Landing page renders on root domain
- [ ] Includes hero section with value proposition
- [ ] Includes feature highlights
- [ ] Includes "Get Started" button linking to login
**Labels**: `enhancement`, `frontend`, `priority-high`
**Dependencies**: None

### Issue 2: Add Google OAuth as authentication provider
**Description**: Currently only GitHub OAuth is supported. Add Google OAuth as an alternative provider to allow non-GitHub users to sign up.
**Acceptance Criteria**:
- [ ] Google OAuth provider configured in NextAuth
- [ ] Login page shows both GitHub and Google options
- [ ] Users can switch between providers
**Labels**: `enhancement`, `authentication`, `priority-high`
**Dependencies**: None

### Issue 3: Implement band member management
**Description**: Bands need multiple members. Add ability for site owners to invite members, assign roles (admin/member), and manage member lists.
**Acceptance Criteria**:
- [ ] New `BandMember` model in Prisma schema
- [ ] Invite flow via email
- [ ] Role-based access (admin vs member)
- [ ] Member list UI in site settings
**Labels**: `enhancement`, `data-model`, `priority-high`
**Dependencies**: None

### Issue 4: Implement music/track management
**Description**: Core band feature — allow bands to upload and display music tracks on their site.
**Acceptance Criteria**:
- [ ] New `Track` model in Prisma schema (title, audioUrl, duration, album, releasedAt)
- [ ] Audio upload via Vercel Blob
- [ ] Audio player component
- [ ] Tracks displayed on band homepage
**Labels**: `enhancement`, `data-model`, `priority-high`
**Dependencies**: None

### Issue 5: Implement show/tour dates management
**Description**: Bands need to promote upcoming shows. Add show management with venue, date, ticket link, and status.
**Acceptance Criteria**:
- [ ] New `Show` model (title, date, venue, city, state, country, ticketUrl, status)
- [ ] Show creation/editing UI
- [ ] Shows displayed on band homepage
- [ ] Past shows archived automatically
**Labels**: `enhancement`, `data-model`, `priority-high`
**Dependencies**: None

### Issue 6: Wire up empty dashboard sub-pages (band/[id], site/[id], post/[id])
**Description**: Three route group directories exist but contain no files. Implement the missing pages for band management, site settings, and post editing.
**Acceptance Criteria**:
- [ ] `/band/[id]` shows band overview with members, stats, quick actions
- [ ] `/site/[id]` shows full site configuration (existing settings expanded)
- [ ] `/post/[id]` redirects to editor (or implements dedicated post edit page)
**Labels**: `enhancement`, `frontend`, `priority-high`
**Dependencies**: None

### Issue 7: Wire up SocialMediaLink management UI
**Description**: The `SocialMediaLink` model exists but there's no UI to manage social media links. Build a settings section for this.
**Acceptance Criteria**:
- [ ] Social links section in site settings
- [ ] Add/remove social links with platform detection
- [ ] Featured embed preview for each platform
**Labels**: `enhancement`, `frontend`, `priority-medium`
**Dependencies**: None

### Issue 8: Add video gallery component
**Description**: Bands need to showcase music videos and live performances. Add a video gallery that supports YouTube/Vimeo embeds.
**Acceptance Criteria**:
- [ ] New `Video` model (title, embedUrl, thumbnail, platform, publishedAt)
- [ ] Video grid component for band homepage
- [ ] Individual video page with embed player
**Labels**: `enhancement`, `frontend`, `priority-medium`
**Dependencies**: None

### Issue 9: Deduplicate domain resolution logic
**Description**: The pattern `domain.endsWith(ROOT_DOMAIN)` is repeated in middleware, fetchers, and layout components. Extract into a shared utility.
**Acceptance Criteria**:
- [ ] New `lib/tenant.ts` with `resolveTenant(domain)` function
- [ ] All callers use the new utility
- [ ] Tests verify subdomain vs custom domain resolution
**Labels**: `refactor`, `technical-debt`, `priority-medium`
**Dependencies**: None

### Issue 10: Remove dead code models (YouTube, Facebook, Instagram standalone)
**Description**: Three orphaned models exist in the schema with no relations or UI. Clean them up.
**Acceptance Criteria**:
- [ ] Remove `YouTube`, `Facebook`, `Instagram` models from schema
- [ ] Remove related migration files
- [ ] Run `prisma migrate` successfully
- [ ] Verify no code references these models
**Labels**: `cleanup`, `technical-debt`, `priority-low`
**Dependencies**: None

### Issue 11: Add basic E2E tests for multi-tenant routing
**Description**: Zero test coverage exists. Add Playwright E2E tests for the most critical flow: multi-tenant routing.
**Acceptance Criteria**:
- [ ] Test: subdomain tenant resolves correctly
- [ ] Test: custom domain tenant resolves correctly
- [ ] Test: non-existent tenant shows 404
- [ ] Test: admin auth gating works
**Labels**: `testing`, `quality`, `priority-medium`
**Dependencies**: None

### Issue 12: Add band photo gallery
**Description**: Bands need to showcase live photos, promo shots, and press materials.
**Acceptance Criteria**:
- [ ] New `Photo` model (url, caption, uploadedAt, album)
- [ ] Photo upload via Vercel Blob
- [ ] Grid gallery component for band homepage
- [ ] Lightbox view for individual photos
**Labels**: `enhancement`, `frontend`, `priority-medium`
**Dependencies**: None

### Issue 13: Add press kit (EPK) download per band
**Description**: Press needs electronic press kits. Allow bands to create downloadable EPDs with bio, photos, music links, and contact info.
**Acceptance Criteria**:
- [ ] New `PressKit` model with sections (bio, photos, music, contact)
- [ ] PDF generation or HTML EPK page
- [ ] Download button on band site
**Labels**: `enhancement`, `frontend`, `priority-low`
**Dependencies**: None

### Issue 14: Add mailing list integration
**Description**: Bands need direct fan communication. Integrate with a mailing list provider (Mailchimp, Resend, or custom).
**Acceptance Criteria**:
- [ ] Mailing list signup form on band site
- [ ] Subscriber management in dashboard
- [ ] Email provider integration (Resend recommended)
**Labels**: `enhancement`, `integration`, `priority-low`
**Dependencies**: None

### Issue 15: Add environment variable validation on startup
**Description**: Missing required env vars cause runtime failures with no graceful degradation. Add validation at app startup.
**Acceptance Criteria**:
- [ ] Zod schema defining all required env vars
- [ ] Validation runs on server startup
- [ ] Clear error messages for missing vars
- [ ] Development vs production validation modes
**Labels**: `devops`, `reliability`, `priority-low`
**Dependencies**: None

---

## 13. Questions (Cannot Be Answered from Repository Alone)

1. **What is the intended deployment target?** The codebase is deeply coupled to Vercel (Blob, KV, Domains API, Postgres). Is Vercel a hard requirement, or should this be self-hostable?

2. **What is `NEXT_PUBLIC_ROOT_DOMAIN` set to in production?** The middleware logic depends entirely on this value. Without knowing it, I can't verify the routing works for your actual domain setup.

3. **Is there an existing database with data?** The migrations are minimal (3 from initial setup). Is there production data that needs to be preserved?

4. **What is the band onboarding flow?** How do real bands sign up, get their site provisioned, and configure it? The current flow creates a "site" but doesn't map cleanly to a "band."

5. **Is `bandName` on Site intended to be the primary band identifier?** It exists as a field but is never used in queries or displayed prominently. Is this intentional or incomplete?

6. **What is the relationship between the three empty directories** `(dashboard)/band/[id]/`, `(dashboard)/site/[id]/`, and `(dashboard)/post/[id]/`? Are these intended to be separate management surfaces, or was the plan to consolidate them?

7. **Are YouTube/Facebook/Instagram standalone models intentionally orphaned**, or was there a plan to relate them to Site that was never implemented?

8. **What is the monetization model?** Is this free for bands, subscription-based, or commission-based? This affects what features are worth building first.

9. **Is there a content moderation workflow?** The `ReportAbuse` component exists but just shows a toast. Is there an admin review queue?

10. **What is the target scale?** Single-band usage has different requirements than a platform serving hundreds of bands. Are there multi-tenant isolation requirements beyond what Prisma provides?

---

## 14. Reconnaissance Summary

**Overall Assessment**: This is a **solid multi-tenant foundation** inherited from Vercel's Platforms Starter Kit, with the band-specific layer partially started but far from complete. The routing, authentication, and custom domain infrastructure are production-quality. The band-specific features (members, music, shows, videos, merch, galleries) are entirely absent.

**What to keep from the template**: Multi-tenant routing middleware, custom domain management, Novel editor, Vercel Blob upload, AI content generation, modal system, domain verification flow, server action authorization pattern.

**What to simplify/replace**: GitHub-only auth (add Google), orphaned schema models (remove), dead API routes (remove), duplicated domain resolution (extract utility), hardcoded "demo" in SSG params (fix), empty dashboard directories (implement or remove).

**Bottom line**: The foundation is strong enough to build upon. The work ahead is primarily **band-specific feature development**, not architectural overhaul.
