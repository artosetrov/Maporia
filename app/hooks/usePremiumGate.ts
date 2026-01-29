"use client";

import { useState, useCallback, useEffect } from "react";
import { usePremiumStatus } from "./usePremiumStatus";
import { isPlacePremium, canUserViewPlace, type UserAccess } from "../lib/access";
import type { Place } from "../types";
import { usePremiumModalContext } from "../contexts/PremiumModalContext";

type PremiumGateContext = "place" | "collection";

/**
 * Hook to gate premium content and manage premium upsell modal
 * Premium location access logic:
 * - guest → open Auth Modal (Sign up / Login)
 * - logged in + free (standard) → open Premium Purchase Modal
 * - premium → open location directly (caller navigates)
 * @returns Object with canAccessPremium, openPremiumModal, openPremiumLocation, and modal state
 */
export function usePremiumGate() {
  const { isPremium, loading, access } = usePremiumStatus();
  const { setPremiumModalOpen } = usePremiumModalContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<PremiumGateContext>("place");
  const [modalPlaceTitle, setModalPlaceTitle] = useState<string | undefined>();
  const [modalCollectionTitle, setModalCollectionTitle] = useState<string | undefined>();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authRedirectPath, setAuthRedirectPath] = useState<string | undefined>();

  // Sync local modal state with global context
  useEffect(() => {
    setPremiumModalOpen(modalOpen);
  }, [modalOpen, setPremiumModalOpen]);

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

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthRedirectPath(undefined);
  }, []);

  /**
   * Open the appropriate modal when user clicks a premium location they can't access.
   * - guest → Auth Modal (Sign up / Login), optional redirect to place after login
   * - logged in + free → Premium Purchase Modal
   * - premium → no-op (caller should not call this when user has access)
   */
  const openPremiumLocation = useCallback(
    (context: PremiumGateContext = "place", placeTitle?: string, placeId?: string) => {
      if (loading) return;
      if (access.role === "guest") {
        setAuthRedirectPath(placeId ? `/id/${placeId}` : undefined);
        setAuthModalOpen(true);
        return;
      }
      if (!isPremium) {
        openPremiumModal(context, placeTitle);
      }
    },
    [loading, access.role, isPremium, openPremiumModal]
  );

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
    openPremiumLocation,
    closePremiumModal,
    closeAuthModal,
    modalOpen,
    modalContext,
    modalPlaceTitle,
    modalCollectionTitle,
    authModalOpen,
    authRedirectPath,
  };
}
