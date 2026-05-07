"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Status = {
  active: boolean;
  targetEmail?: string | null;
  targetName?: string | null;
  startedAt?: string | null;
};

export default function ImpersonationBannerClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Подгружаем "под кем мы сейчас" — для красивого текста в баннере.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/impersonate/status")
      .then((r) => r.json())
      .then((data: Status) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        // молчим — баннер всё равно показан, просто без email
        if (!cancelled) setStatus({ active: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExit() {
    setExiting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate/exit", { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        setExiting(false);
        return;
      }

      const { accessToken, refreshToken } = body as {
        accessToken?: string;
        refreshToken?: string;
      };

      if (!accessToken || !refreshToken) {
        setError("Сервер не вернул токены админа");
        setExiting(false);
        return;
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setErr) {
        setError(`setSession: ${setErr.message}`);
        setExiting(false);
        return;
      }

      window.location.href = "/profile?section=users";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выйти");
      setExiting(false);
    }
  }

  // null — пока статус не подтянут; не мигаем пустотой.
  // Если статус пришёл и active=false — ничего не рендерим (cookie протухла, например).
  if (status && status.active === false) return null;

  const label =
    status?.targetName ||
    status?.targetEmail ||
    "пользователем";

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-[#FDF8EC] border-b border-[#EED99B] text-[#8B6F2A]"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex w-2 h-2 rounded-full bg-[#D6B25E] flex-shrink-0 animate-pulse" />
        <p className="text-xs sm:text-sm font-medium truncate">
          Режим impersonation. Вы вошли как <span className="font-semibold">{label}</span>.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {error && (
          <span className="hidden sm:inline text-xs text-[#C96A5B] truncate max-w-[200px]">
            {error}
          </span>
        )}
        <button
          onClick={handleExit}
          disabled={exiting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-[#EED99B] text-[#8B6F2A] text-xs sm:text-sm font-medium hover:bg-[#FDF8EC] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {exiting ? (
            <>
              <span className="w-3 h-3 border-2 border-[#D6B25E] border-t-transparent rounded-full animate-spin" />
              <span>Выход…</span>
            </>
          ) : (
            <span>Вернуться в админку</span>
          )}
        </button>
      </div>
    </div>
  );
}
