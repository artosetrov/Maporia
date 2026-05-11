import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/app/lib/logger";

/**
 * Proxy Google Places photos without exposing the server API key to the client.
 */
const MAX_PHOTO_REFERENCE_LENGTH = 2048;
const MIN_PHOTO_WIDTH = 1;
const MAX_PHOTO_WIDTH = 1600;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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
      return NextResponse.json(
        { error: "Too many photo requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference")?.trim();
    const maxwidth = parseMaxWidth(searchParams.get("maxwidth"));

    if (!reference) {
      return NextResponse.json(
        { error: "Photo reference is required" },
        { status: 400 }
      );
    }

    if (reference.length > MAX_PHOTO_REFERENCE_LENGTH) {
      return NextResponse.json(
        { error: "Photo reference is invalid" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key is not configured" },
        { status: 503 }
      );
    }

    const params = new URLSearchParams({
      maxwidth: String(maxwidth),
      photo_reference: reference,
      key: apiKey,
    });
    const googleResponse = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`,
      { redirect: "follow" }
    );

    if (!googleResponse.ok || !googleResponse.body) {
      logger.warn("[google/photo] Google photo fetch failed:", googleResponse.status);
      return NextResponse.json(
        { error: "Failed to load photo" },
        { status: googleResponse.status >= 400 && googleResponse.status < 500 ? 404 : 502 }
      );
    }

    return new NextResponse(googleResponse.body, {
      status: googleResponse.status,
      headers: {
        "Content-Type": googleResponse.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    logger.error("[google/photo] Photo proxy error:", error);
    return NextResponse.json(
      { error: "Failed to load photo" },
      { status: 500 }
    );
  }
}
