/**
 * Hook for "latest-only" request pattern
 * Prevents race conditions and AbortError issues
 * 
 * Usage:
 * const { runLatest, requestIdRef } = useLatestRequest();
 * 
 * async function loadData() {
 *   const result = await runLatest(async () => {
 *     const { data, error } = await supabase.from('table').select();
 *     if (error) throw error;
 *     return data;
 *   });
 *   if (result !== undefined) {
 *     setData(result);
 *   }
 * }
 */
import { useRef } from 'react';

export function useLatestRequest() {
  const requestIdRef = useRef(0);

  async function runLatest<T>(
    fn: () => Promise<T>
  ): Promise<T | undefined> {
    const id = ++requestIdRef.current;
    
    try {
      const res = await fn();
      // Only return result if this is still the latest request
      if (id !== requestIdRef.current) {
        return undefined;
      }
      return res;
    } catch (e: any) {
      // If request was superseded, ignore error
      if (id !== requestIdRef.current) {
        return undefined;
      }
      // Silently ignore AbortError - don't log or throw
      if (e?.name === 'AbortError' || e?.message?.includes('abort') || (e as any)?.code === 'ECONNABORTED') {
        return undefined;
      }
      // Re-throw other errors
      throw e;
    }
  }

  function invalidate() {
    requestIdRef.current = Date.now();
  }

  return { runLatest, requestIdRef, invalidate };
}
