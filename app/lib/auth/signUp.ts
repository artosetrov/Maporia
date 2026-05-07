import { supabase, getAuthRedirectUrl } from "../supabase";
import { mapAuthError, type MappedAuthError } from "./errors";

export type SignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: MappedAuthError };

/**
 * Регистрация по email+пароль.
 *
 * Если в Supabase включён "Confirm email" (а он включён) — письмо со ссылкой
 * приходит автоматически, в data.session возвращается null. UI показывает
 * "Check your inbox" и НЕ редиректит — юзер кликает ссылку → попадает на
 * /auth/callback?next=/ → залогинен.
 *
 * @param redirectAfterConfirm Куда вернуть юзера после подтверждения.
 *                              По умолчанию "/" — корень.
 */
export async function signUp({
  email,
  password,
  redirectAfterConfirm = "/",
}: {
  email: string;
  password: string;
  redirectAfterConfirm?: string;
}): Promise<SignUpResult> {
  const next = redirectAfterConfirm.startsWith("/") ? redirectAfterConfirm : "/";
  const emailRedirectTo = getAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(next)}`);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }

  // Если confirm email = ON, session = null. Если когда-нибудь выключим — session уже есть.
  return { ok: true, needsEmailConfirmation: data.session === null };
}
