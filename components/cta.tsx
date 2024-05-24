"use client";

import { useState } from "react";

export default function CTA() {
  const [closeCTA, setCloseCTA] = useState(false);
  return (
    <div
      className={`${
        closeCTA ? "h-14 lg:h-auto" : "h-60 sm:h-40 lg:h-auto"
      } fixed inset-x-0 bottom-5 mx-5 flex max-w-screen-xl flex-col items-center justify-between space-y-3 rounded-lg border-t-4 border-black bg-white px-5 pb-3 pt-0 drop-shadow-lg transition-all duration-150 ease-in-out dark:border dark:border-t-4 dark:border-stone-700 dark:bg-black dark:text-white
          lg:flex-row lg:space-y-0 lg:pt-3 xl:mx-auto`}
    >
      <button
        onClick={() => setCloseCTA(!closeCTA)}
        title="Close CTA"
        className={`${
          closeCTA ? "rotate-180" : "rotate-0"
        } absolute right-3 top-2 text-black transition-all duration-150 ease-in-out dark:text-white lg:hidden`}
      >
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          shapeRendering="geometricPrecision"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="text-center lg:text-left">
        <p className="text-lg text-black font-title dark:text-white sm:text-2xl">
          Multi Band Platform
        </p>
        <p
          className={`${
            closeCTA ? "hidden lg:block" : ""
          } mt-2 text-sm text-stone-700 dark:text-stone-300 lg:mt-0`}
        >
          This is a multi-tenant site where users can create websites with a few parameters and media.
          with custom domain support.
        </p>
      </div>
    </div>
  );
}
