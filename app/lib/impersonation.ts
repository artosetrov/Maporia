/**
 * Admin Impersonation — server-side helpers.
 *
 * Главное:
 *   - admin_session_backup  — HTTP-only signed cookie с access/refresh-токенами
 *                              админа, чтобы вернуться обратно. Подписана HMAC.
 *   - impersonation_log_id  — HTTP-only cookie с id записи в admin_impersonation_log.
 *                              Используется как маркер "сейчас идёт impersonation"
 *                              для UI-баннера и для гарда Stripe-роутов.
 *
 * Всё, что касается крипто, JWT и cookie, держим тут — чтобы routes были тонкие.
 */

import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// ----------------------------------------------------------------------------
// Константы
// ----------------------------------------------------------------------------

export const COOKIE_ADMIN_BACKUP = "admin_session_backup";
export const COOKIE_LOG_ID = "impersonation_log_id";

/** TTL impersonation-сессии. После этого срок exit-роут просто закроет запись. */
export const IMPERSONATION_TTL_SECONDS = 60 * 30; // 30 минут

// ----------------------------------------------------------------------------
// Подпись cookie
// ----------------------------------------------------------------------------

function getSecret(): string {
  const secret =
    process.env.IMPERSONATION_COOKIE_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "IMPERSONATION_COOKIE_SECRET (or SUPABASE_JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY) is required to sign impersonation cookies."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function timingSafeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// ----------------------------------------------------------------------------
// Backup-cookie с токенами админа
// ----------------------------------------------------------------------------

export type AdminBackup = {
  accessToken: string;
  refreshToken: string;
  adminId: string;
};

/** Сериализует и подписывает backup админских токенов. Кладём в HttpOnly cookie. */
export function encodeAdminBackup(backup: AdminBackup): string {
  const payload = Buffer.from(JSON.stringify(backup)).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function decodeAdminBackup(value: string | undefined): AdminBackup | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;

  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  if (!timingSafeEq(sig, expected)) return null;

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const obj = JSON.parse(json) as Partial<AdminBackup>;
    if (
      typeof obj.accessToken === "string" &&
      typeof obj.refreshToken === "string" &&
      typeof obj.adminId === "string"
    ) {
      return obj as AdminBackup;
    }
    return null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Helpers для server components / route handlers
// ----------------------------------------------------------------------------

/**
 * Проверяет, активен ли сейчас impersonation. Используется в:
 *   - Stripe routes (гард)
 *   - app/layout.tsx (показывать ли баннер)
 *   - status route
 *
 * NB: вызов из Server Component требует await cookies() (Next 15+).
 */
export async function isImpersonating(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(COOKIE_LOG_ID)?.value);
}

/**
 * Истекла ли сессия по TTL?
 *   started_at — ISO-строка из admin_impersonation_log.
 */
export function isLogExpired(startedAt: string): boolean {
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return false; // битая дата — не считаем истекшей
  return Date.now() - startMs > IMPERSONATION_TTL_SECONDS * 1000;
}

/** Возвращает logId, если impersonation активен. */
export async function getImpersonationLogId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_LOG_ID)?.value || null;
}

/**
 * То же, но из NextRequest (route handlers, middleware).
 * cookies() из next/headers тут тоже работает, но иногда удобнее brать из request.
 */
export function isImpersonatingFromRequest(req: NextRequest): boolean {
  return Boolean(req.cookies.get(COOKIE_LOG_ID)?.value);
}

// ----------------------------------------------------------------------------
// Cookie option presets
// ----------------------------------------------------------------------------

const isProd = process.env.NODE_ENV === "production";

export const COOKIE_OPTIONS_BACKUP = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: IMPERSONATION_TTL_SECONDS,
};

export const COOKIE_OPTIONS_LOG_ID = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: IMPERSONATION_TTL_SECONDS,
};

/** Опции для удаления cookie. */
export const COOKIE_OPTIONS_CLEAR = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};
