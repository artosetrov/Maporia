"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { getSafeRedirectFrom } from "@/app/lib/authRedirect";

const CALLBACK_TIMEOUT_MS = 8000;

/**
 * Точка приземления после клика по ссылкам из писем (signup confirm, magic link,
 * password reset) и после OAuth-редиректа Google.
 *
 * Что здесь происходит:
 * 1. Supabase JS клиент инициализируется в `lib/supabase.ts` с
 *    `detectSessionInUrl: true` + `flowType: 'pkce'`. На этом этапе
 *    он уже сам обмыливает code/hash на сессию.
 * 2. Эта страница ждёт SIGNED_IN или PASSWORD_RECOVERY (для reset-flow)
 *    и редиректит на ?next=.
 * 3. Если за {@link CALLBACK_TIMEOUT_MS}мс ничего не пришло — показываем
 *    ошибку с кнопкой назад. На случай битой/истёкшей ссылки.
 */
export default function CallbackPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeRedirectFrom(searchParams.get("next")) ?? "/";
  const urlError = searchParams.get("error_description") || searchParams.get("error");

  const [errorMsg, setErrorMsg] = useState<string | null>(urlError);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (urlError) return;

    let active = true;

    function redirect(target: string) {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      // Чистим ?code/?next/hash из URL ещё до router.replace,
      // чтобы они не «прилипли» к следующему маршруту.
      try {
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/auth/callback");
        }
      } catch {
        /* noop */
      }
      router.replace(target);
    }

    // Если сессия уже есть (detectSessionInUrl успел отработать) — сразу редирект.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      if (data.session) {
        redirect(next);
      }
    });

    // Иначе ждём событие.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        // Reset-flow: отправляем юзера на форму смены пароля.
        // ?next= игнорируем, потому что recovery-сессия пригодна только для updateUser.
        redirect("/auth/update-password");
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
        redirect(next);
      }
    });

    const timer = setTimeout(() => {
      if (!active || redirectedRef.current) return;
      setErrorMsg("This link is invalid or has expired. Please try again.");
    }, CALLBACK_TIMEOUT_MS);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [next, router, urlError]);

  if (errorMsg) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
        <div
          className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 text-center"
          style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
        >
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
            Couldn&apos;t sign you in
          </h2>
          <p className="text-sm text-[#6F7A5A] mb-6">{errorMsg}</p>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#8F9E4F] text-white font-medium px-6 hover:brightness-110 active:brightness-90 transition-all"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div className="text-center">
        <div
          className="inline-block h-8 w-8 rounded-full border-2 border-[#ECEEE4] border-t-[#8F9E4F] animate-spin"
          aria-hidden
        />
        <p className="mt-4 text-sm text-[#6F7A5A]">Signing you in…</p>
      </div>
    </main>
  );
}
