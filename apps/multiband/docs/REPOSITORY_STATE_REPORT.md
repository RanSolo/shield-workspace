# Repository State Report

**Evidence-based inventory of current codebase vs. Flight Plan Epics.**  
*Date: 2026-06-28*

---

## How to Read This Report

Each row states a fact about the repository at the time of this writing. Evidence points to specific files or code. Confidence reflects how certain I am that the state is accurate and stable (not transient or accidental).

---

## Epic 1 — First Band Success

| Item | Current State | Evidence | Confidence | Gap |
|------|--------------|----------|------------|-----|
| Authentication | **Complete.** GitHub OAuth via NextAuth with JWT strategy. Login page at `/app/(auth)/login/page.tsx`. | `lib/auth.ts` — `GitHubProvider`, Prisma adapter, `getSession()`, `withSiteAuth()`. `app/app/(auth)/login/page.tsx` — renders `LoginButton`. | High | None |
| Dashboard overview | **Complete.** Lists top sites and recent posts with Suspense fallbacks. | `app/app/(dashboard)/page.tsx` — renders `<Sites limit={4}>` and `<Posts limit={8}>`. | High | None |
| Site creation | **Complete.** Modal component + Server Action. | `components/modal/create-site.tsx` + `lib/actions/actions.ts::createSite()`. | High | None |
| Site editing (name, description, bio) | **Complete.** Settings page with Form components wired to `updateSite`. | `app/app/(dashboard)/site/[id]/settings/page.tsx` — Band Name, Name, Description, Bio forms. | High | None |
| Site deletion | **Complete.** Delete form component + Server Action. | `components/form/delete-site-form.tsx` + `lib/actions/actions.ts`. | High | None |
| Branding fields (logo, cover, font) | **Partially complete.** Fields exist on Site model and in update action. UI for logo/cover upload present in settings form but not explicitly labeled as branding controls. | `prisma/schema.prisma::Site` — `logo`, `image`, `imageBlurhash`, `font` fields. Settings page has name/description/bio forms but no explicit logo/cover upload forms. | Medium | Logo and cover image upload UI not explicitly exposed in site settings |
| Basic settings | **Complete.** Site settings page covers name, description, bio. | `app/app/(dashboard)/site/[id]/settings/page.tsx`. | High | None |
| Tenant creation | **Complete.** `createSite` Server Action creates Site + SocialMediaLink + connects User. | `lib/actions/actions.ts::createSite()` — `prisma.site.create()` with nested `socialMediaLinks.create`. | High | None |
| Initial publishing | **Partially complete.** Posts can be created and published, but no "publish now" button visible in current code. Draft toggle exists (`Post.published` boolean) but UI flow not verified. | `Post.published` boolean field in schema. Editor component accepts a post prop. | Medium | Publish/unpublish toggle UI may be in Editor component — needs verification |
| Subdomain generation | **Complete.** Auto-generates 7-char nanoid subdomain on site creation. | `lib/actions/actions.ts::createSite()` — `nanoid()` call. | High | None |

---

## Epic 2 — Band Content

| Item | Current State | Evidence | Confidence | Gap |
|------|--------------|----------|------------|-----|
| Blog posts (CRUD) | **Complete.** Create via Server Action, read via fetcher, update via `updatePostMetadata`, delete via `DeletePostForm`. | `lib/actions/actions.ts::createSite/createPost/updatePost/deletePost` + `components/form/delete-post-form.tsx`. | High | None |
| Rich text editor | **Complete.** Novel MDX editor component wired to post edit page. | `components/editor.tsx` — Novel editor. `app/app/(dashboard)/band/[id]/page.tsx` — renders `<Editor post={data}>`. | High | None |
| Images | **Complete.** Vercel Blob upload integrated. Image upload form in post settings. | `@vercel/blob` dependency + `put()` in actions. `components/uploader.tsx`. Post settings has thumbnail image form. | High | None |
| Publishing workflow | **Partially complete.** `Post.published` boolean exists. Editor component likely contains publish toggle. But draft management (multiple statuses) not implemented — only published/draft binary. | `prisma/schema.prisma::Post.published` — Boolean, default false. No `status` enum. | Medium | Draft/published is binary only. No scheduled publishing, no version history. |
| Draft management | **Partially complete.** Binary draft/published state via boolean. No draft listing or draft-specific UI. | `Post.published` boolean. Dashboard shows all posts (no draft filter). | Medium | No dedicated draft view or draft count in dashboard stats |
| Social links | **Partially complete.** `SocialMediaLink` model exists with `featuredEmbed` and `link` fields. One social link auto-created on site creation. But no UI to manage multiple social links. | `prisma/schema.prisma::SocialMediaLink`. `createSite()` creates one default link. No settings page for managing them. | Medium | Model exists but management UI is absent. Only 1 link supported (no list). |

---

## Epic 3 — Public Band Experience

| Item | Current State | Evidence | Confidence | Gap |
|------|--------------|----------|------------|-----|
| Tenant homepage | **Complete.** Shows cover image, blog post links, and embedded content (iframe). | `app/[domain]/page.tsx` — renders cover `<Image>`, post title links, and `<Iframe url={data.featuredEmbed}>`. | High | None |
| Branding rendering | **Partially complete.** Logo rendered in tenant header. Font applied via `fontMapper`. Cover image rendered. But bio not displayed on homepage. | `app/[domain]/layout.tsx` — renders `data.logo` and `data.name`. `fontMapper[data.font]` applied to root div. Homepage has no bio section. | Medium | Band bio not visible on tenant homepage |
| Bio | **Partially complete.** `Site.bio` field exists in schema. Site settings has a "Bio" form (but incorrectly maps to `description` input name). No UI displays bio on public page. | `prisma/schema.prisma::Site.bio`. Settings page has bio form with `name="description"` (bug: wrong field). Tenant homepage does not render bio. | Medium | Bio stored but never displayed publicly. Settings form writes to wrong field. |
| Responsive layout | **Partially complete.** Tailwind responsive classes present (`sm:`, `md:`, `lg:` prefixes). Not verified with actual device testing. | Throughout tenant pages — `sm:flex-row`, `lg:w-5/6`, etc. | Low | No responsive audit performed. Some layouts may break at specific breakpoints. |
| SEO | **Partially complete.** Dynamic metadata via `generateMetadata()` on tenant layout and post pages. OpenGraph tags present. Twitter card present. Missing: structured data, sitemap for tenants. | `app/[domain]/layout.tsx::generateMetadata()` — title, description, OG images, Twitter card. `sitemap.ts` exists but needs verification. | Medium | Sitemap generation for tenants not verified. No structured data (JSON-LD). |
| OpenGraph | **Complete.** OG images generated per tenant via Next.js image API. | `app/[domain]/[slug]/opengraph-image.tsx`. `generateMetadata()` returns `openGraph.images`. | High | None |
| Post pages | **Complete.** MDX rendering with custom components (tweets, links). Cover image + metadata. | `app/[domain]/[slug]/page.tsx` — renders `<MDX>` component with blog card. | High | None |
| Performance | **Unknown.** No Lighthouse baseline. Image optimization via Next.js `<Image>` with blurhash placeholders. | `BlurImage` component, `placeholderBlurhash`, Vercel Blob for images. | Low | No performance metrics exist. |
| Accessibility | **Unknown.** Some semantic HTML present (h1, h2, link). No ARIA audit. No keyboard navigation verification. | Tenant pages use `<Link>`, `<h1>`, `<h2>`. Login page has basic structure. | Low | No accessibility audit performed. |

---

## Epic 4 — Publishing

| Item | Current State | Evidence | Confidence | Gap |
|------|--------------|----------|------------|-----|
| Custom domains | **Complete.** Add domain via Server Action + Vercel Domains API. Stored in `Site.customDomain`. | `lib/domains.ts` — `addDomainToVercel()`. `prisma/schema.prisma::Site.customDomain` with unique constraint. | High | None |
| Domain verification | **Complete.** `/api/domain/[slug]/verify` endpoint checks Vercel Domains API for configuration status. | `app/api/domain/[slug]/verify/route.ts`. `lib/domains.ts::configuredBy()`, `misconfigured()`. | High | None |
| DNS guidance | **Complete.** `domain-configuration.tsx` component shows DNS records needed. | `components/form/domain-configuration.tsx`. | High | None |
| Subdomain management | **Complete.** Auto-generated on creation. Editable via site settings (name field affects display, subdomain itself not directly editable in UI). | `lib/actions/actions.ts::createSite()` — nanoid generation. No explicit "change subdomain" form in settings. | Medium | No UI to change subdomain after creation |
| Production deployment | **Unknown.** Build script exists (`next build`). Deployment platform assumed Vercel. No CI/CD configuration found. | `package.json::build` — `"prisma generate && prisma db push && next build"`. No GitHub Actions, no Netlify config. | Low | No deployment automation configured |
| Domain redirect | **Partially complete.** Optional redirect from subdomain to custom domain via env var `REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS`. | `app/[domain]/layout.tsx` — checks env var and calls `redirect()`. | High | Opt-in only, not user-configurable from dashboard |

---

## Epic 5 — Platform Completion

| Item | Current State | Evidence | Confidence | Gap |
|------|--------------|----------|------------|-----|
| Environment setup | **Partially complete.** 10+ env vars required (documented in TECHNICAL_DESIGN.md). No `.env.example` file found. | `TECHNICAL_DESIGN.md::Required env vars` — `AUTH_GITHUB_ID/SECRET`, `POSTGRES_PRISMA_URL`, `BLOB_READ_WRITE_TOKEN`, etc. | Medium | No `.env.example` template file |
| Build pipeline | **Complete.** dev, build, format scripts present. Prisma generate in build. | `package.json::scripts` — `dev`, `build`, `format`, `lint`, `start`. | High | None |
| Documentation | **Partially complete.** README is one line. TECHNICAL_DESIGN.md exists (recon report). No CONTRIBUTING, no ARCHITECTURE doc. | `README.md` — "White label front end for my bands websites." | Medium | README needs expansion. No setup instructions. |
| Testing | **Absent.** No test framework installed. No `__tests__` directories. No test scripts in package.json. | `package.json::devDependencies` — no jest, vitest, playwright, or testing-library. | High | Complete gap — zero test infrastructure |
| Error handling | **Partially complete.** `notFound()` used in pages. Basic error returns in Server Actions. No global error boundary beyond Next.js defaults. | `app/[domain]/page.tsx::notFound()`. `createSite()` returns `{ error: "Not authenticated" }`. | Medium | No custom error pages, no error logging, no retry logic |
| Multi-tenant verification | **Partially complete.** Ownership checks via `withSiteAuth()` in Server Actions. Fetcher functions (`getSiteData`, `getPostData`) have no auth — correct for public pages but boundary is implicit. | `lib/auth.ts::withSiteAuth()` — verifies `site.userId === session.user.id`. | Medium | No automated verification that all routes have proper isolation |
| Security review | **Absent.** No dependency audit (no `npm audit` results). GitHub OAuth only (no email/password = fewer attack surface, but also limits users). | `lib/auth.ts` — `GitHubProvider` only. No rate limiting on tenant lookup. | Medium | No security audit performed. Some orphaned models may confuse future developers. |
| Performance tuning | **Absent.** No performance monitoring. No CDN configuration beyond Next.js defaults. | No `next.config.js` optimization beyond image domains. | Low | No performance baseline or tuning |

---

## Epic 6 — Launch Polish

| Item | Current State | Evidence | Confidence | Gap |
|------|--------------|----------|------------|-----|
| Landing page | **Absent.** Home page displays only "Welcome to the Multi-band platform!" text. | `app/home/page.tsx` — single div with static text. | High | Complete gap — placeholder needs replacement |
| Empty states | **Partially complete.** Suspense fallbacks show placeholder cards when data is loading. No explicit "no sites yet" or "no posts yet" empty states. | `app/app/(dashboard)/page.tsx` — `<PlaceholderCard>` in Suspense fallback. | Medium | No branded empty states for first-time users |
| Loading states | **Partially complete.** Loading components exist (`loading-dots`, `loading-spinner`, `loading-circle`). Used in some forms but not systematically across the app. | `components/icons/loading-dots.tsx`, `loading-spinner.tsx`, `loading-circle.tsx`. | Medium | Inconsistent loading state coverage |
| Responsive audit | **Absent.** Tailwind classes present but no device testing or audit performed. | Throughout codebase — responsive prefixes used but not verified. | Low | Complete gap — needs systematic audit |
| Accessibility audit | **Absent.** No ARIA labels, no keyboard nav testing, no screen reader verification. | Code uses semantic HTML but no explicit accessibility attributes. | Low | Complete gap — needs systematic audit |
| Lighthouse goals | **Absent.** No Lighthouse config or CI integration. | No `.lighthouserc.json` or similar. | High | Complete gap — no baseline exists |
| Analytics | **Partially complete.** `@vercel/analytics` installed as dependency but not wired into tenant pages or dashboard. | `package.json::dependencies` — `"@vercel/analytics": "^1.1.1"`. Not imported in any page file. | Medium | Installed but not integrated |
| UX polish | **Unknown.** Some UI components present (Tremor + DaisyUI). Modal system exists. But overall consistency not verified. | `@tremor/react` and `daisyui` dependencies. `components/modal/` system. | Low | No consistency audit performed |

---

## Technical Debt Inventory

| Item | Location | Description |
|------|----------|-------------|
| Orphaned Prisma models | `prisma/schema.prisma` | `YouTube`, `Facebook` models have no foreign keys, no UI, no code references. Dead code from template fork. |
| `SocialMediaLink` underutilized | `prisma/schema.prisma` | Model exists but only 1 link auto-created on site creation. No platform type field (Instagram/YouTube/Twitter). No display order. |
| Bio form writes to wrong field | `app/app/(dashboard)/site/[id]/settings/page.tsx` | Bio form has `name="description"` — saves bio text to the description field instead of bio. |
| Hardcoded "demo" in SSG | `app/[domain]/page.tsx`, `app/[domain]/[slug]/page.tsx` | `generateStaticParams()` filters `where: { subdomain: "demo" }` — only pre-renders demo tenant routes. |
| Console.log statements | Multiple files | Debug `console.log('data', data)` and `console.log('session.user', session.user)` present in production code. |
| Missing `getSession()` check | `app/app/(dashboard)/site/[id]/settings/page.tsx` | Site settings page does not call `getSession()` — relies on middleware or layout auth. Potential ownership bypass if accessed directly. |
| `react-iframe` dependency | `package.json` | Used only in tenant homepage for featuredEmbed. Could be replaced with Vercel `<iframe>` or native iframe. |
| Migration script commented out | Repository root | `api/migrate/route.ts` is dead code (commented out). |

---

## Summary Matrix

| Epic | Fully Complete | Partially Complete | Absent / Major Gap |
|------|---------------|-------------------|-------------------|
| **Epic 1 — First Band Success** | 7 items | 2 items | 0 items |
| **Epic 2 — Band Content** | 3 items | 3 items | 0 items |
| **Epic 3 — Public Band Experience** | 4 items | 3 items | 2 items (performance, accessibility) |
| **Epic 4 — Publishing** | 3 items | 2 items | 1 item (production deployment) |
| **Epic 5 — Platform Completion** | 2 items | 3 items | 3 items (testing, security review, performance tuning) |
| **Epic 6 — Launch Polish** | 0 items | 3 items | 4 items (landing page, responsive audit, accessibility audit, Lighthouse) |

**Total: 19 complete · 16 partial · 10 absent/major gap**

---

*This report reflects the repository state at time of writing. It will become stale as implementation progresses. That is expected.*
