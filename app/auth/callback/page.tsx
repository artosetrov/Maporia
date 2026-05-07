import type { Metadata } from "next";
import { Suspense } from "react";
import CallbackPageContent from "./CallbackPageContent";

export const metadata: Metadata = {
  title: "Signing you in… — Maporia",
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackSkeleton />}>
      <CallbackPageContent />
    </Suspense>
  );
}

function CallbackSkeleton() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="inline-block h-8 w-8 rounded-full border-2 border-[#ECEEE4] border-t-[#8F9E4F] animate-spin" />
        <p className="mt-4 text-sm text-[#6F7A5A]">Signing you in…</p>
      </div>
    </main>
  );
}
