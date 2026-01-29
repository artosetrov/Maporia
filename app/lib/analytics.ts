/**
 * Analytics placeholder. Replace with gtag/posthog/plausible when needed.
 * Call trackAuthRedirect(trigger) from useAuthRedirect on redirect to /auth.
 */
export function trackAuthRedirect(trigger?: string): void {
  if (typeof window === "undefined") return;
  // Example when you add a provider:
  // gtag("event", "auth_redirect", { trigger });
  // posthog?.capture("auth_redirect", { trigger });
  void trigger;
}
