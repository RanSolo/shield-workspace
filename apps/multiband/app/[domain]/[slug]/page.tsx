import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getPostData, getSiteData } from "@/lib/fetchers";
import BlogCard from "@/components/blog-card";
import BlurImage from "@/components/blur-image";
import MDX from "@/components/mdx";
import { placeholderBlurhash, toDateString } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: { domain: string; slug: string };
}) {
  const domain = decodeURIComponent(params.domain);
  const slug = decodeURIComponent(params.slug);

  const [data, siteData] = await Promise.all([
    getPostData(domain, slug),
    getSiteData(domain),
  ]);
  if (!data || !siteData) {
    return null;
  }
  const { title, description } = data;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@vercel",
    },
    // Optional: Set canonical URL to custom domain if it exists
    ...(params.domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
      siteData.customDomain && {
        alternates: {
          canonical: `https://${siteData.customDomain}/${params.slug}`,
        },
      }),
  };
}

export async function generateStaticParams() {
  const allPosts = await prisma.post.findMany({
    select: {
      slug: true,
      site: {
        select: {
          subdomain: true,
          customDomain: true,
        },
      },
    },
    // feel free to remove this filter if you want to generate paths for all posts
    where: {
      site: {
        subdomain: "demo",
      },
    },
  });

  const allPaths = allPosts
    .flatMap(({ site, slug }) => [
      site?.subdomain && {
        domain: `${site.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
        slug,
      },
      site?.customDomain && {
        domain: site.customDomain,
        slug,
      },
    ])
    .filter(Boolean);

  return allPaths;
}

export default async function SitePostPage({
  params,
}: {
  params: { domain: string; slug: string };
}) {
  const domain = decodeURIComponent(params.domain);
  const slug = decodeURIComponent(params.slug);
  const data = await getPostData(domain, slug);

  if (!data) {
    notFound();
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center">
        <div className="w-full m-auto text-center md:w-7/12">
          <h1 className="mb-10 text-3xl font-bold font-title text-stone-800 dark:text-white md:text-6xl">
            {data.title}
          </h1>
          <p className="w-10/12 m-auto text-md text-stone-600 dark:text-stone-400 md:text-lg">
            {data.description}
          </p>
        </div>
      </div>
      <div className="relative w-full max-w-screen-lg m-auto mb-10 overflow-hidden h-80 md:mb-20 md:h-150 md:w-5/6 md:rounded-2xl lg:w-2/3">
        <BlurImage
          alt={data.title ?? "Post image"}
          width={1200}
          height={630}
          className="object-cover w-full h-full"
          placeholder="blur"
          blurDataURL={data.imageBlurhash ?? placeholderBlurhash}
          src={data.image ?? "/placeholder.png"}
        />
      </div>

      <MDX source={data.mdxSource} />

      {data.adjacentPosts.length > 0 && (
        <div className="relative mt-10 mb-20 sm:mt-20">
          <div
            className="absolute inset-0 flex flex-row items-center"
            aria-hidden="true"
          >
            <div className="w-full border-t border-stone-300 dark:border-stone-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-2 text-sm bg-white text-stone-500 dark:bg-black dark:text-stone-400">
              Continue Reading
            </span>
          </div>
        </div>
      )}
      {data.adjacentPosts && (
        <div className="grid max-w-screen-xl grid-cols-1 mx-5 mb-20 gap-x-4 gap-y-8 md:grid-cols-2 xl:mx-auto xl:grid-cols-3">
          {data.adjacentPosts.map((data: any, index: number) => (
            <BlogCard key={index} data={data} />
          ))}
        </div>
      )}
    </>
  );
}
