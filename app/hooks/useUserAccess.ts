"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { getUserAccess, type UserAccess } from "../lib/access";

export type UseUserAccessResult = {
  loading: boolean;
  user: { id: string; email: string | null } | null;
  profile: any | null;
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
  const [profile, setProfile] = useState<any | null>(null);
  const [access, setAccess] = useState<UserAccess>({ hasPremium: false });

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      // Get session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!mounted) return;

      if (sessionError) {
        console.error("Error getting session:", sessionError);
        setLoading(false);
        return;
      }

      if (!session?.user) {
        if (requireAuth) {
          router.replace("/auth");
          return;
        }
        setUser(null);
        setProfile(null);
        setAccess({ hasPremium: false });
        setLoading(false);
        return;
      }

      const currentUser = {
        id: session.user.id,
        email: session.user.email ?? null,
      };
      setUser(currentUser);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (!mounted) return;

      if (profileError) {
        console.error("Error loading profile:", profileError);
      }

      const currentProfile = profileData ?? null;
      setProfile(currentProfile);

      // Check if profile is required
      if (requireProfile && !currentProfile) {
        // TODO: Redirect to profile setup if route exists
        // router.replace("/profile/setup");
        console.warn("Profile required but not found");
      }

      // Calculate access
      const userAccess = getUserAccess(currentProfile);
      setAccess(userAccess);

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [router, requireAuth, requireProfile]);

  return { loading, user, profile, access };
}
