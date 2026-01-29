"use client";

import { useRouter, usePathname } from "next/navigation";
import { getAuthUrl } from "../lib/authRedirect";
import { trackAuthRedirect } from "../lib/analytics";

/**
 * Returns helpers to redirect to /auth with current path as ?from=.
 * Use for "Sign in" buttons and auth guards so ?from= is consistent.
 * Pass trigger to redirectToAuth/replaceToAuth for analytics (e.g. 'sign_in_button', 'unlock_cta').
 */
export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const authUrl = getAuthUrl(pathname);

  return {
    authUrl,
    redirectToAuth: (trigger?: string) => {
      trackAuthRedirect(trigger);
      router.push(authUrl);
    },
    replaceToAuth: (trigger?: string) => {
      trackAuthRedirect(trigger);
      router.replace(authUrl);
    },
  };
}
