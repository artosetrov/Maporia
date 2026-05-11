import { NextRequest } from "next/server";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const withProtocol = value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigin(): string | null {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.APP_URL) ||
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeOrigin(process.env.VERCEL_URL)
  );
}

function isLocalDevOrigin(origin: string | null): boolean {
  if (!origin || process.env.NODE_ENV === "production") return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function getAppRedirectOrigin(request: NextRequest): string {
  const configured = configuredOrigin();
  const requestOrigin =
    normalizeOrigin(request.headers.get("origin")) ||
    normalizeOrigin(request.headers.get("referer")) ||
    normalizeOrigin(request.nextUrl.origin);

  if (configured) {
    if (requestOrigin && (requestOrigin === configured || isLocalDevOrigin(requestOrigin))) {
      return requestOrigin;
    }
    return configured;
  }

  return requestOrigin || "http://localhost:3000";
}

export function getStripeRedirectOrigin(request: NextRequest): string {
  return getAppRedirectOrigin(request);
}
