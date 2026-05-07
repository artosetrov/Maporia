import { supabase } from "../supabase";
import { mapAuthError, type MappedAuthError } from "./errors";

export type SignInResult =
  | { ok: true }
  | { ok: false; error: MappedAuthError };

/**
 * Вход по email+пароль. Сессия ставится Supabase автоматически (persistSession=true);
 * onAuthStateChange сработает, и UserAccessContext подтянет профиль.
 */
export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }
  return { ok: true };
}
