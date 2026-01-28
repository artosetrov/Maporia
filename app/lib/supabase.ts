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
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Supabase] Environment check:', envCheck);
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

/**
 * Checks if an error is related to refresh token issues
 */
export function isRefreshTokenError(error: any): boolean {
  if (!error) return false;
  const message = error.message || error.error_description || '';
  return (
    message.includes('Refresh Token') ||
    message.includes('invalid_grant') ||
    message.includes('Refresh Token Not Found') ||
    error.error === 'invalid_grant'
  );
}

/**
 * Handles refresh token errors by clearing invalid session
 */
export async function handleRefreshTokenError(error: any): Promise<void> {
  if (isRefreshTokenError(error)) {
    console.warn('[Supabase] Refresh token error detected, clearing invalid session:', {
      message: error.message || error.error_description,
      error: error.error,
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

// Set up global error handler for refresh token errors (client-side only)
if (typeof window !== 'undefined') {
  // Listen for auth state changes to catch refresh token errors
  supabase.auth.onAuthStateChange(async (event, session) => {
    // Handle token refresh errors
    if (event === 'TOKEN_REFRESHED' && !session) {
      // Token refresh failed - clear invalid session
      console.warn('[Supabase] Token refresh failed, clearing invalid session');
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Ignore sign out errors - we're already cleaning up
      }
    }
  });

  // Listen for unhandled promise rejections related to auth
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    if (isRefreshTokenError(error)) {
      event.preventDefault(); // Prevent error from being logged to console
      handleRefreshTokenError(error);
    }
  });
}

// Log Supabase client initialization (dev only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('[Supabase] Client initialized:', {
    url: safeUrl.substring(0, 30) + '...',
    hasValidConfig: hasValidSupabaseConfig,
    userAgent: navigator.userAgent.substring(0, 50),
  });
  
  // Test connection immediately with timeout and proper error handling
  // Use a longer timeout (20 seconds) and make it non-blocking
  // This is a diagnostic check only - it should not block or warn unnecessarily
  let sessionCheckCompleted = false;
  const sessionCheckTimeout = setTimeout(() => {
    if (!sessionCheckCompleted) {
      // Only log as info (not warning) - this is expected in some network conditions
      // The app will continue to work even if this check is slow
      console.log('[Supabase] Initial session check still in progress (this is normal)');
    }
  }, 20000); // Increased to 20 seconds
  
  supabase.auth.getSession().then(async ({ data, error }) => {
    sessionCheckCompleted = true;
    clearTimeout(sessionCheckTimeout);
    if (error) {
      // Silently ignore AbortError
      if (error.message?.includes('abort') || error.name === 'AbortError') {
        return;
      }
      
      // Handle refresh token errors
      if (isRefreshTokenError(error)) {
        await handleRefreshTokenError(error);
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
      
      // Test a simple query to places table to verify RLS policies
      if (hasValidSupabaseConfig) {
        const testQueryStart = Date.now();
        supabase
          .from("places")
          .select("id", { count: 'exact', head: true })
          .limit(1)
          .then(({ data: testData, error: testError, count }) => {
            const testDuration = Date.now() - testQueryStart;
            if (testError) {
              // Don't log AbortError
              if (!testError.message?.includes('abort') && testError.name !== 'AbortError' && (testError as any).code !== 'ECONNABORTED') {
                console.error('[Supabase] Test query failed:', {
                  message: testError.message,
                  code: testError.code,
                  details: testError.details,
                  hint: testError.hint,
                  duration: `${testDuration}ms`,
                });
              }
            } else if (process.env.NODE_ENV === 'development') {
              console.log('[Supabase] Test query success:', {
                count: count || 0,
                duration: `${testDuration}ms`,
              });
            }
          })
          .catch((testErr) => {
            // Silently ignore AbortError
            if (testErr?.name === 'AbortError' || testErr?.message?.includes('abort')) {
              return;
            }
            console.error('[Supabase] Test query exception:', {
              name: testErr?.name,
              message: testErr?.message,
            });
          });
      }
    }
  }).catch(async (err) => {
    sessionCheckCompleted = true;
    clearTimeout(sessionCheckTimeout);
    // Silently ignore AbortError
    if (err?.name === 'AbortError' || err?.message?.includes('abort') || err?.message?.includes('signal is aborted')) {
      return;
    }
    
    // Handle refresh token errors
    if (isRefreshTokenError(err)) {
      await handleRefreshTokenError(err);
      return;
    }
    
    // Only log non-abort errors, and make them warnings in production
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Supabase] Initial session check exception (non-critical):', {
        name: err?.name,
        message: err?.message,
      });
    } else {
      console.error('[Supabase] Initial session check exception:', {
        name: err?.name,
        message: err?.message,
      });
    }
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
  
  // Debug logging (dev only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Auth] Redirect URL:', redirectUrl, 'from origin:', origin, 'current URL:', window.location.href);
  }
  
  return redirectUrl;
}
