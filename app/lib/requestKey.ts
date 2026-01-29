/**
 * Generate a stable request key for cache deduplication.
 * Used by useStableFetch / useStableQuery.
 */

export function generateRequestKey(
  table: string,
  params: Record<string, unknown>
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
  return sorted ? `${table}?${sorted}` : table;
}
