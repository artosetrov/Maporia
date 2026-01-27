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
    let isUnmounting = false;
    let requestId = Date.now();

    (async () => {
      const currentRequestId = requestId;
      
      // Don't set loading if this is not the latest request
      if (currentRequestId === requestId) {
        setLoading(true);
      }

      try {
        // Get session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const session = sessionData.session;

        // Check if this request is still valid
        if (isUnmounting || currentRequestId !== requestId) {
          return;
        }

        if (sessionError) {
          // Silently ignore AbortError
          if (sessionError.message?.includes('abort') || sessionError.name === 'AbortError') {
            return;
          }
          
          // Enhanced error logging for production
          if (process.env.NODE_ENV === 'production') {
            console.error('[useUserAccess] Session error:', {
              message: sessionError.message,
              name: sessionError.name,
              status: (sessionError as any).status,
              url: window.location.href,
            });
          } else {
            console.error("Error getting session:", sessionError);
          }
          
          if (!isUnmounting && currentRequestId === requestId) {
            setLoading(false);
          }
          return;
        }

        if (!session?.user) {
          if (requireAuth && !isUnmounting && currentRequestId === requestId) {
            router.replace("/auth");
            return;
          }
          if (!isUnmounting && currentRequestId === requestId) {
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
        
        if (!isUnmounting && currentRequestId === requestId) {
          setUser(currentUser);
        }

        // Load profile with role and subscription fields
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*, is_admin, subscription_status, role")
          .eq("id", currentUser.id)
          .maybeSingle();

        // Check if this request is still valid
        if (isUnmounting || currentRequestId !== requestId) {
          return;
        }

        if (profileError) {
          // Silently ignore AbortError
          if (profileError.message?.includes('abort') || profileError.name === 'AbortError') {
            return;
          }
          
          // Enhanced error logging for production
          if (process.env.NODE_ENV === 'production') {
            console.error('[useUserAccess] Profile error:', {
              message: profileError.message,
              code: profileError.code,
              details: profileError.details,
              hint: profileError.hint,
            });
          } else {
            console.error("Error loading profile:", profileError);
          }
        }

        const currentProfile = profileData ?? null;
        
        if (!isUnmounting && currentRequestId === requestId) {
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
      } catch (err: any) {
        // Silently ignore AbortError
        if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
          return;
        }
        
        console.error("[useUserAccess] Exception:", err);
        if (!isUnmounting && currentRequestId === requestId) {
          setLoading(false);
        }
      }
    })();

    return () => {
      // Only mark as unmounting on actual unmount, not on dependency change
      isUnmounting = true;
      requestId = Date.now(); // Invalidate current request
    };
    // Remove router from dependencies to prevent re-runs on navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireAuth, requireProfile]);

  return { loading, user, profile, access };
}
