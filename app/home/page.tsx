import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Disc3,
  Globe2,
  Megaphone,
  Newspaper,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Multi-Band | Band Site in a Box",
  description:
    "A simple way for independent bands to launch a branded website, publish updates, and connect a custom domain.",
};

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const appUrl = rootDomain.includes("localhost")
  ? `http://app.${rootDomain}/login`
  : `https://app.${rootDomain}/login`;

const features = [
  {
    icon: Globe2,
    title: "Your own address",
    description: "Point your band domain at a site fans can remember and share.",
  },
  {
    icon: Newspaper,
    title: "Updates that feel alive",
    description: "Post release news, show recaps, announcements, and stories from the road.",
  },
  {
    icon: Megaphone,
    title: "Made for bands first",
    description: "Start with a home base for your music, photos, shows, and press story.",
  },
  {
    icon: BarChart3,
    title: "Detailed analytics",
    description: "See which pages, posts, and updates are getting attention from fans.",
  },
];

const timeline = [
  "Name the band site",
  "Add the story",
  "Publish the first update",
  "Connect the domain",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f7f3ed] text-zinc-950">
      <section className="relative isolate overflow-hidden bg-[#15120f] text-white">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(255,47,14,0.24),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_36%),repeating-linear-gradient(90deg,rgba(255,255,255,0.08)_0,rgba(255,255,255,0.08)_1px,transparent_1px,transparent_96px)]" />
        <div className="absolute bottom-0 left-0 right-0 -z-10 h-52 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.78))]" />

        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Multi-Band home">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black">
              <Image
                src="/mbp-logo.png"
                alt=""
                width={44}
                height={44}
                className="h-7 w-7 object-contain"
                priority
              />
            </span>
            <span className="font-cal text-lg tracking-normal">Multi-Band</span>
          </Link>

          <Link href={appUrl} className="btn btn-sm border-white/20 bg-white text-black hover:bg-[#ff2f0e] hover:text-white">
            Sign in
          </Link>
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:pb-24 lg:pt-24">
          <div className="max-w-5xl">
            <div className="badge mb-7 border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white">
              For working bands
            </div>

            <h1 className="max-w-5xl text-balance font-cal text-5xl leading-[0.95] tracking-normal text-white sm:text-6xl lg:text-7xl xl:text-8xl">
              Band Site in a Box
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-100 sm:text-xl">
              Build a sharp home for your band without turning rehearsal into a web
              meeting. Put your story, updates, photos, and domain in one place fans can
              actually find.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={appUrl} className="btn bg-[#ff2f0e] text-white hover:bg-white hover:text-black">
                Start a band site
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#platform" className="btn btn-outline border-white/30 text-white hover:bg-white hover:text-black">
                See what is included
              </a>
            </div>
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-lg border border-white/15 bg-white text-zinc-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-[#ff2f0e]" />
                  <span className="h-3 w-3 rounded-full bg-[#f4c542]" />
                  <span className="h-3 w-3 rounded-full bg-[#19a974]" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  eastkin.com
                </span>
              </div>
              <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
                <div className="bg-[#ff2f0e] p-6 text-white">
                  <p className="text-sm uppercase tracking-[0.22em] text-white/70">Tonight</p>
                  <p className="mt-5 font-cal text-4xl leading-none">Rock & Roll in a Country Town</p>
                  <p className="mt-6 text-sm leading-6 text-white/80">
                    Your bio, updates, shows, and visuals belong somewhere better than a link list.
                  </p>
                </div>
                <div className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <Disc3 className="h-9 w-9 text-[#ff2f0e]" />
                    <div>
                      <p className="font-cal text-2xl">East Kin</p>
                      <p className="text-sm text-zinc-500">Latest update published</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-zinc-200 p-4">
                      <CalendarDays className="mb-5 h-5 w-5 text-zinc-500" />
                      <p className="text-sm font-semibold">Show calendar</p>
                    </div>
                    <div className="rounded-md border border-zinc-200 p-4">
                      <Sparkles className="mb-5 h-5 w-5 text-zinc-500" />
                      <p className="text-sm font-semibold">Story editor</p>
                    </div>
                  </div>
                  <div className="h-3 rounded-full bg-zinc-100">
                    <div className="h-3 w-2/3 rounded-full bg-[#19a974]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="stats stats-vertical rounded-lg border border-white/15 bg-white/10 text-white shadow-2xl">
              <div className="stat">
                <div className="stat-title text-zinc-300">For the band</div>
                <div className="stat-value font-cal text-3xl">One home</div>
                <div className="stat-desc text-zinc-300">for story, updates, and links</div>
              </div>
              <div className="stat">
                <div className="stat-title text-zinc-300">Launch path</div>
                <div className="stat-value font-cal text-3xl">Minutes</div>
                <div className="stat-desc text-zinc-300">from signup to first draft</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="bg-[#f7f3ed] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ff2f0e]">
              Built for musicians
            </p>
            <h2 className="mt-4 font-cal text-4xl leading-tight text-zinc-950 sm:text-5xl">
              Your band deserves more than scattered profiles.
            </h2>
            <p className="mt-5 text-lg leading-8 text-zinc-700">
              Multi-Band gives each project a real front door: a place for the bio,
              the latest news, the important links, and the domain people already know.
              You keep playing; the site stays easy to update.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                <Icon className="h-7 w-7 text-[#ff2f0e]" />
                <h3 className="mt-6 font-cal text-2xl">{title}</h3>
                <p className="mt-3 leading-7 text-zinc-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#19a974]">
              First site, no drama
            </p>
            <h2 className="mt-4 font-cal text-4xl leading-tight text-zinc-950 sm:text-5xl">
              Be ready before the next show flyer goes out.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {timeline.map((item, index) => (
              <div key={item} className="flex items-start gap-4 rounded-lg border border-zinc-200 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 font-cal text-white">
                  {index + 1}
                </span>
                <p className="pt-2 text-lg font-semibold text-zinc-800">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#15120f] px-5 py-16 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3 text-[#f4c542]">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-sm font-semibold uppercase tracking-[0.24em]">
                Ready when the band is
              </p>
            </div>
            <h2 className="mt-4 max-w-2xl font-cal text-4xl leading-tight">
              Give fans one place to find the band, hear the story, and follow what is next.
            </h2>
          </div>
          <Link href={appUrl} className="btn bg-white text-black hover:bg-[#ff2f0e] hover:text-white">
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
