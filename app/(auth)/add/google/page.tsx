"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
// useAuthRedirect больше не используется — RequireAuth в (auth)/layout.tsx
// гарантирует user. См. feedback_useauthredirect_deps.
import { canUserAddPlace } from "../../../lib/access";
import GoogleImportField from "../../../components/GoogleImportField";
import Icon from "../../../components/Icon";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";
import { PageSkeleton } from "../../../components/Skeleton";
import CreatorPremiumGate from "../../../components/CreatorPremiumGate";

export default function GoogleImportPage() {
  const router = useRouter();
  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading) return;

    (async () => {
      // 2026-05-10: убрали replaceToAuth() — (auth)/layout.tsx → RequireAuth
      // редиректит сам, сюда мы попадаем только когда user уже есть.
      // replaceToAuth — fresh ref на каждый render → нельзя в deps
      // (см. feedback_useauthredirect_deps).
      if (!user) return;

      // Check if user can publish listings (creator plans and admins)
      if (!canUserAddPlace(access)) {
        setError("You need a creator plan to import and publish places on Maporia.");
        return;
      }
    })();
  }, [user, access, accessLoading]);

  if (accessLoading) {
    return <PageSkeleton />;
  }

  if (!user) {
    return null; // Will redirect
  }

  if (error && !canUserAddPlace(access)) {
    return (
      <CreatorPremiumGate
        eyebrow="Google import access"
        title="Import a real-world place and make it shine on Maporia."
        copy={error}
        primaryLabel="See creator plans"
        secondaryLabel="Go home"
        onPrimary={() => router.push("/pricing")}
        onSecondary={() => router.push("/")}
      />
    );
  }

  return (
    <SectionErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F] flex-1 text-center" style={{ fontSize: '24px' }}>
              Import from Google Maps
            </h1>
            <div className="w-10" /> {/* Spacer для центрирования */}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="text-sm text-[#6F7A5A] leading-relaxed">
            Search for a place using a Google Maps URL or address, then select which fields to import.
          </p>
        </div>

        <GoogleImportField userId={user.id} redirectToPreview />
      </div>
      </main>
    </SectionErrorBoundary>
  );
}
