import { Suspense } from "react";
import Sites from "@/components/sites";
import PlaceholderCard from "@/components/placeholder-card";
import CreateSiteButton from "@/components/create-site-button";
import CreateSiteModal from "@/components/modal/create-site";

export default function AllSites({ params }: { params: { id: string } }) {
  console.log('params', params)
  return (
    <div className="flex flex-col max-w-screen-xl p-8 space-y-12">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold font-cal dark:text-white">
            All Band Sites
          </h1>
          <CreateSiteButton>
            <CreateSiteModal/>
          </CreateSiteButton>
        </div>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <PlaceholderCard key={i} />
              ))}
            </div>
          }
        >
          {/* @ts-expect-error Server Component */}
          <Sites siteId={decodeURIComponent(params.id)} />
        </Suspense>
      </div>
    </div>
  );
}
