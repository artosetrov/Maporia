"use client";

import React, { createContext, useContext } from "react";
import { useUserAccess, type UseUserAccessResult } from "../hooks/useUserAccess";

const UserAccessContext = createContext<UseUserAccessResult | null>(null);

export function UserAccessProvider({
  children,
  requireAuth = false,
  requireProfile = false,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireProfile?: boolean;
}) {
  const value = useUserAccess(requireAuth, requireProfile);
  return (
    <UserAccessContext.Provider value={value}>
      {children}
    </UserAccessContext.Provider>
  );
}

export function useUserAccessContext(): UseUserAccessResult {
  const ctx = useContext(UserAccessContext);
  const fallback = useUserAccess(false);
  return ctx ?? fallback;
}
