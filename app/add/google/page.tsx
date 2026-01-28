"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useUserAccess } from "../../hooks/useUserAccess";
import { canUserAddPlace } from "../../lib/access";
import GoogleImportField from "../../components/GoogleImportField";
import Icon from "../../components/Icon";

export default function GoogleImportPage() {
  const router = useRouter();
  const { loading: accessLoading, user, access } = useUserAccess(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading) return;

    (async () => {
      // Check authentication
      if (!user) {
        router.push("/auth");
        return;
      }

      // Check if user can add places (only Premium and Admin)
      if (!canUserAddPlace(access)) {
        setError("Only Premium users can create places. Please upgrade to Premium to add new places.");
        return;
      }
    })();
  }, [router, user, access, accessLoading]);

  if (accessLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#6F7A5A] mb-2">Loading...</div>
        </div>
      </main>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  if (error && !canUserAddPlace(access)) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="max-w-md mx-auto px-6 text-center">
          <div className="text-lg font-semibold text-[#1F2A1F] mb-2">Premium Required</div>
          <div className="text-sm text-[#6F7A5A] mb-4">{error}</div>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#1F2A1F] text-white rounded-lg hover:bg-[#2A3A2A] transition-colors"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
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

        <GoogleImportField userId={user.id} />
      </div>
    </main>
  );
}
