import { createClient } from "@supabase/supabase-js";

// Validate required environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  const error = "Missing NEXT_PUBLIC_SUPABASE_URL environment variable";
  console.error("❌", error);
  if (typeof window !== 'undefined') {
    console.error("This error will prevent the app from working. Please set NEXT_PUBLIC_SUPABASE_URL in your environment variables.");
  }
  throw new Error(error);
}

if (!supabaseAnonKey) {
  const error = "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable";
  console.error("❌", error);
  if (typeof window !== 'undefined') {
    console.error("This error will prevent the app from working. Please set NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.");
  }
  throw new Error(error);
}

// Единый экземпляр Supabase клиента для всего приложения
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Получает URL для редиректа после аутентификации
 * Использует текущий origin динамически (localhost или production)
 * 
 * Supports both www and non-www domains by using current origin
 * 
 * @param path - Путь для редиректа (по умолчанию "/")
 * @returns Полный URL для редиректа на текущий origin
 * 
 * @example
 * // На localhost:3000 → "http://localhost:3000/"
 * // На production → "https://maporia.co/" или "https://www.maporia.co/"
 * getAuthRedirectUrl("/") 
 * getAuthRedirectUrl("/profile")
 */
export function getAuthRedirectUrl(path: string = "/"): string {
  // Проверяем, что мы в браузере (не на сервере)
  if (typeof window === 'undefined') {
    throw new Error('getAuthRedirectUrl can only be called on the client side');
  }
  
  // Always use current origin (supports both www and non-www)
  const origin = window.location.origin;
  
  // Убеждаемся, что path начинается с /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  const redirectUrl = `${origin}${normalizedPath}`;
  
  return redirectUrl;
}
