"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase, isRefreshTokenError, handleRefreshTokenError } from "../lib/supabase";
import { getUserAccess, type UserAccess } from "../lib/access";
import { getAuthUrl } from "../lib/authRedirect";
import type { Profile } from "../types";

type ErrorLike = {
  name?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};

const toErrorLike = (error: unknown): ErrorLike => {
  if (error && typeof error === "object") return error as ErrorLike;
  return { message: String(error) };
};

const isAbortLikeError = (error: unknown): boolean => {
  const err = toErrorLike(error);
  return (
    err.name === "AbortError" ||
    err.message?.includes("abort") === true ||
    err.code === "ECONNABORTED"
  );
};

export type UseUserAccessResult = {
  loading: boolean;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  access: UserAccess;
};

/**
 * Hook to load user session, profile, and access level
 * Handles redirects for unauthenticated users or missing profiles
 *
 * DIAGNOSTIC: This hook is used in multiple components per page (e.g. TopBar, page).
 * Each call runs its own effect → separate getSession() + profiles.select() per component.
 * SUGGESTION: Consider a single AuthContext so session/profile are fetched once and consumed everywhere.
 */
export function useUserAccess(requireAuth: boolean = false, requireProfile: boolean = false): UseUserAccessResult {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<UserAccess>({ 
    role: "guest", plan: "free",
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
          // Silently ignore AbortError, but still stop loading so UI can render
          if (isAbortLikeError(sessionError)) {
            if (!isUnmounting && currentRequestId === requestId) {
              setUser(null);
              setProfile(null);
              setAccess({ role: "guest", hasPremium: false, isAdmin: false, plan: "free" });
              setLoading(false);
            }
            return;
          }
          // Сетевые ошибки (Failed to fetch) — гость, без сырого лога в консоль
          if (sessionError.name === 'TypeError' && (sessionError.message === 'Failed to fetch' || String(sessionError.message || '').includes('fetch'))) {
            if (!isUnmounting && currentRequestId === requestId) {
              setUser(null);
              setProfile(null);
              setAccess({ role: "guest", hasPremium: false, isAdmin: false, plan: "free" });
              setLoading(false);
            }
            if (process.env.NODE_ENV === 'development') {
              console.warn('[useUserAccess] Сеть недоступна (Failed to fetch). Проверьте интернет и NEXT_PUBLIC_SUPABASE_URL.');
            }
            return;
          }
          // Handle refresh token errors
          if (isRefreshTokenError(sessionError)) {
            await handleRefreshTokenError(sessionError);
            if (!isUnmounting && currentRequestId === requestId) {
              setUser(null);
              setProfile(null);
              setAccess({ 
                role: "guest", plan: "free",
                hasPremium: false, 
                isAdmin: false 
              });
              setLoading(false);
            }
            return;
          }
          
          // Enhanced error logging for production
          if (process.env.NODE_ENV === 'production') {
            console.error('[useUserAccess] Session error:', {
              message: sessionError.message,
              name: sessionError.name,
              status: toErrorLike(sessionError).status,
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
            router.replace(getAuthUrl(pathname ?? undefined));
            return;
          }
          if (!isUnmounting && currentRequestId === requestId) {
            setUser(null);
            setProfile(null);
            setAccess({ 
              role: "guest", plan: "free",
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

        // Load profile with role, subscription, and interests fields
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id,display_name,username,avatar_url,bio,role,subscription_status,is_admin,favorite_categories,favorite_tags,created_at,plan,plan_period,plan_renews_at,stripe_customer_id,bonus_listing_credits")
          .eq("id", currentUser.id)
          .maybeSingle();

        // Check if this request is still valid
        if (isUnmounting || currentRequestId !== requestId) {
          return;
        }

        if (profileError) {
          // Silently ignore AbortError, but still stop loading so UI can render
          if (isAbortLikeError(profileError)) {
            if (!isUnmounting && currentRequestId === requestId) {
              setProfile(null);
              setAccess(getUserAccess(null));
              setLoading(false);
            }
            return;
          }
          // Сетевые ошибки (Failed to fetch) — гость, без сырого лога
          if (profileError.name === 'TypeError' && (profileError.message === 'Failed to fetch' || String(profileError.message || '').includes('fetch'))) {
            if (!isUnmounting && currentRequestId === requestId) {
              setProfile(null);
              setAccess(getUserAccess(null));
              setLoading(false);
            }
            if (process.env.NODE_ENV === 'development') {
              console.warn('[useUserAccess] Сеть недоступна (Failed to fetch). Проверьте интернет и NEXT_PUBLIC_SUPABASE_URL.');
            }
            return;
          }
          // Build a plain object so we never log "{}" (Supabase errors can stringify as empty)
          const errMsg = profileError.message ? String(profileError.message).trim() : '';
          const errCode = profileError.code ? String(profileError.code).trim() : '';
          const errDetails = profileError.details ? String(profileError.details).trim() : '';
          const errHint = profileError.hint ? String(profileError.hint).trim() : '';
          const errorObj: Record<string, string> = {};
          if (errMsg) errorObj.message = errMsg;
          if (errCode) errorObj.code = errCode;
          if (errDetails) errorObj.details = errDetails;
          if (errHint) errorObj.hint = errHint;

          if (Object.keys(errorObj).length > 0) {
            console.error('[useUserAccess] Profile error:', errorObj);
          } else if (process.env.NODE_ENV === 'development') {
            // Supabase вернул ошибку без стандартных полей — логируем сырой объект
            console.warn('[useUserAccess] Profile error (raw):', JSON.stringify(profileError, Object.getOwnPropertyNames(profileError)));
          }
        }

        const currentProfile = profileData ?? null;
        
        if (!isUnmounting && currentRequestId === requestId) {
          setProfile(currentProfile);

          // Check if profile is required
          if (requireProfile && !currentProfile) {
            // Future flow: redirect to profile setup if that route exists.
            // router.replace("/profile/setup");
            if (process.env.NODE_ENV === 'development') {
              console.warn("Profile required but not found");
            }
          }

          // Calculate access based on role system
          const userAccess = getUserAccess(currentProfile);
          setAccess(userAccess);

          setLoading(false);
        }
      } catch (err: unknown) {
        const error = toErrorLike(err);
        // Silently ignore AbortError, but still stop loading so UI can render
        if (isAbortLikeError(err)) {
          if (!isUnmounting && currentRequestId === requestId) {
            setLoading(false);
          }
          return;
        }

        // Сетевые ошибки (Failed to fetch) — показываем гостя без сырого TypeError в консоли
        if (error.name === 'TypeError' && (error.message === 'Failed to fetch' || error.message?.includes('fetch'))) {
          if (!isUnmounting && currentRequestId === requestId) {
            setUser(null);
            setProfile(null);
            setAccess({ role: "guest", hasPremium: false, isAdmin: false, plan: "free" });
            setLoading(false);
          }
          if (process.env.NODE_ENV === 'development') {
            console.warn('[useUserAccess] Сеть недоступна (Failed to fetch). Проверьте интернет и NEXT_PUBLIC_SUPABASE_URL.');
          }
          return;
        }
        
        // Handle refresh token errors
        if (isRefreshTokenError(err)) {
          await handleRefreshTokenError(err);
          if (!isUnmounting && currentRequestId === requestId) {
            setUser(null);
            setProfile(null);
            setAccess({ 
              role: "guest", plan: "free",
              hasPremium: false, 
              isAdmin: false 
            });
            setLoading(false);
          }
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
