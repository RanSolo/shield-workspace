"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { ModalProvider } from "@/components/modal/provider";

import Script from 'next/script'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
    
      <Script
        defer
        src="https://unpkg.com/@tinybirdco/flock.js"
        data-token="p.eyJ1IjogIjUyYWZlMmM1LTEwNzYtNGU5Mi1iMmY4LTA0ZWVhN2VkYjVjYyIsICJpZCI6ICI4NjBhODViMi1jYTgxLTQ5N2UtOGJiYi01MzhmOWM3ODg1OWIiLCAiaG9zdCI6ICJldV9zaGFyZWQifQ.uRBA5Uo5eFHpN8XX9lIqAqxfpfX9uRU2Odc15-J0iZwYOUR_TRACKER_TOKEN" />
    <SessionProvider>
      <Toaster className="dark:hidden" />
      <Toaster theme="dark" className="hidden dark:block" />
      <ModalProvider>{children}</ModalProvider>
    </SessionProvider>
</>
  );
}
