"use client";

import { useCallback } from "react";
import { usePremiumStatus } from "./usePremiumStatus";
import { isPlacePremium, canUserViewPlace } from "../lib/access";
import type { Place } from "../types";
import { usePremiumModalContext } from "../contexts/PremiumModalContext";
import type { AuthModalVariant } from "../components/AuthModal";

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
  const {
    premiumModal,
    openPremiumModal: openGlobalPremiumModal,
    closePremiumModal,
    authModal,
    openAuthModal,
    closeAuthModal,
  } = usePremiumModalContext();

  const openPremiumModal = useCallback(
    (context: PremiumGateContext = "place", placeTitle?: string, collectionTitle?: string) => {
      openGlobalPremiumModal(context, context === "collection" ? collectionTitle : placeTitle);
    },
    [openGlobalPremiumModal]
  );

  /**
   * Открыть модалку входа для гостя при клике на «Профиль». После входа — редирект на /profile.
   */
  const openAuthForProfile = useCallback(() => {
    if (loading) return;
    if (access.role === "guest") {
      openAuthModal("/profile", "profile");
    }
  }, [loading, access.role, openAuthModal]);

  /**
   * Открыть модалку входа для гостя при клике на «Saved». После входа — редирект на /saved.
   */
  const openAuthForSaved = useCallback(() => {
    if (loading) return;
    if (access.role === "guest") {
      openAuthModal("/saved", "saved");
    }
  }, [loading, access.role, openAuthModal]);

  /**
   * Open the appropriate modal when user clicks a premium location they can't access.
   * - guest → Auth Modal (Sign in to Maporia) via global context
   * - logged in + free → Premium Purchase Modal
   * - premium → no-op (caller should not call this when user has access)
   */
  const openPremiumLocation = useCallback(
    (context: PremiumGateContext = "place", placeTitle?: string, placeId?: string) => {
      void placeId;
      if (loading) return;
      if (access.role === "guest") {
        openAuthModal(undefined, "premium");
        return;
      }
      if (!isPremium) {
        openPremiumModal(context, placeTitle);
      }
    },
    [loading, isPremium, access.role, openPremiumModal, openAuthModal]
  );

  /**
   * Open the appropriate modal when user clicks a premium collection they can't access.
   * - guest → Auth Modal with redirect to /collections/[id] after login
   * - logged in + free → Premium Purchase Modal (collection context)
   * - premium → no-op (caller should navigate to /collections/[id])
   */
  const openPremiumCollection = useCallback(
    (_collectionId: string, collectionTitle?: string) => {
      if (loading) return;
      if (access.role === "guest") {
        openAuthModal(`/collections/${_collectionId}`, "premium");
        return;
      }
      if (!isPremium) {
        openGlobalPremiumModal("collection", collectionTitle);
      }
    },
    [loading, isPremium, access.role, openAuthModal, openGlobalPremiumModal]
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
    openPremiumCollection,
    closePremiumModal,
    closeAuthModal,
    modalOpen: premiumModal.isOpen,
    modalContext: premiumModal.context,
    modalPlaceTitle: premiumModal.context === "place" ? premiumModal.placeTitle : undefined,
    modalCollectionTitle: premiumModal.context === "collection" ? premiumModal.placeTitle : undefined,
    authModalOpen: authModal.isOpen,
    authRedirectPath: authModal.redirectPath,
    authModalVariant: (authModal.variant ?? "default") as AuthModalVariant,
    openAuthForProfile,
    openAuthForSaved,
  };
}
