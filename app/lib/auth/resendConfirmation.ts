import { supabase, getAuthRedirectUrl } from "../supabase";
import { mapAuthError, type MappedAuthError } from "./errors";

export type ResendResult =
  | { ok: true }
  | { ok: false; error: MappedAuthError };

/**
 * Повторно отправить письмо с подтверждением signup.
 * Используется когда signInWithPassword вернул "email_not_confirmed".
 */
export async function resendConfirmation({
  email,
  redirectAfterConfirm = "/",
}: {
  email: string;
  redirectAfterConfirm?: string;
}): Promise<ResendResult> {
  const next = redirectAfterConfirm.startsWith("/") ? redirectAfterConfirm : "/";
  const emailRedirectTo = getAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }
  return { ok: true };
}
