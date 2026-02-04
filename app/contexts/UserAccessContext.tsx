"use client";

import React, { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserAccess, type UseUserAccessResult } from "../hooks/useUserAccess";
import { getAuthUrl } from "../lib/authRedirect";

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

/**
 * Wrapper for authenticated routes: redirects to /auth when not logged in.
 * Uses context only (no extra useUserAccess call).
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, user } = useUserAccessContext();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(getAuthUrl(pathname ?? undefined));
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return null;
  }
  return <>{children}</>;
}

export function useUserAccessContext(): UseUserAccessResult {
  const ctx = useContext(UserAccessContext);
  if (ctx === null) {
    throw new Error("useUserAccessContext must be used within UserAccessProvider");
  }
  return ctx;
}
