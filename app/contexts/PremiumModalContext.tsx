"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type PremiumModalContextType = {
  isPremiumModalOpen: boolean;
  setPremiumModalOpen: (open: boolean) => void;
};

const PremiumModalContext = createContext<PremiumModalContextType | undefined>(undefined);

export function PremiumModalProvider({ children }: { children: ReactNode }) {
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  const setPremiumModalOpen = useCallback((open: boolean) => {
    setIsPremiumModalOpen(open);
  }, []);

  return (
    <PremiumModalContext.Provider value={{ isPremiumModalOpen, setPremiumModalOpen }}>
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
