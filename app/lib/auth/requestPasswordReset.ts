import { supabase, getAuthRedirectUrl } from "../supabase";
import { getSafeRedirectFrom } from "../authRedirect";
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
  redirectAfterUpdate = "/",
}: {
  email: string;
  redirectAfterUpdate?: string;
}): Promise<ResetRequestResult> {
  const safeRedirect = getSafeRedirectFrom(redirectAfterUpdate) ?? "/";
  const updatePasswordPath =
    safeRedirect === "/"
      ? "/auth/update-password"
      : `/auth/update-password?from=${encodeURIComponent(safeRedirect)}`;
  const redirectTo = getAuthRedirectUrl(
    `/auth/callback?next=${encodeURIComponent(updatePasswordPath)}`
  );

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }
  return { ok: true };
}
