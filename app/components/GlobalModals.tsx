"use client";

import { usePremiumModalContext } from "../contexts/PremiumModalContext";
import AuthModal from "./AuthModal";
import PremiumUpsellModal from "./PremiumUpsellModal";

/**
 * Single instance of AuthModal + PremiumUpsellModal rendered at app level.
 * All PlaceCards and other components open these through PremiumModalContext
 * instead of rendering their own per-component instances.
 */
export default function GlobalModals() {
  const {
    premiumModal,
    closePremiumModal,
    authModal,
    closeAuthModal,
  } = usePremiumModalContext();

  return (
    <>
      <AuthModal
        isOpen={authModal.isOpen}
        onClose={closeAuthModal}
        redirectPath={authModal.redirectPath}
        variant={authModal.variant}
      />
      <PremiumUpsellModal
        open={premiumModal.isOpen}
        onClose={closePremiumModal}
        context={premiumModal.context}
        placeTitle={premiumModal.placeTitle}
        customContent={premiumModal.customContent}
      />
    </>
  );
}
