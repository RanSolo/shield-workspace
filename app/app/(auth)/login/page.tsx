import Image from "next/image";
import LoginButton from "./login-button";
import { Suspense } from "react";
import NextLink from "next/link";
export default function LoginPage() {
  return (
    <div className="p-10 mx-5 border border-stone-200 dark:border-stone-700 sm:mx-auto sm:w-full sm:max-w-md sm:rounded-lg sm:shadow-md">
      <Image
        alt="Multi-band Platform logo"
        width={1500}
        height={1500}
        className="relative w-auto h-auto dark:scale-110 dark:rounded-full dark:border dark:border-stone-400"
        src="/mbp-logo.png"
      />
      

      <div className="w-11/12 max-w-xs mx-auto mt-4 sm:w-full">
        <Suspense
          fallback={
            <div className="w-full h-10 my-2 border rounded-md border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800" />
          }
        >
          <LoginButton />
        </Suspense>
      </div>
    </div>
  );
}
