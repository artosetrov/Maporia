"use client";

/**
 * useImpersonationStatus — клиентский хук, который один раз на сессию
 * спрашивает /api/admin/impersonate/status и кэширует результат
 * в module-level Promise. Подписчики получают одно и то же значение,
 * без дублирующих запросов.
 *
 * Используется в местах, где нужно подменить кнопку покупки на disabled
 * с disclaimer (pricing, billing, paywall-модалки).
 */

import { useEffect, useState } from "react";

export type ImpersonationStatus = {
  active: boolean;
  targetEmail?: string | null;
  targetName?: string | null;
  startedAt?: string | null;
};

let cached: Promise<ImpersonationStatus> | null = null;

function load(): Promise<ImpersonationStatus> {
  if (cached) return cached;
  cached = fetch("/api/admin/impersonate/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { active: false }))
    .catch(() => ({ active: false }));
  return cached;
}

/** Сбросить кэш — пригодится если кто-то меняет состояние программно. */
export function resetImpersonationStatusCache() {
  cached = null;
}

export function useImpersonationStatus(): ImpersonationStatus | null {
  const [status, setStatus] = useState<ImpersonationStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
