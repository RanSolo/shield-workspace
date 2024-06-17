"use client";

import { toast } from "sonner";
import { createSite } from "@/lib/actions/actions";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import LoadingDots from "@/components/icons/loading-dots";
import { useModal } from "./provider";
import va from "@vercel/analytics";
import { useEffect, useState } from "react";

export default function CreateSiteModal() {
  const router = useRouter();
  const modal = useModal();

  const [data, setData] = useState({
    name: "",
    bandName: "",
    subdomain: "",
    description: "",
    socialMediaLinks: { featuredEmbed: ""},
  });

  useEffect(() => {
    setData((prev) => ({
      ...prev,
      subdomain: prev.name
        .toLowerCase()
        .trim()
        .replace(/[\W_]+/g, "-"),
    }));
  }, [data.name]);

  return (
    <form
      action={async (data: FormData) =>
        createSite(data).then((res: any) => {
          if (res.error) {
            toast.error(res.error);
          } else {
            va.track("Created Site");
            const { id } = res;
            router.refresh();
            router.push(`/site/${id}`);
            modal?.hide();
            toast.success(`Successfully created site!`);
          }
        })
      }
      className="w-full bg-white rounded-md dark:bg-black md:max-w-md md:border md:border-stone-200 md:shadow dark:md:border-stone-700"
    >
      <div className="relative flex flex-col p-5 space-y-4 md:p-10">
        <h2 className="text-2xl font-cal dark:text-white">Create a new band site</h2>

        <div className="flex flex-col space-y-2">
          <label
            htmlFor="name"
            className="text-sm font-medium text-stone-500 dark:text-stone-400"
          >
            Site Name
          </label>
          <input
            name="name"
            type="text"
            placeholder="My Awesome Site"
            autoFocus
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            maxLength={32}
            required
            className="w-full px-4 py-2 text-sm border rounded-md border-stone-200 bg-stone-50 text-stone-600 placeholder:text-stone-400 focus:border-black focus:outline-none focus:ring-black dark:border-stone-600 dark:bg-black dark:text-white dark:placeholder-stone-700 dark:focus:ring-white"
          />
        </div>

        <div className="flex flex-col space-y-2">
          <label
            htmlFor="bandName"
            className="text-sm font-medium text-stone-500 dark:text-stone-400"
          >
            Band Name
          </label>
          <input
            name="bandName"
            type="text"
            placeholder="Band Name"
            autoFocus
            value={data.bandName}
            onChange={(e) => setData({ ...data, bandName: e.target.value })}
            maxLength={32}
            required
            className="w-full px-4 py-2 text-sm border rounded-md border-stone-200 bg-stone-50 text-stone-600 placeholder:text-stone-400 focus:border-black focus:outline-none focus:ring-black dark:border-stone-600 dark:bg-black dark:text-white dark:placeholder-stone-700 dark:focus:ring-white"
          />
        </div>

        <div className="flex flex-col space-y-2">
          <label
            htmlFor="subdomain"
            className="text-sm font-medium text-stone-500"
          >
            Subdomain
          </label>
          <div className="flex w-full max-w-md">
            <input
              name="subdomain"
              type="text"
              placeholder="subdomain"
              value={data.subdomain}  
              onChange={(e) => setData({ ...data, subdomain: e.target.value })}
              autoCapitalize="off"
              pattern="[a-zA-Z0-9\-]+" // only allow lowercase letters, numbers, and dashes
              maxLength={32}
              required
              className="w-full px-4 py-2 text-sm border rounded-l-lg border-stone-200 bg-stone-50 text-stone-600 placeholder:text-stone-400 focus:border-black focus:outline-none focus:ring-black dark:border-stone-600 dark:bg-black dark:text-white dark:placeholder-stone-700 dark:focus:ring-white"
            />
            <div className="flex items-center px-3 text-sm border border-l-0 rounded-r-lg border-stone-200 bg-stone-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400">
              .{process.env.NEXT_PUBLIC_ROOT_DOMAIN}
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-2">
          <label
            htmlFor="description"
            className="text-sm font-medium text-stone-500"
          >
            Description
          </label>
          <textarea
            name="description"
            placeholder="Description about why my site is so awesome"
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            maxLength={140}
            rows={3}
            className="w-full px-4 py-2 text-sm border rounded-md border-stone-200 bg-stone-50 text-stone-600 placeholder:text-stone-400 focus:border-black focus:outline-none focus:ring-black dark:border-stone-600 dark:bg-black dark:text-white dark:placeholder-stone-700 dark:focus:ring-white"
          />

        </div>
        <div className="flex flex-col space-y-2">
          <label
            htmlFor="featuredEmbed"
            className="text-sm font-medium text-stone-500"
          >
            Featured YouTube Embed
          </label>
          <textarea
            name="featuredEmbed"
            placeholder="Featured Youtube Embed Code"
            value={data?.socialMediaLinks?.featuredEmbed}
            onChange={(e) => setData({ ...data, socialMediaLinks: {featuredEmbed: e.target.value }})}

            rows={3}
            className="w-full px-4 py-2 text-sm border rounded-md border-stone-200 bg-stone-50 text-stone-600 placeholder:text-stone-400 focus:border-black focus:outline-none focus:ring-black dark:border-stone-600 dark:bg-black dark:text-white dark:placeholder-stone-700 dark:focus:ring-white"
          />
        </div>
        
      </div>
      <div className="flex items-center justify-end p-3 border-t rounded-b-lg border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800 md:px-10">
        <CreateSiteFormButton />
      </div>
    </form>
  );
}
function CreateSiteFormButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className={cn(
        "flex h-10 w-full items-center justify-center space-x-2 rounded-md border text-sm transition-all focus:outline-none",
        pending
          ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
          : "border-black bg-black text-white hover:bg-white hover:text-black dark:border-stone-700 dark:hover:border-stone-200 dark:hover:bg-black dark:hover:text-white dark:active:bg-stone-800",
      )}
      disabled={pending}
    >
      {pending ? <LoadingDots color="#808080" /> : <p>Create Site</p>}
    </button>
  );
}
