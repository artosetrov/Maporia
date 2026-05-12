/**
 * POST /api/track — клиентский трекер просмотров страниц.
 *
 * Пишет одну строку в public.page_views_raw через service-role клиент.
 * RLS на таблице полностью закрыт; пишем только отсюда.
 *
 * Принимает JSON:
 *   {
 *     session_id:  uuid (обязательно)
 *     path:        string (обязательно)
 *     query?:      string
 *     referrer?:   string (полный URL; здесь извлекаем только host)
 *     user_id?:    uuid (клиент шлёт, но сервер ВЕРИФИЦИРУЕТ из cookies)
 *     utm_source?, utm_medium?, utm_campaign?: string
 *   }
 *
 * Гео и UA подбираем с server-side headers (Vercel: x-vercel-ip-country/city,
 * стандартный user-agent). IP в БД не сохраняем.
 *
 * Бот-фильтр: простой UA regex. False-positive принимаем — задача аналитики,
 * не биллинг.
 *
 * 204 No Content при успехе. 4xx/5xx — но клиент всё равно fire-and-forget
 * и игнорирует ответ.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/app/types/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// ──────────────── helpers ────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_RE = /bot|crawl|spider|preview|monitor|http-?client|curl|wget|axios|node-fetch|headless|phantom|selenium|puppeteer/i;

function safeHost(input: string | undefined | null): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function parseUA(ua: string): { device: string; browser: string | null; os: string | null } {
  const lc = ua.toLowerCase();
  let device: "mobile" | "desktop" | "tablet" | "unknown" = "desktop";
  if (/ipad|tablet/.test(lc)) device = "tablet";
  else if (/mobi|android.*mobile|iphone|ipod/.test(lc)) device = "mobile";
  else if (/android/.test(lc)) device = "mobile";
  else if (!ua) device = "unknown";

  let browser: string | null = null;
  if (/edg\//.test(lc)) browser = "edge";
  else if (/chrome\//.test(lc) && !/edg\//.test(lc)) browser = "chrome";
  else if (/firefox\//.test(lc)) browser = "firefox";
  else if (/safari\//.test(lc) && !/chrome\//.test(lc)) browser = "safari";
  else if (/opr\//.test(lc) || /opera/.test(lc)) browser = "opera";

  let os: string | null = null;
  if (/windows/.test(lc)) os = "Windows";
  else if (/mac os|macintosh/.test(lc)) os = "macOS";
  else if (/android/.test(lc)) os = "Android";
  else if (/iphone|ipad|ipod|ios/.test(lc)) os = "iOS";
  else if (/linux/.test(lc)) os = "Linux";

  return { device, browser, os };
}

const PLACE_ID_RE = /^\/id\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
function extractPlaceId(path: string): string | null {
  const m = path.match(PLACE_ID_RE);
  return m ? m[1].toLowerCase() : null;
}

function cleanString(s: unknown, maxLen = 256): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

// ──────────────── handler ────────────────

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "config" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }

  const sessionId = cleanString(body.session_id);
  const path = cleanString(body.path, 512);
  if (!sessionId || !UUID_RE.test(sessionId) || !path) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent") || "";
  const isBot = BOT_RE.test(ua) || ua.length === 0;
  const { device, browser, os } = parseUA(ua);

  const country =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    null;
  const city = req.headers.get("x-vercel-ip-city") || null;

  // user_id: верифицируем через Supabase Auth cookies (а не доверяем клиенту).
  // Если SSR-куки нет — пишем NULL (guest).
  let verifiedUserId: string | null = null;
  try {
    if (supabaseUrl && supabaseAnonKey) {
      const cookieStore = await cookies();
      const accessToken = cookieStore.get("sb-access-token")?.value
        || cookieStore.getAll().find((c) => c.name.endsWith("-auth-token"))?.value
        || null;
      if (accessToken) {
        // Бросать токен в getUser — медленно (extra request). На v1 ок;
        // если станет hot path — переедем на JWT-decode без round-trip.
        const probe = createClient<Database>(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data } = await probe.auth.getUser(accessToken);
        if (data?.user?.id) verifiedUserId = data.user.id;
      }
    }
  } catch {
    // молча — guest
  }

  const referrerHost = safeHost(cleanString(body.referrer, 2048));
  const placeId = extractPlaceId(path);

  const row = {
    session_id: sessionId,
    user_id: verifiedUserId,
    path,
    query: cleanString(body.query, 1024),
    referrer_host: referrerHost,
    utm_source: cleanString(body.utm_source, 128),
    utm_medium: cleanString(body.utm_medium, 128),
    utm_campaign: cleanString(body.utm_campaign, 128),
    country,
    city,
    device,
    browser,
    os,
    place_id: placeId,
    is_bot: isBot,
  };

  // Не блокируем клиента ошибкой БД — он fire-and-forget.
  // page_views_raw создан миграцией позже генерации Database-типов, поэтому
  // приходится приводить через unknown. Регенерация: `npm run db:types`.
  const { error } = await (
    supabaseAdmin.from("page_views_raw" as unknown as never) as unknown as {
      insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(row);

  if (error) {
    // Лог в Vercel, но клиенту 204.
    console.error("[track] insert failed:", error.message);
  }

  return new NextResponse(null, { status: 204 });
}
