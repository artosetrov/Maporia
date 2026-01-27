/**
 * Production diagnostics for debugging host/redirect issues
 * Only runs in production to help diagnose desktop vs mobile issues
 */

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
  const hasExtensions = {
    adBlock: !!(window as any).adblock || !!(window as any).uBlock,
    privacyBadger: !!(window as any).PrivacyBadger,
  };
  if (Object.values(hasExtensions).some(Boolean)) {
    console.warn('⚠️ Browser extensions detected:', hasExtensions);
  }

  console.groupEnd();
}

/**
 * Log Supabase session status
 */
export async function logSupabaseStatus(supabase: any) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Session check timeout')), 5000);
    });
    
    const sessionPromise = supabase.auth.getSession();
    const { data: sessionData, error: sessionError } = await Promise.race([
      sessionPromise,
      timeoutPromise,
    ]) as any;
    
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
  } catch (err: any) {
    // Silently ignore AbortError and timeout
    if (err?.name === 'AbortError' || 
        err?.message?.includes('abort') || 
        err?.message?.includes('signal is aborted') ||
        err?.message?.includes('timeout')) {
      return;
    }
    console.error('❌ Error checking Supabase status:', {
      name: err?.name,
      message: err?.message,
    });
  }
}

/**
 * Log Google Maps loading status
 */
export function logGoogleMapsStatus(isLoaded: boolean, loadError: any) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  console.group('🗺️ Google Maps Status');
  console.log('Loaded:', isLoaded);
  if (loadError) {
    console.error('Load Error:', {
      message: loadError.message,
      name: loadError.name,
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

export function logFirstFailure(url: string, status: number, error: any) {
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
