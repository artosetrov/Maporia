"use client";

/**
 * AnalyticsTracker — клиентский трекер просмотров страниц.
 *
 * Один раз монтируется в root layout. На каждое изменение pathname шлёт
 * fire-and-forget POST на /api/track. Сервер парсит User-Agent, страну
 * (Vercel headers), верифицирует user_id из cookies.
 *
 * session_id — uuid v4, живёт в localStorage 30 дней (sliding window).
 *
 * Чего НЕ делает:
 *   - не шлёт ничего на /admin/* (бессмысленно засорять данные).
 *   - не шлёт повторно один и тот же путь подряд (StrictMode/быстрая навигация).
 *   - не блокирует UI: keepalive: true → запрос не убивается на навигации.
 */

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SESSION_KEY = "maporia_sid";
const SESSION_TTL_DAYS = 30;

function genSessionId(): string {
  // crypto.randomUUID есть в современных браузерах. Fallback — упрощённый rfc4122-ish.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // ~uuid v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateSessionId(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id: string; expires: number };
        if (parsed.id && parsed.expires > Date.now()) {
          // sliding window: продлеваем
          parsed.expires = Date.now() + SESSION_TTL_DAYS * 86_400_000;
          localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
          return parsed.id;
        }
      } catch {
        // legacy / corrupt — перезапишем
      }
    }
    const id = genSessionId();
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ id, expires: Date.now() + SESSION_TTL_DAYS * 86_400_000 }),
    );
    return id;
  } catch {
    // SSR/incognito ограничения — используем разовый id
    return genSessionId();
  }
}

function shouldSkipPath(path: string): boolean {
  // Не трекаем сами админ-страницы (включая дашборд аналитики).
  if (path.startsWith("/admin")) return true;
  // /api никогда не приходит через клиент, но на всякий.
  if (path.startsWith("/api")) return true;
  // Внутренние Next-роуты
  if (path.startsWith("/_next")) return true;
  return false;
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (shouldSkipPath(pathname)) return;

    // Дедуп: тот же path+query подряд не шлём.
    const queryStr = searchParams ? searchParams.toString() : "";
    const key = `${pathname}?${queryStr}`;
    if (lastSent.current === key) return;
    lastSent.current = key;

    const session_id = getOrCreateSessionId();

    const utm = {
      utm_source: searchParams?.get("utm_source") || undefined,
      utm_medium: searchParams?.get("utm_medium") || undefined,
      utm_campaign: searchParams?.get("utm_campaign") || undefined,
    };

    const payload = {
      session_id,
      path: pathname,
      query: queryStr || undefined,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
      ...utm,
    };

    // fire-and-forget, не блокируем рендер
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        // credentials по умолчанию same-origin — Supabase cookies прилетят
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, [pathname, searchParams]);

  return null;
}
