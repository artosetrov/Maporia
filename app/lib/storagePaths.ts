export const PLACE_PHOTOS_BUCKET = "place-photos";

export function getPublicStoragePath(url: string, bucket: string): string | null {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const bucketIndex = pathSegments.findIndex((segment) => segment === bucket);
    if (bucketIndex === -1) return null;

    const storagePath = pathSegments.slice(bucketIndex + 1).join("/");
    return storagePath ? decodeURIComponent(storagePath) : null;
  } catch {
    const escapedBucket = bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = url.match(new RegExp(`/${escapedBucket}/(.+)$`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}
