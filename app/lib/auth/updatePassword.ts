import { supabase } from "../supabase";
import { mapAuthError, type MappedAuthError } from "./errors";

export type UpdatePasswordResult =
  | { ok: true }
  | { ok: false; error: MappedAuthError };

/**
 * Обновить пароль текущего юзера. Доступно только когда есть активная сессия —
 * либо обычный логин, либо recovery-сессия из reset-link.
 */
export async function updatePassword({
  newPassword,
}: {
  newPassword: string;
}): Promise<UpdatePasswordResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, error: mapAuthError(error)! };
  }
  return { ok: true };
}
