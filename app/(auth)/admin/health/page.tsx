"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../lib/access";
import Icon from "../../../components/Icon";
import { ErrorBoundary } from "../../../components/ErrorBoundary";

// ---------------------------------------------------------------------------
// Types mirroring the API response
// ---------------------------------------------------------------------------

type CheckResult = {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  count?: number;
};

type HealthReport = {
  status: "green" | "yellow" | "red";
  timestamp: string;
  checks: CheckResult[];
  services: CheckResult[];
  env: Record<string, boolean>;
  stats: Record<string, number | null>;
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  pass: { bg: "bg-[#F0F5EB]", text: "text-[#7FA35C]", border: "border-[#C9D9B8]", dot: "bg-[#7FA35C]" },
  warn: { bg: "bg-[#FDF8EC]", text: "text-[#D6B25E]", border: "border-[#EED99B]", dot: "bg-[#D6B25E]" },
  fail: { bg: "bg-[#FDF0EE]", text: "text-[#C96A5B]", border: "border-[#E8B4AD]", dot: "bg-[#C96A5B]" },
};

const OVERALL_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  green: { bg: "bg-[#F0F5EB]", text: "text-[#7FA35C]", border: "border-[#C9D9B8]", label: "All Systems Operational" },
  yellow: { bg: "bg-[#FDF8EC]", text: "text-[#D6B25E]", border: "border-[#EED99B]", label: "Some Warnings Detected" },
  red: { bg: "bg-[#FDF0EE]", text: "text-[#C96A5B]", border: "border-[#E8B4AD]", label: "Critical Issues Found" },
};

const statusIcon = (status: "pass" | "warn" | "fail"): "check" | "alert-circle" | "close" => {
  if (status === "pass") return "check";
  if (status === "warn") return "alert-circle";
  return "close";
};

const STAT_LABELS: Record<string, string> = {
  places: "Places",
  profiles: "Users",
  collections: "Collections",
  tags: "Tags",
  reactions: "Reactions",
  comments: "Comments",
  place_photos: "Photos",
  cities: "Cities",
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SkeletonCard = () => (
  <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm animate-pulse">
    <div className="h-5 w-40 bg-[#ECEEE4] rounded mb-4" />
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-[#ECEEE4]" />
          <div className="h-4 flex-1 bg-[#ECEEE4] rounded" />
        </div>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const CheckRow = ({ check }: { check: CheckResult }) => {
  const colors = STATUS_COLORS[check.status];
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${colors.bg}`}>
        <Icon name={statusIcon(check.status)} size={12} className={colors.text} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#1F2A1F]">{check.name}</span>
          {check.count !== undefined && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
              {check.count}
            </span>
          )}
        </div>
        <p className="text-xs text-[#6F7A5A] mt-0.5 break-words">{check.message}</p>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${colors.bg} ${colors.text}`}>
        {check.status}
      </span>
    </div>
  );
};

const SectionCard = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2 mb-4">
      <Icon name={icon} size={20} className="text-[#6F7A5A]" />
      <h2 className="text-base font-semibold font-fraunces text-[#1F2A1F]">{title}</h2>
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminHealthPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Admin gate
  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) {
      router.replace("/profile");
    }
  }, [accessLoading, isAdmin, router]);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/health", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data: HealthReport = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!accessLoading && isAdmin) {
      fetchHealth();
    }
  }, [accessLoading, isAdmin, fetchHealth]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  if (accessLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-2xl mx-auto px-4 pt-20 space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const overall = report ? OVERALL_COLORS[report.status] : null;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#FAFAF7]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto flex items-center justify-between h-14 px-4">
          <Link
            href="/profile?section=elements"
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-xl hover:bg-[#FAFAF7] transition"
            aria-label="Back to profile"
          >
            <Icon name="back" size={24} className="text-[#1F2A1F]" />
          </Link>
          <h1 className="text-base font-semibold font-fraunces text-[#1F2A1F]">Health Check</h1>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-medium text-[#8F9E4F] hover:bg-[#F0F5EB] transition disabled:opacity-50"
            aria-label="Refresh health check"
          >
            <Icon name="check" size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-2xl mx-auto px-4 py-6 space-y-4"
        style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-[#E8B4AD] bg-[#FDF0EE] p-4">
            <div className="flex items-center gap-2">
              <Icon name="alert-circle" size={20} className="text-[#C96A5B]" />
              <p className="text-sm font-medium text-[#C96A5B]">{error}</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !report && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* Report */}
        {report && (
          <>
            {/* Overall Status Banner */}
            {overall && (
              <div className={`rounded-2xl border ${overall.border} ${overall.bg} p-5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${report.status === "green" ? "bg-[#7FA35C]/20" : report.status === "yellow" ? "bg-[#D6B25E]/20" : "bg-[#C96A5B]/20"}`}>
                      <Icon
                        name="activity"
                        size={24}
                        className={overall.text}
                      />
                    </div>
                    <div>
                      <p className={`text-lg font-semibold font-fraunces ${overall.text}`}>
                        {overall.label}
                      </p>
                      <p className="text-xs text-[#6F7A5A] mt-0.5">
                        {new Date(report.timestamp).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {/* Auto-refresh toggle */}
                  <button
                    onClick={() => setAutoRefresh((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition ${
                      autoRefresh
                        ? "bg-[#8F9E4F] text-white"
                        : "bg-white border border-[#ECEEE4] text-[#6F7A5A] hover:border-[#8F9E4F]"
                    }`}
                    aria-label={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
                  >
                    <Icon name="clock" size={14} />
                    <span>{autoRefresh ? "Auto: ON" : "Auto: OFF"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Services */}
            <SectionCard title="Services" icon="link">
              <div className="divide-y divide-[#ECEEE4]">
                {report.services.map((s) => (
                  <CheckRow key={s.id} check={s} />
                ))}
              </div>
            </SectionCard>

            {/* Database Integrity */}
            <SectionCard title="Database Integrity" icon="lock">
              <div className="divide-y divide-[#ECEEE4]">
                {report.checks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </div>
            </SectionCard>

            {/* Environment Variables */}
            <SectionCard title="Environment" icon="settings">
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(report.env).map(([key, configured]) => (
                  <div key={key} className="flex items-center justify-between py-1.5">
                    <code className="text-xs text-[#1F2A1F] font-mono truncate mr-3">{key}</code>
                    <span
                      className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                        configured
                          ? "bg-[#F0F5EB] text-[#7FA35C]"
                          : "bg-[#FDF0EE] text-[#C96A5B]"
                      }`}
                    >
                      {configured ? "configured" : "missing"}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Data Stats */}
            <SectionCard title="Data Stats" icon="grid">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(report.stats).map(([key, count]) => (
                  <div
                    key={key}
                    className="rounded-xl bg-[#FAFAF7] border border-[#ECEEE4] p-3 text-center"
                  >
                    <p className="text-xl font-semibold text-[#1F2A1F]">
                      {count !== null ? count.toLocaleString("ru-RU") : "—"}
                    </p>
                    <p className="text-xs text-[#6F7A5A] mt-1">{STAT_LABELS[key] ?? key}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
      </div>
    </ErrorBoundary>
  );
}
