"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy edit route - redirects to new Airbnb-style editor
 * Old path: /id/[id]/edit
 * New path: /places/[id]/edit
 */
type PageProps = { params: Promise<{ id: string }> };

export default function EditPlacePage(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  // Redirect to new editor flow
  useEffect(() => {
    if (placeId) {
      router.replace(`/places/${placeId}/edit`);
    }
  }, [placeId, router]);

  // Show loading while redirecting
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="text-sm text-[#6F7A5A]">Redirecting…</div>
    </main>
  );
}
