import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/app/lib/logger";
import type { PlacePhoto } from "@/app/types";

/**
 * Proxy Google Places photos without exposing the server API key to the client.
 */
const MAX_PHOTO_REFERENCE_LENGTH = 2048;
const MIN_PHOTO_WIDTH = 1;
const MAX_PHOTO_WIDTH = 1600;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const RATE_LIMIT_MAX_KEYS = 5000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

type GooglePhotoErrorCode =
  | "RATE_LIMITED"
  | "MISSING_REFERENCE"
  | "INVALID_REFERENCE"
  | "MISSING_GOOGLE_KEY"
  | "PHOTO_FETCH_FAILED"
  | "PHOTO_PROXY_ERROR";

type GooglePhotoErrorResponse = {
  error: string;
  code: GooglePhotoErrorCode;
};

type GooglePhotoJsonResponse = GooglePhotoErrorResponse | { url: PlacePhoto["url"] };

function jsonError(
  error: string,
  code: GooglePhotoErrorCode,
  status: number,
  headers?: HeadersInit
) {
  return NextResponse.json<GooglePhotoJsonResponse>({ error, code }, { status, headers });
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();

  if (rateLimitMap.size > RATE_LIMIT_MAX_KEYS) {
    for (const [existingKey, limit] of rateLimitMap.entries()) {
      if (now > limit.resetAt) rateLimitMap.delete(existingKey);
    }

    if (rateLimitMap.size > RATE_LIMIT_MAX_KEYS) rateLimitMap.clear();
  }

  const limit = rateLimitMap.get(key);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) return false;

  limit.count++;
  return true;
}

function parseMaxWidth(value: string | null): number {
  const parsed = Number.parseInt(value || "800", 10);
  if (!Number.isFinite(parsed)) return 800;
  return Math.min(Math.max(parsed, MIN_PHOTO_WIDTH), MAX_PHOTO_WIDTH);
}

export async function GET(request: NextRequest) {
  try {
    if (!checkRateLimit(getClientIp(request))) {
      return jsonError("Too many photo requests", "RATE_LIMITED", 429, { "Retry-After": "60" });
    }

    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim();
    const maxwidth = parseMaxWidth(searchParams.get("maxwidth"));

    if (!reference) {
      return jsonError("Photo reference is required", "MISSING_REFERENCE", 400);
    }

    if (reference.length > MAX_PHOTO_REFERENCE_LENGTH) {
      return jsonError("Photo reference is invalid", "INVALID_REFERENCE", 400);
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return jsonError("Google Maps API key is not configured", "MISSING_GOOGLE_KEY", 503);
    }

    const params = new URLSearchParams({
      maxwidth: String(maxwidth),
      photo_reference: reference,
      key: apiKey,
    });

    // Google Places photo API responds with 302 → signed lh3.googleusercontent.com URL.
    // Intercept the redirect (manual) and forward Location to the client.
    // This keeps the API key server-side while letting next/image and Vercel's
    // CDN handle the actual image bytes directly from Google's CDN (no streaming
    // through this function — fixes 504/500 from /_next/image on missing Content-Length).
    const googleResponse = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`,
      { redirect: "manual" }
    );

    const location = googleResponse.headers.get("location");
    if (
      (googleResponse.status === 301 ||
        googleResponse.status === 302 ||
        googleResponse.status === 303 ||
        googleResponse.status === 307 ||
        googleResponse.status === 308) &&
      location
    ) {
      try {
        const target = new URL(location);
        // Whitelist Google-owned hosts so we never redirect somewhere unexpected.
        const allowedHosts = new Set([
          "lh3.googleusercontent.com",
          "lh4.googleusercontent.com",
          "lh5.googleusercontent.com",
          "lh6.googleusercontent.com",
          "maps.googleapis.com",
          "places.googleapis.com",
        ]);
        if (target.protocol === "https:" && allowedHosts.has(target.hostname)) {
          return NextResponse.redirect(target.toString(), {
            status: 302,
            headers: {
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
            },
          });
        }
        logger.warn("[google/photo] Unexpected redirect host:", target.hostname);
      } catch {
        logger.warn("[google/photo] Invalid redirect Location header");
      }
    }

    // Defensive fallback: if Google returned the bytes directly (no redirect),
    // buffer them and forward with Content-Length so /_next/image can optimize.
    if (googleResponse.ok) {
      const buffer = await googleResponse.arrayBuffer();
      return new NextResponse(buffer, {
        status: googleResponse.status,
        headers: {
          "Content-Type": googleResponse.headers.get("content-type") || "image/jpeg",
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
        },
      });
    }

    logger.warn("[google/photo] Google photo fetch failed:", googleResponse.status);
    return jsonError(
      "Failed to load photo",
      "PHOTO_FETCH_FAILED",
      googleResponse.status >= 400 && googleResponse.status < 500 ? 404 : 502
    );
  } catch (error) {
    logger.error("[google/photo] Photo proxy error:", error);
    return jsonError("Failed to load photo", "PHOTO_PROXY_ERROR", 500);
  }
}
