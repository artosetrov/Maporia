/**
 * Hook for stable data fetching with:
 * - Stable request keys for deduplication
 * - Request-level caching (5-15 min)
 * - Prevention of duplicate requests
 * - Prevention of refetch on minor state changes
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { requestCache } from './requestCache';
import { generateRequestKey } from './requestKey';

interface FetchOptions<T> {
  requestKey: string;
  fetcher: () => Promise<T>;
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  enabled?: boolean; // Whether to fetch (default: true)
  onSuccess?: (data: T) => void;
  onError?: (error: unknown) => void;
  skipCache?: boolean; // Skip cache check (default: false)
}

interface UseStableFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
  invalidate: () => void;
}

/**
 * Hook for stable data fetching with caching and deduplication
 */
export function useStableFetch<T>({
  requestKey,
  fetcher,
  ttl = 5 * 60 * 1000, // 5 minutes default
  enabled = true,
  onSuccess,
  onError,
  skipCache = false,
}: FetchOptions<T>): UseStableFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestKeyRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (force = false) => {
    // Skip if disabled
    if (!enabled && !force) {
      return;
    }

    // Check cache first (unless forced or skipCache)
    if (!force && !skipCache) {
      const cached = requestCache.get<T>(requestKey);
      if (cached !== null) {
        setData(cached);
        setLoading(false);
        setError(null);
        onSuccess?.(cached);
        return;
      }
    }

    // Check if request is already pending
    const pending = requestCache.getPending<T>(requestKey);
    if (pending && !force) {
      try {
        const result = await pending;
        if (requestKeyRef.current === requestKey) {
          setData(result);
          setLoading(false);
          setError(null);
          onSuccess?.(result);
        }
      } catch (err) {
        if (requestKeyRef.current === requestKey) {
          setError(err);
          setLoading(false);
          onError?.(err);
        }
      }
      return;
    }

    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    const fetchPromise = (async () => {
      try {
        const result = await fetcher();
        if (abortController.signal.aborted) return;
        if (requestKeyRef.current !== requestKey) return;

        requestCache.set(requestKey, result, ttl);
        setData(result);
        setLoading(false);
        setError(null);
        onSuccess?.(result);
        return result;
      } catch (err: unknown) {
        if (abortController.signal.aborted) return;
        const error =
          err && typeof err === "object"
            ? (err as { name?: string; message?: string; code?: string })
            : { message: String(err) };
        if (error.name === 'AbortError' || error.message?.includes('abort') || error.code === 'ECONNABORTED') return;
        if (requestKeyRef.current !== requestKey) return;

        setError(err);
        setLoading(false);
        onError?.(err);
        throw err;
      }
    })();

    // Register pending request
    requestCache.setPending(requestKey, fetchPromise);

    // Wait for result
    try {
      await fetchPromise;
    } catch {
      // Error already handled above
    }
  }, [requestKey, fetcher, ttl, enabled, skipCache, onSuccess, onError]);

  // Refetch function
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Invalidate function
  const invalidate = useCallback(() => {
    requestCache.invalidate(requestKey);
    setData(null);
  }, [requestKey]);

  // Auto-fetch on mount or when requestKey changes
  useEffect(() => {
    const keyChanged = requestKeyRef.current !== requestKey;
    requestKeyRef.current = requestKey;

    if (!enabled) return;

    if (keyChanged) {
      const cached = skipCache ? null : requestCache.get<T>(requestKey);
      if (cached !== null) {
        setData(cached);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      fetchData();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [requestKey, enabled, skipCache, fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
    invalidate,
  };
}

/**
 * Hook for fetching with automatic request key generation
 */
export function useStableQuery<T>(
  options: Omit<FetchOptions<T>, 'requestKey'> & {
    table: string;
    params?: Record<string, unknown>;
  }
): UseStableFetchResult<T> {
  const requestKey = generateRequestKey(options.table, options.params || {});
  
  return useStableFetch<T>({
    ...options,
    requestKey,
  });
}
