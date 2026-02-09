"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ModalContext = "place" | "collection";

type PremiumModalState = {
  isOpen: boolean;
  context: ModalContext;
  placeTitle?: string;
  placeId?: string;
};

type AuthModalState = {
  isOpen: boolean;
  redirectPath?: string;
  variant?: "default" | "profile" | "saved";
};

type PremiumModalContextType = {
  // Legacy compat
  isPremiumModalOpen: boolean;
  setPremiumModalOpen: (open: boolean) => void;
  // Rich premium modal
  premiumModal: PremiumModalState;
  openPremiumModal: (context: ModalContext, placeTitle?: string, placeId?: string) => void;
  closePremiumModal: () => void;
  // Auth modal (for guests)
  authModal: AuthModalState;
  openAuthModal: (redirectPath?: string, variant?: AuthModalState["variant"]) => void;
  closeAuthModal: () => void;
};

const PremiumModalContext = createContext<PremiumModalContextType | undefined>(undefined);

export function PremiumModalProvider({ children }: { children: ReactNode }) {
  const [premiumModal, setPremiumModal] = useState<PremiumModalState>({
    isOpen: false,
    context: "place",
  });

  const [authModal, setAuthModal] = useState<AuthModalState>({
    isOpen: false,
  });

  // Legacy compat
  const isPremiumModalOpen = premiumModal.isOpen;
  const setPremiumModalOpen = useCallback((open: boolean) => {
    setPremiumModal((prev) => ({ ...prev, isOpen: open }));
  }, []);

  const openPremiumModal = useCallback(
    (context: ModalContext, placeTitle?: string, placeId?: string) => {
      setPremiumModal({ isOpen: true, context, placeTitle, placeId });
    },
    []
  );

  const closePremiumModal = useCallback(() => {
    setPremiumModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openAuthModal = useCallback(
    (redirectPath?: string, variant?: AuthModalState["variant"]) => {
      setAuthModal({ isOpen: true, redirectPath, variant: variant ?? "default" });
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setAuthModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <PremiumModalContext.Provider
      value={{
        isPremiumModalOpen,
        setPremiumModalOpen,
        premiumModal,
        openPremiumModal,
        closePremiumModal,
        authModal,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </PremiumModalContext.Provider>
  );
}

export function usePremiumModalContext() {
  const context = useContext(PremiumModalContext);
  if (context === undefined) {
    throw new Error("usePremiumModalContext must be used within PremiumModalProvider");
  }
  return context;
}
