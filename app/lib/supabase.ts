import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

// Validate required environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Log environment variable status (without values for security)
if (typeof window !== 'undefined') {
  const envCheck = {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlLength: supabaseUrl?.length || 0,
    keyLength: supabaseAnonKey?.length || 0,
    nodeEnv: process.env.NODE_ENV,
    // Check if we're in production
    isProduction: process.env.NODE_ENV === 'production',
  };
  
  console.log('[Supabase] Environment check:', envCheck);
  
  // In production, also log to help debug
  if (process.env.NODE_ENV === 'production') {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Supabase] ⚠️ CRITICAL: Environment variables missing in production!', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        location: window.location.href,
      });
    }
  }
}

if (!supabaseUrl) {
  const error = "Missing NEXT_PUBLIC_SUPABASE_URL environment variable";
  console.error("❌", error);
  if (typeof window !== 'undefined') {
    console.error("This error will prevent the app from working. Please set NEXT_PUBLIC_SUPABASE_URL in your environment variables.");
    // Don't throw in browser - allow app to render with error state
    // This prevents complete app failure on production
  } else {
    // Throw on server side to fail fast during build
    throw new Error(error);
  }
}

if (!supabaseAnonKey) {
  const error = "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable";
  console.error("❌", error);
  if (typeof window !== 'undefined') {
    console.error("This error will prevent the app from working. Please set NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.");
    // Don't throw in browser - allow app to render with error state
  } else {
    // Throw on server side to fail fast during build
    throw new Error(error);
  }
}

// Check if we have valid environment variables
export const hasValidSupabaseConfig = !!(supabaseUrl && supabaseAnonKey);

// Create Supabase client - use actual values if available, otherwise placeholder
// This prevents app crash on production if env vars are not set
// The app will show an error message instead of crashing
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseAnonKey || 'placeholder-key';

// Единый экземпляр Supabase клиента для всего приложения
// Typed with Database schema for type-safe queries
export const supabase = createClient<Database>(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // CRITICAL: Don't use default redirect URL - we'll handle redirects manually
    // This prevents Supabase from redirecting to production
    flowType: 'pkce', // Use PKCE flow for better security and control
  },
  global: {
    // Add headers for better debugging
    headers: {
      'x-client-info': 'maporia-web',
    },
  },
});

// Log Supabase client initialization in production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  console.log('[Supabase] Client initialized:', {
    url: safeUrl.substring(0, 30) + '...',
    hasValidConfig: hasValidSupabaseConfig,
    userAgent: navigator.userAgent.substring(0, 50),
  });
  
  // Test connection immediately with timeout and proper error handling
  const sessionCheckTimeout = setTimeout(() => {
    console.warn('[Supabase] Initial session check timed out');
  }, 5000);
  
  supabase.auth.getSession().then(({ data, error }) => {
    clearTimeout(sessionCheckTimeout);
    if (error) {
      // Silently ignore AbortError
      if (error.message?.includes('abort') || error.name === 'AbortError') {
        return;
      }
      console.error('[Supabase] Initial session check failed:', {
        message: error.message,
        name: error.name,
      });
    } else {
      console.log('[Supabase] Initial session check:', {
        hasSession: !!data.session,
        userId: data.session?.user?.id?.substring(0, 8) || null,
      });
    }
  }).catch((err) => {
    clearTimeout(sessionCheckTimeout);
    // Silently ignore AbortError
    if (err?.name === 'AbortError' || err?.message?.includes('abort') || err?.message?.includes('signal is aborted')) {
      return;
    }
    console.error('[Supabase] Initial session check exception:', {
      name: err?.name,
      message: err?.message,
    });
  });
}

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
  
  // CRITICAL: Always use current origin to stay on the same host
  // This ensures:
  // - localhost:3000 → stays on localhost:3000
  // - staging domain → stays on staging
  // - production domain → stays on production
  const origin = window.location.origin;
  
  // Убеждаемся, что path начинается с /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  const redirectUrl = `${origin}${normalizedPath}`;
  
  // Debug logging - always log to help debug redirect issues
  console.log('[Auth] Redirect URL:', redirectUrl, 'from origin:', origin, 'current URL:', window.location.href);
  
  return redirectUrl;
}
