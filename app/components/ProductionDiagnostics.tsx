"use client";

import { useEffect } from "react";
import { logProductionDiagnostics, logSupabaseStatus, logFirstFailure } from "../lib/diagnostics";
import { supabase } from "../lib/supabase";

/**
 * Production diagnostics component
 * Only runs in production to help diagnose issues
 */
export function ProductionDiagnostics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    // Log initial diagnostics
    logProductionDiagnostics();

    // Log Supabase status after a short delay
    const timeout = setTimeout(() => {
      logSupabaseStatus(supabase);
    }, 1000);

    // Unregister service workers if they exist (hard cache bust)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          console.warn('🔄 Unregistering Service Workers for cache bust...');
          Promise.all(
            registrations.map((reg) => reg.unregister())
          ).then((results) => {
            const unregistered = results.filter(Boolean).length;
            if (unregistered > 0) {
              console.log(`✅ Unregistered ${unregistered} Service Worker(s)`);
              // Reload page to clear cache
              window.location.reload();
            }
          });
        }
      });
    }

    // Track first failing fetch request
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      try {
        const response = await originalFetch.apply(this, args);
        
        // Log first non-2xx response
        if (!response.ok) {
          const url = typeof args[0] === 'string' 
            ? args[0] 
            : args[0] instanceof Request 
            ? args[0].url 
            : (args[0] as URL).toString();
          logFirstFailure(url, response.status, null);
        }
        
        return response;
      } catch (error: any) {
        // Log first fetch error
        const url = typeof args[0] === 'string' 
          ? args[0] 
          : args[0] instanceof Request 
          ? args[0].url 
          : (args[0] as URL).toString();
        logFirstFailure(url, 0, error);
        throw error;
      }
    };

    return () => {
      clearTimeout(timeout);
      // Restore original fetch (though this component shouldn't unmount)
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
