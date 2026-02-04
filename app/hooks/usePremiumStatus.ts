"use client";

import { useUserAccessContext } from "../contexts/UserAccessContext";

/**
 * Hook to check if the current user has premium status
 * @returns Object with isPremium boolean and loading state
 */
export function usePremiumStatus() {
  const { access, loading } = useUserAccessContext();

  return {
    isPremium: access.hasPremium,
    loading,
    access,
  };
}
