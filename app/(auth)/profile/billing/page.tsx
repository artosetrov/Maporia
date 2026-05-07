"use client";

/**
 * Legacy redirect: /profile/billing → /profile?section=premium
 * Сохранён, чтобы не ломать старые success/cancel URL Stripe и закладки.
 *
 * Suspense обёртка нужна потому что useSearchParams() требует её в App Router —
 * иначе prerender падает с CSR-bailout.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BillingRedirect() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
          <div className="text-sm text-[#6F7A5A]">Opening Premium…</div>
        </main>
      }
    >
      <BillingRedirectInner />
    </Suspense>
  );
}

function BillingRedirectInner() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const qs = search?.toString();
    const target = `/profile?section=premium${qs ? `&${qs}` : ""}`;
    router.replace(target);
  }, [router, search]);

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="text-sm text-[#6F7A5A]">Opening Premium…</div>
    </main>
  );
}
