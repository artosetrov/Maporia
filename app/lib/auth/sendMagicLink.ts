import { supabase, getAuthRedirectUrl } from "../supabase";
import { mapAuthError, type MappedAuthError } from "./errors";

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; error: MappedAuthError };

/**
 * Magic-link альтернатива паролю. Оставлена как fallback — Артём не хочет
 * отрезать юзеров, у которых уже выработана привычка входить ссылкой.
 */
export async function sendMagicLink({
  email,
  redirectAfterClick = "/",
}: {
  email: string;
  redirectAfterClick?: string;
}): Promise<MagicLinkResult> {
  const next = redirectAfterClick.startsWith("/") ? redirectAfterClick : "/";
  const emailRedirectTo = getAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }
  return { ok: true };
}
