/**
 * ImpersonationBanner — sticky-баннер в шапке, виден только когда админ
 * сейчас работает под чужой сессией.
 *
 * Этот файл = серверный wrapper. Решение "показывать или нет" принимается на
 * сервере по cookie impersonation_log_id. Сама кнопка "Вернуться" живёт в
 * <ImpersonationBannerClient />, потому что должна сделать
 * supabase.auth.setSession() в браузере.
 */

import { isImpersonating } from "@/app/lib/impersonation";
import ImpersonationBannerClient from "./ImpersonationBannerClient";

export default async function ImpersonationBanner() {
  const active = await isImpersonating();
  if (!active) return null;
  return <ImpersonationBannerClient />;
}
