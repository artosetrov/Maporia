import { createClient } from "@supabase/supabase-js";

// Единый экземпляр Supabase клиента для всего приложения
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Получает URL для редиректа после аутентификации
 * Использует текущий origin динамически (localhost или production)
 * 
 * @param path - Путь для редиректа (по умолчанию "/")
 * @returns Полный URL для редиректа на текущий origin
 * 
 * @example
 * // На localhost:3000 → "http://localhost:3000/"
 * // На production → "https://yourdomain.com/"
 * getAuthRedirectUrl("/") 
 * getAuthRedirectUrl("/profile")
 */
export function getAuthRedirectUrl(path: string = "/"): string {
  // Проверяем, что мы в браузере (не на сервере)
  if (typeof window === 'undefined') {
    throw new Error('getAuthRedirectUrl can only be called on the client side');
  }
  
  const origin = window.location.origin;
  // Убеждаемся, что path начинается с /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}
