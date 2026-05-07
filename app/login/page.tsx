import type { Metadata } from "next";
import { Suspense } from "react";
import LoginPageContent from "./LoginPageContent";

export const metadata: Metadata = {
  title: "Sign in — Maporia",
  description: "Sign in to your Maporia account.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <LoginPageContent />
    </Suspense>
  );
}

function AuthSkeleton() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 animate-pulse"
        style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
      >
        <div className="h-8 w-32 bg-[#ECEEE4] rounded mb-6" />
        <div className="h-6 w-40 bg-[#ECEEE4] rounded mb-2" />
        <div className="h-4 w-56 bg-[#ECEEE4] rounded mb-6" />
        <div className="h-11 bg-[#ECEEE4] rounded-xl mb-3" />
        <div className="h-11 bg-[#ECEEE4] rounded-xl" />
      </div>
    </main>
  );
}
