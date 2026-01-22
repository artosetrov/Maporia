"use client";

import { useUserAccess } from "./useUserAccess";

/**
 * Hook to check if the current user has premium status
 * @returns Object with isPremium boolean and loading state
 */
export function usePremiumStatus() {
  const { access, loading } = useUserAccess();

  return {
    isPremium: access.hasPremium,
    loading,
    access,
  };
}
