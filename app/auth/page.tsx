"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthUrl, getSafeRedirectFrom } from "../lib/authRedirect";
import { ErrorBoundary } from "../components/ErrorBoundary";

/**
 * /auth — bridge для обратной совместимости.
 *
 * Раньше это была единственная страница входа (magic link + Google).
 * После миграции на canonical /login:
 * 1. Если в URL есть auth-токен (PKCE `?code=` или старый implicit `#access_token=…`),
 *    кидаем на /auth/callback, сохраняя query + hash. Это нужно, потому что
 *    в существующих письмах magic link `emailRedirectTo` указывал на /auth.
 * 2. Иначе — редирект на /login (с пробросом ?from=).
 *
 * Когда старые письма устареют, файл можно удалить.
 */
export default function AuthBridgePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <AuthBridge />
      </Suspense>
    </ErrorBoundary>
  );
}

function AuthBridge() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const hasCode = !!searchParams.get("code");
    const hasHashToken = hash.includes("access_token=") || hash.includes("type=recovery");
    const errorParam = searchParams.get("error") || searchParams.get("error_description");

    // 1. Auth-токен в URL — пробрасываем на /auth/callback, сохраняя query + hash.
    if (hasCode || hasHashToken || errorParam) {
      const from = getSafeRedirectFrom(searchParams.get("from")) ?? "/";
      const search = new URLSearchParams(window.location.search);
      // ?from= переименовываем в ?next=, чтобы согласоваться с /auth/callback.
      search.delete("from");
      search.set("next", from);
      // Полный URL включая hash (чтобы implicit-flow access_token дошёл).
      const target = `/auth/callback?${search.toString()}${hash}`;
      window.location.replace(target);
      return;
    }

    // 2. Иначе — на /login?from=…
    const from = getSafeRedirectFrom(searchParams.get("from"));
    router.replace(getAuthUrl(from));
  }, [router, searchParams]);

  // Лёгкий лоадер на пару миллисекунд, пока useEffect отработает.
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div className="text-center">
        <div
          className="inline-block h-8 w-8 rounded-full border-2 border-[#ECEEE4] border-t-[#8F9E4F] animate-spin"
          aria-hidden
        />
        <p className="mt-4 text-sm text-[#6F7A5A]">Loading…</p>
      </div>
    </main>
  );
}
