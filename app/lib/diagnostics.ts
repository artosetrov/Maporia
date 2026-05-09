/**
 * Production diagnostics for debugging host/redirect issues
 * Only runs in production to help diagnose desktop vs mobile issues
 */

type ErrorLike = {
  name?: string;
  message?: string;
};

type ExtensionWindow = Window & {
  adblock?: unknown;
  uBlock?: unknown;
  PrivacyBadger?: unknown;
};

type SupabaseSessionResponse = {
  data: {
    session?: {
      user?: {
        id?: string | null;
        email?: string | null;
      } | null;
    } | null;
  };
  error?: ErrorLike | null;
};

type SupabaseAuthLike = {
  auth: {
    getSession: () => Promise<SupabaseSessionResponse>;
  };
};

const toErrorLike = (error: unknown): ErrorLike => {
  if (error && typeof error === "object") return error as ErrorLike;
  return { message: String(error) };
};

export function logProductionDiagnostics() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  console.group('🔍 Production Diagnostics');
  
  // Host information
  console.log('📍 Location:', {
    href: window.location.href,
    origin: window.location.origin,
    host: window.location.host,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    pathname: window.location.pathname,
  });

  // Environment variables (boolean only, no values)
  console.log('🔐 Environment Variables:', {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasGoogleMapsKey: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    nodeEnv: process.env.NODE_ENV,
  });

  // Service Worker check
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length > 0) {
        console.warn('⚠️ Service Workers found:', registrations.length);
        registrations.forEach((reg, i) => {
          console.warn(`  SW ${i + 1}:`, reg.scope);
        });
      } else {
        console.log('✅ No Service Workers registered');
      }
    });
  }

  // Check for browser extensions that might interfere
  const extensionWindow = window as ExtensionWindow;
  const hasExtensions = {
    adBlock: !!extensionWindow.adblock || !!extensionWindow.uBlock,
    privacyBadger: !!extensionWindow.PrivacyBadger,
  };
  if (Object.values(hasExtensions).some(Boolean)) {
    console.warn('⚠️ Browser extensions detected:', hasExtensions);
  }

  console.groupEnd();
}

/**
 * Log Supabase session status
 */
export async function logSupabaseStatus(supabase: SupabaseAuthLike) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Session check timeout')), 5000);
    });
    
    const sessionPromise = supabase.auth.getSession();
    const { data: sessionData, error: sessionError } = await Promise.race([
      sessionPromise,
      timeoutPromise,
    ]);
    
    console.group('🔐 Supabase Status');
    console.log('Session:', {
      hasSession: !!sessionData?.session,
      userId: sessionData?.session?.user?.id || null,
      email: sessionData?.session?.user?.email || null,
      error: sessionError ? {
        message: sessionError.message,
        name: sessionError.name,
      } : null,
    });
    console.groupEnd();
  } catch (err: unknown) {
    const error = toErrorLike(err);
    // Silently ignore AbortError and timeout
    if (error.name === 'AbortError' || 
        error.message?.includes('abort') || 
        error.message?.includes('signal is aborted') ||
        error.message?.includes('timeout')) {
      return;
    }
    console.error('❌ Error checking Supabase status:', {
      name: error.name,
      message: error.message,
    });
  }
}

/**
 * Log Google Maps loading status
 */
export function logGoogleMapsStatus(isLoaded: boolean, loadError: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  console.group('🗺️ Google Maps Status');
  console.log('Loaded:', isLoaded);
  if (loadError) {
    const error = toErrorLike(loadError);
    console.error('Load Error:', {
      message: error.message,
      name: error.name,
      details: loadError,
    });
  } else {
    console.log('✅ Google Maps loaded successfully');
  }
  console.groupEnd();
}

/**
 * Track first failing request
 */
let firstFailureLogged = false;

export function logFirstFailure(url: string, status: number, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (firstFailureLogged) {
    return;
  }

  firstFailureLogged = true;

  console.group('❌ First Request Failure');
  console.error('URL:', url);
  console.error('Status:', status);
  console.error('Error:', error);
  console.error('Timestamp:', new Date().toISOString());
  console.groupEnd();
}
