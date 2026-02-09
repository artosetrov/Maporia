"use client";

import { useRouter, usePathname } from "next/navigation";
import { getAuthUrl } from "../lib/authRedirect";
import { trackAuthRedirect } from "../lib/analytics";
import { usePremiumModalContext } from "../contexts/PremiumModalContext";

/**
 * Returns helpers for auth flow:
 * - redirectToAuth: opens AuthModal overlay (for user actions like Get Started, like, comment)
 * - replaceToAuth: hard navigation to /auth (for auth guards on protected pages and logouts)
 */
export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { openAuthModal } = usePremiumModalContext();
  const authUrl = getAuthUrl(pathname);

  return {
    authUrl,
    redirectToAuth: (trigger?: string) => {
      trackAuthRedirect(trigger);
      openAuthModal(pathname);
    },
    replaceToAuth: (trigger?: string) => {
      trackAuthRedirect(trigger);
      router.replace(authUrl);
    },
  };
}
