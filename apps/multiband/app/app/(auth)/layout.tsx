import { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Login | Multi-Band-Platform",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col justify-center min-h-screen py-12 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
