import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import CTA from "@/components/cta";
import ReportAbuse from "@/components/report-abuse";
import { notFound, redirect } from "next/navigation";
import { getSiteData } from "@/lib/fetchers";
import { fontMapper } from "@/styles/fonts";
import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { domain: string };
}): Promise<Metadata | null> {
  const domain = decodeURIComponent(params.domain);
  const data = await getSiteData(domain);
  if (!data) {
    return null;
  }
  const {
    name: title,
    description,
    image,
    logo,
  } = data as {
    name: string;
    description: string;
    image: string;
    logo: string;
  };

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
      creator: "@vercel",
    },
    icons: [logo],
    metadataBase: new URL(`https://${domain}`),
    // Optional: Set canonical URL to custom domain if it exists
    ...(params.domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
      data.customDomain && {
        alternates: {
          canonical: `https://${data.customDomain}`,
        },
      }),
  };
}

export default async function SiteLayout({
  params,
  children,
}: {
  params: { domain: string };
  children: ReactNode;
}) {
  const domain = decodeURIComponent(params.domain);
  const data = await getSiteData(domain);

  if (!data) {
    notFound();
  }

  // Optional: Redirect to custom domain if it exists
  if (
    domain.endsWith(`.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`) &&
    data.customDomain &&
    process.env.REDIRECT_TO_CUSTOM_DOMAIN_IF_EXISTS === "true"
  ) {
    return redirect(`https://${data.customDomain}`);
  }
console.log('data', data)
  return (
    <div className={fontMapper[data.font]}>
      <div className="top-0 left-0 right-0 z-30 flex h-16 transition-all duration-150 bg-white ease dark:bg-black dark:text-white">
        <div className="flex items-center h-full max-w-screen-xl px-10 mt-10 space-x-5 sm:px-20">
          <Link href="/" className="flex items-center justify-center">
            <div className="overflow-hidden align-middle rounded-full my-30">
              <Image
                alt={data.name || ""}
                height={120}
                src={data.logo || ""}
                width={120}
              />
            </div>
          </Link>
            <h1 className="inline-block ml-3 text-3xl font-extrabold header font-title">
              {data.name}
            </h1>
            <p>{data.description}</p>
        </div>
      </div>

      <div className="mt-20">{children}</div>

      {domain == `demo.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` ||
      domain == `multi-band.com` ? (
        <CTA />
      ) : (
        <ReportAbuse />
      )}
    </div>
  );
}
 