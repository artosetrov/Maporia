"use client";

import { useState, useCallback } from "react";
import { usePremiumStatus } from "./usePremiumStatus";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import type { Place } from "../types";

type PremiumGateContext = "place" | "collection";

/**
 * Hook to gate premium content and manage premium upsell modal
 * @returns Object with canAccessPremium, openPremiumModal function, and modal state
 */
export function usePremiumGate() {
  const { isPremium, loading, access } = usePremiumStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<PremiumGateContext>("place");
  const [modalPlaceTitle, setModalPlaceTitle] = useState<string | undefined>();
  const [modalCollectionTitle, setModalCollectionTitle] = useState<string | undefined>();

  const openPremiumModal = useCallback(
    (context: PremiumGateContext = "place", placeTitle?: string, collectionTitle?: string) => {
      setModalContext(context);
      setModalPlaceTitle(placeTitle);
      setModalCollectionTitle(collectionTitle);
      setModalOpen(true);
    },
    []
  );

  const closePremiumModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  /**
   * Check if user can access a premium place
   */
  const canAccessPlace = useCallback(
    (place: Place | { access_level?: string | null; is_premium?: boolean | null; premium_only?: boolean | null; visibility?: string | null; accessLevel?: "public" | "premium" }, userId?: string | null): boolean => {
      if (loading) return false;
      if (isPremium) return true;

      const placeIsPremium = isPlacePremium(place);
      if (!placeIsPremium) return true;

      // Check if user is the owner
      const isOwner = userId && "created_by" in place && place.created_by === userId;
      if (isOwner) return true;

      // Check access
      return canUserViewPlace(access, place);
    },
    [isPremium, loading, access]
  );

  /**
   * Check if user can access premium content (generic)
   */
  const canAccessPremium = useCallback(() => {
    if (loading) return false;
    return isPremium;
  }, [isPremium, loading]);

  return {
    canAccessPremium: canAccessPremium(),
    canAccessPlace,
    isPremium,
    loading,
    openPremiumModal,
    closePremiumModal,
    modalOpen,
    modalContext,
    modalPlaceTitle,
    modalCollectionTitle,
  };
}
