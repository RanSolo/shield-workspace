import Link from "next/link";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { placeholderBlurhash, toDateString } from "@/lib/utils";
import { getPostsForSite, getSiteData } from "@/lib/fetchers";
import Image from "next/image";
import Iframe from 'react-iframe'

export async function generateStaticParams() {
  const allSites = await prisma.site.findMany({
    select: {
      subdomain: true,
      customDomain: true,
    },
    // feel free to remove this filter if you want to generate paths for all sites
    where: {
      subdomain: "demo",
    },
  });

  const allPaths = allSites
    .flatMap(({ subdomain, customDomain }) => [
      subdomain && {
        domain: `${subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
      },
      customDomain && {
        domain: customDomain,
      },
    ])
    .filter(Boolean);

  return allPaths;
}

export default async function SiteHomePage({
  params,
}: {
  params: { domain: string };
}) {
  const domain = decodeURIComponent(params.domain);
  const [data, posts] = await Promise.all([
    getSiteData(domain),
    getPostsForSite(domain),
  ]);

  if (!data) {
    notFound();
  }

  return (
    <>
      <div className="w-full mt-20 mb-20">
        <div className="relative w-full pb-5 h-fit">
          <div className="relative w-full h-full mx-auto overflow-hidden group">
            <Image
              alt='band photo'
              blurDataURL={placeholderBlurhash}
              className="object-cover w-full h-full group-hover:scale-105 group-hover:duration-300"
              width={1300}
              height={630}
              placeholder="blur"
              src={data.image ?? "/placeholder.png"} 
            />
          </div>
        </div>

        {data.bio?.trim() && (
          <section className="w-5/6 max-w-screen-xl mx-auto mb-12 text-center">
            <p className="text-lg md:text-xl leading-relaxed text-stone-700 dark:text-stone-300">
              {data.bio}
            </p>
          </section>
        )}

        <div className="w-1/2 max-w-screen-xl mx-auto md:mb-28 lg:w-5/6">
          {posts.map(post => (

            <Link  key={post.slug} href={`/${post.slug}`}>
              <div className="w-5/6 mx-auto mt-10 lg:w-full">
                <h2 className="my-10 text-4xl font-title dark:text-white md:text-6xl">
                  {post.title}
                </h2>
              </div>
            </Link>
          )

          )}
          </div>
          
      </div>
      <Iframe url={data.featuredEmbed as string}
        width="100%"
        height="1000"
        id=""
        className=""
        display="block"
        position="relative"/>
    </>
  );
}
