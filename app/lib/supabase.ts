import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import { logger } from "@/app/lib/logger";

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
  
  if (process.env.NODE_ENV === 'development') {
    logger.debug('[Supabase] Environment check:', envCheck);
  }
  
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

// IMPORTANT: НЕ throw'им на server side, иначе Next.js prerender (Generating
// static pages) валит build, если env vars не подсосались в build-окружение.
// Импорт модуля сам по себе безопасен — placeholder клиент всё равно
// собирается, а реальные API-вызовы происходят runtime, где у нас уже
// есть hasValidSupabaseConfig-чек и проверка `safeUrl !== placeholder`.
if (!supabaseUrl) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}

if (!supabaseAnonKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
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
    // IMPORTANT: Disable auto-refresh on init to prevent SDK console.error
    // when refresh token is stale. We call startAutoRefresh() manually
    // after validating the session (see initSession below).
    autoRefreshToken: false,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: {
      'x-client-info': 'maporia-web',
    },
  },
});

// Отдельный клиент для passwordless 6-digit OTP флоу.
// Главный клиент использует flowType: 'pkce' (необходим для Google OAuth, security).
// Но в PKCE-режиме `signInWithOtp` шлёт OTP с code_challenge, и сырой 6-значный
// код через `verifyOtp` без `code_verifier` сервер отклоняет ("Invalid or expired").
// Поэтому для AuthModal заводим отдельный implicit-flow клиент: он генерирует OTP
// без PKCE-обёртки, и `verifyOtp({ token, email, type: 'email' })` работает напрямую.
// Сессия после verifyOtp создаётся в storage этого клиента, но onAuthStateChange
// в основном `supabase` тоже её увидит — оба клиента используют один localStorage
// (по умолчанию key='sb-<project-ref>-auth-token').
export const supabaseOtp = createClient<Database>(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
  global: {
    headers: {
      'x-client-info': 'maporia-web-otp',
    },
  },
});

/**
 * Checks if an error is related to refresh token issues
 */
type SupabaseAuthErrorLike = {
  message?: string;
  error_description?: string;
  error?: string;
};

function toAuthErrorLike(error: unknown): SupabaseAuthErrorLike {
  if (error && typeof error === 'object') return error as SupabaseAuthErrorLike;
  return { message: String(error) };
}

export function isRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  const err = toAuthErrorLike(error);
  const message = err.message || err.error_description || '';
  return (
    message.includes('Refresh Token') ||
    message.includes('invalid_grant') ||
    message.includes('Refresh Token Not Found') ||
    err.error === 'invalid_grant'
  );
}

/**
 * Handles refresh token errors by clearing invalid session
 */
export async function handleRefreshTokenError(error: unknown): Promise<void> {
  if (isRefreshTokenError(error)) {
    const err = toAuthErrorLike(error);
    logger.warn('[Supabase] Refresh token error detected, clearing invalid session:', {
      message: err.message || err.error_description,
      error: err.error,
    });
    try {
      // Clear session locally without redirecting
      await supabase.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      // Ignore sign out errors - session may already be cleared
      console.debug('[Supabase] Error during sign out cleanup:', signOutError);
    }
  }
}

// Client-side: validate session, clear stale tokens, then enable auto-refresh
if (typeof window !== 'undefined') {
  // Catch unhandled rejections related to auth/network (safety net)
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    if (isRefreshTokenError(error)) {
      event.preventDefault();
      handleRefreshTokenError(error);
      return;
    }
    if (
      error?.name === 'TypeError' &&
      (error?.message === 'Failed to fetch' || String(error?.message || '').includes('fetch'))
    ) {
      event.preventDefault();
      if (process.env.NODE_ENV === 'development') {
        logger.warn('[Supabase] Сеть недоступна (Failed to fetch). Проверьте интернет и .env.local.');
      }
    }
  });

  /**
   * Session initialization:
   * 1. Validate current session via getSession() (triggers refresh if expired)
   * 2. If refresh token is stale → clear session locally
   * 3. Start auto-refresh AFTER validation so the SDK never hits a stale token
   */
  const initSession = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        // Ignore abort / network errors — they're transient
        if (error.message?.includes('abort') || error.name === 'AbortError') return;
        if (error.name === 'TypeError' && error.message?.includes('fetch')) {
          if (process.env.NODE_ENV === 'development') {
            logger.warn('[Supabase] Нет доступа к серверу. Проверьте NEXT_PUBLIC_SUPABASE_URL и интернет.');
          }
          return;
        }

        // Stale refresh token → sign out locally and clear storage
        if (isRefreshTokenError(error)) {
          await handleRefreshTokenError(error);
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          logger.warn('[Supabase] Session init error:', error.message);
        }
      } else if (process.env.NODE_ENV === 'development') {
        logger.debug('[Supabase] Session:', data.session ? 'active' : 'none');
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError' || e?.message?.includes?.('abort')) return;
      if (e?.name === 'TypeError' && e?.message?.includes?.('fetch')) return;

      if (isRefreshTokenError(err)) {
        await handleRefreshTokenError(err);
        return;
      }

      if (process.env.NODE_ENV === 'development') {
        logger.warn('[Supabase] Session init exception:', e?.message);
      }
    } finally {
      // Enable auto-refresh AFTER validation.
      // If the stale session was cleared, auto-refresh becomes a no-op.
      supabase.auth.startAutoRefresh();
    }
  };

  initSession();
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
  
  // Debug logging (dev only)
  if (process.env.NODE_ENV === 'development') {
    logger.debug('[Auth] Redirect URL:', redirectUrl, 'from origin:', origin, 'current URL:', window.location.href);
  }
  
  return redirectUrl;
}
