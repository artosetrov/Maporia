"use client";

/**
 * /admin/impersonation-log — список admin-impersonation сессий.
 *
 * Гейт: только is_admin/role === 'admin'.
 * Данные: GET /api/admin/impersonate/log с пагинацией.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../lib/access";
import Icon from "../../../components/Icon";
import { ErrorBoundary } from "../../../components/ErrorBoundary";

type Person = {
  display_name: string | null;
  username: string | null;
  email: string | null;
} | null;

type LogItem = {
  id: string;
  admin_id: string;
  target_id: string;
  started_at: string;
  ended_at: string | null;
  ip: string | null;
  user_agent: string | null;
  reason: string | null;
  admin: Person;
  target: Person;
};

const PAGE_SIZE = 50;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(start: string, end: string | null): string {
  const s = Date.parse(start);
  const e = end ? Date.parse(end) : Date.now();
  if (Number.isNaN(s) || Number.isNaN(e)) return "—";
  const ms = e - s;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  if (min === 0) return `${sec}s`;
  if (min < 60) return `${min}m ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function personLabel(p: Person): string {
  if (!p) return "—";
  return p.display_name || p.username || p.email || "—";
}

export default function ImpersonationLogPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  const [items, setItems] = useState<LogItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Гейт
  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) {
      router.replace("/profile");
    }
  }, [accessLoading, isAdmin, router]);

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError("Not authenticated");
          return;
        }
        const res = await fetch(
          `/api/admin/impersonate/log?limit=${PAGE_SIZE}&offset=${nextOffset}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error || `HTTP ${res.status}`);
          return;
        }
        const next = (body.items ?? []) as LogItem[];
        setItems((prev) => (append ? [...prev, ...next] : next));
        setHasMore(Boolean(body.hasMore));
        setOffset(nextOffset + next.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!accessLoading && isAdmin) {
      fetchPage(0, false);
    }
  }, [accessLoading, isAdmin, fetchPage]);

  if (accessLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-4xl mx-auto px-4 pt-20">
          <div className="animate-pulse h-6 w-40 bg-[#ECEEE4] rounded mb-4" />
          <div className="animate-pulse h-32 bg-[#ECEEE4] rounded" />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#FAFAF7]">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14 px-4">
          <Link
            href="/profile?section=elements"
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-xl hover:bg-[#FAFAF7] transition"
            aria-label="Back to profile"
          >
            <Icon name="back" size={24} className="text-[#1F2A1F]" />
          </Link>
          <h1 className="text-base font-semibold font-fraunces text-[#1F2A1F]">
            Impersonation log
          </h1>
          <button
            onClick={() => fetchPage(0, false)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-medium text-[#8F9E4F] hover:bg-[#F0F5EB] transition disabled:opacity-50"
            aria-label="Refresh"
          >
            <Icon name="check" size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div
        className="max-w-4xl mx-auto px-4 py-6 space-y-3"
        style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}
      >
        {error && (
          <div className="rounded-2xl border border-[#E8B4AD] bg-[#FDF0EE] p-4 flex items-center gap-2">
            <Icon name="alert-circle" size={20} className="text-[#C96A5B]" />
            <p className="text-sm font-medium text-[#C96A5B]">{error}</p>
          </div>
        )}

        {loading && items.length === 0 && (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-[#ECEEE4] bg-white p-5 h-24" />
            ))}
          </>
        )}

        {!loading && items.length === 0 && !error && (
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-8 text-center text-[#6F7A5A]">
            Пусто. Никто ещё не заходил под чужими аккаунтами.
          </div>
        )}

        {items.map((item) => {
          const isActive = !item.ended_at;
          const isExpired = item.reason === "ttl_auto_closed";
          return (
            <div
              key={item.id}
              className={`rounded-2xl border bg-white p-5 ${
                isActive ? "border-[#EED99B]" : "border-[#ECEEE4]"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-[#1F2A1F] truncate">
                    {personLabel(item.admin)}
                  </span>
                  <Icon name="forward" size={14} className="text-[#A8B096] flex-shrink-0" />
                  <span className="text-sm font-semibold text-[#1F2A1F] truncate">
                    {personLabel(item.target)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-[#FDF8EC] text-[#8B6F2A] border border-[#EED99B] px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D6B25E] animate-pulse" />
                      active
                    </span>
                  )}
                  {isExpired && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#FAFAF7] text-[#6F7A5A] border border-[#ECEEE4] px-2 py-0.5 rounded-full">
                      ttl
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[#A8B096] mb-0.5">Started</div>
                  <div className="text-[#1F2A1F]">{fmtDate(item.started_at)}</div>
                </div>
                <div>
                  <div className="text-[#A8B096] mb-0.5">Ended</div>
                  <div className="text-[#1F2A1F]">
                    {item.ended_at ? fmtDate(item.ended_at) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[#A8B096] mb-0.5">Duration</div>
                  <div className="text-[#1F2A1F]">
                    {fmtDuration(item.started_at, item.ended_at)}
                  </div>
                </div>
              </div>

              {(item.ip || item.user_agent) && (
                <div className="mt-3 pt-3 border-t border-[#ECEEE4] grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-3 text-xs text-[#6F7A5A]">
                  {item.ip && (
                    <>
                      <div className="text-[#A8B096]">IP</div>
                      <div className="font-mono">{item.ip}</div>
                    </>
                  )}
                  {item.user_agent && (
                    <>
                      <div className="text-[#A8B096]">User-Agent</div>
                      <div className="truncate" title={item.user_agent}>
                        {item.user_agent}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {hasMore && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => fetchPage(offset, true)}
              disabled={loadingMore}
              className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-white text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
      </div>
    </ErrorBoundary>
  );
}
