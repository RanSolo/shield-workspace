import { InlineSnippet } from "@/components/form/domain-configuration";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-10 bg-black">
      <Image
        width={512}
        height={512}
        src="/logo.png"
        alt="Platforms on Vercel"
        className="w-48"
      />
      <h1 className="text-white">
        Edit this page on{" "}
        <InlineSnippet className="ml-2 text-blue-100 bg-blue-900">
          app/home/page.tsx
        </InlineSnippet>
      </h1>
    </div>
  );
}
