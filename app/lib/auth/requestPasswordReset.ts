import { supabase, getAuthRedirectUrl } from "../supabase";
import { mapAuthError, type MappedAuthError } from "./errors";

export type ResetRequestResult =
  | { ok: true }
  | { ok: false; error: MappedAuthError };

/**
 * Отправить письмо для сброса пароля.
 *
 * Юзер кликает ссылку → попадает на /auth/callback?next=/auth/update-password,
 * там обмен токена на recovery-сессию → редирект на /auth/update-password,
 * где юзер выставляет новый пароль через supabase.auth.updateUser({ password }).
 */
export async function requestPasswordReset({
  email,
}: {
  email: string;
}): Promise<ResetRequestResult> {
  const redirectTo = getAuthRedirectUrl(
    `/auth/callback?next=${encodeURIComponent("/auth/update-password")}`
  );

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }
  return { ok: true };
}
