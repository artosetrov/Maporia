"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import { PageSkeleton } from "@/app/components/Skeleton";

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
    <SectionErrorBoundary>
      <PageSkeleton />
    </SectionErrorBoundary>
  );
}
