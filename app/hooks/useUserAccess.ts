"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { getUserAccess, type UserAccess } from "../lib/access";
import type { Profile } from "../types";

export type UseUserAccessResult = {
  loading: boolean;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  access: UserAccess;
};

/**
 * Hook to load user session, profile, and access level
 * Handles redirects for unauthenticated users or missing profiles
 */
export function useUserAccess(requireAuth: boolean = false, requireProfile: boolean = false): UseUserAccessResult {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<UserAccess>({ 
    role: "guest", 
    hasPremium: false, 
    isAdmin: false 
  });

  useEffect(() => {
    let mounted = true;
    let isUnmounting = false;

    (async () => {
      setLoading(true);

      // Get session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData.session;

      // Only check mounted, don't abort on dependency changes
      if (isUnmounting) {
        console.log("[useUserAccess] Component unmounting, skipping state update");
        return;
      }

      if (sessionError) {
        console.error("Error getting session:", sessionError);
        if (!isUnmounting) {
          setLoading(false);
        }
        return;
      }

      if (!session?.user) {
        if (requireAuth && !isUnmounting) {
          router.replace("/auth");
          return;
        }
        if (!isUnmounting) {
          setUser(null);
          setProfile(null);
          setAccess({ 
            role: "guest", 
            hasPremium: false, 
            isAdmin: false 
          });
          setLoading(false);
        }
        return;
      }

      const currentUser = {
        id: session.user.id,
        email: session.user.email ?? null,
      };
      
      if (!isUnmounting) {
        setUser(currentUser);
      }

      // Load profile with role and subscription fields
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*, is_admin, subscription_status, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      // Only check unmounting, not mounted flag (to avoid aborting on dependency changes)
      if (isUnmounting) {
        console.log("[useUserAccess] Component unmounting after profile fetch, skipping state update");
        return;
      }

      if (profileError) {
        console.error("Error loading profile:", profileError);
      }

      const currentProfile = profileData ?? null;
      
      if (!isUnmounting) {
        setProfile(currentProfile);

        // Check if profile is required
        if (requireProfile && !currentProfile) {
          // TODO: Redirect to profile setup if route exists
          // router.replace("/profile/setup");
          console.warn("Profile required but not found");
        }

        // Calculate access based on role system
        const userAccess = getUserAccess(currentProfile);
        setAccess(userAccess);

        setLoading(false);
      }
    })();

    return () => {
      // Only mark as unmounting on actual unmount, not on dependency change
      isUnmounting = true;
      mounted = false;
      if (process.env.NODE_ENV === 'development') {
        console.log("[useUserAccess] Cleanup: component unmounting");
      }
    };
    // Remove router from dependencies to prevent re-runs on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireAuth, requireProfile]);

  return { loading, user, profile, access };
}
