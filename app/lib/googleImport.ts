/**
 * Shared types and storage for 3-step Add Gem flow:
 * Step 1 Add Gem → Step 2 Import Preview → Step 3 Place Editor
 */

export const GOOGLE_IMPORT_PREVIEW_STORAGE_KEY = "google-import-preview";

export type GoogleImportSearchResult = {
  title: string | null;
  address: string | null;
  description: string | null;
  photos: Array<{ id: string; url: string; reference: string }>;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  city?: string | null;
  city_state?: string | null;
  city_country?: string | null;
  is_coordinate_only?: boolean;
};

export type GoogleImportPreviewStored = {
  result: GoogleImportSearchResult;
  /** When set, Import will update this place (from Step 1 Add Gem). Otherwise create new. */
  targetPlaceId: string | null;
};

export const IMPORT_FIELDS_COUNT = 5;

export function getImportFieldsFoundCount(result: GoogleImportSearchResult): number {
  let count = 0;
  if (result.title) count += 1;
  if (result.address) count += 1;
  if (result.description) count += 1;
  if (result.photos?.length) count += 1;
  if (result.lat != null && result.lng != null) count += 1;
  return count;
}

export function getImportProgressPercent(result: GoogleImportSearchResult): number {
  const found = getImportFieldsFoundCount(result);
  return Math.round((found / IMPORT_FIELDS_COUNT) * 100);
}
