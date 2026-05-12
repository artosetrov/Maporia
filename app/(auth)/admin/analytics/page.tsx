"use client";

/**
 * /admin/analytics — admin-only page-view analytics.
 *
 * Источник: public.get_analytics_kpi(range) SECURITY DEFINER → читает
 * page_views_raw напрямую (retention 60 дней). См. план:
 * docs/plans/admin-analytics-dashboard.md.
 *
 * UX:
 *   - селектор диапазона: 24h / 7d / 30d / 90d
 *   - overview-карточки с дельтой vs прошлый период
 *   - inline-SVG sparkline (без зависимостей; recharts в проекте нет)
 *   - таблицы: top paths, top places, top referrers, top UTM, geo, devices
 *   - admin-only гейт; non-admin → redirect на /profile
 *
 * No charts library: оставляем рендер легковесным, без новых deps.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../lib/access";
import Icon from "../../../components/Icon";
import { ErrorBoundary } from "../../../components/ErrorBoundary";

// ──────────────── types ────────────────

type RangeKey = "24h" | "7d" | "30d" | "90d";

type Overview = {
  total_views: number;
  unique_sessions: number;
  auth_views: number;
  guest_views: number;
  avg_views_per_session: number;
  prev_period_total_views: number;
};

type TimeseriesPoint = { bucket: string; views: number; unique_sessions: number };
type PathRow = { path: string; views: number; unique_sessions: number };
type PlaceRow = {
  place_id: string;
  title: string;
  kind: string | null;
  city: string | null;
  views: number;
  unique_sessions: number;
};
type ReferrerRow = { referrer_host: string; views: number; unique_sessions: number };
type UtmRow = { utm_source: string; views: number; unique_sessions: number };
type GeoRow = { country: string; views: number; unique_sessions: number };
type DeviceRow = { device: string; views: number };

type AnalyticsKpi = {
  generated_at: string;
  range: RangeKey;
  overview: Overview;
  timeseries: TimeseriesPoint[];
  top_paths: PathRow[];
  top_places: PlaceRow[];
  top_referrers: ReferrerRow[];
  top_utm: UtmRow[];
  geo: GeoRow[];
  devices: DeviceRow[];
};

// ──────────────── helpers ────────────────

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

function deltaPercent(current: number, prev: number): number | null {
  if (prev === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prev) / prev) * 100);
}

function fmtBucket(bucket: string, range: RangeKey): string {
  const d = new Date(bucket);
  if (range === "24h") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function countryFlag(code: string): string {
  if (!code || code === "??" || code.length !== 2) return "🌐";
  // Unicode regional indicator trick: A=0x1F1E6
  const A = 0x1f1e6;
  const upper = code.toUpperCase();
  return String.fromCodePoint(A + upper.charCodeAt(0) - 65) + String.fromCodePoint(A + upper.charCodeAt(1) - 65);
}

// ──────────────── small UI pieces ────────────────

function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number | null;
}) {
  const deltaColor =
    delta == null
      ? "text-[#A8B096]"
      : delta > 0
      ? "text-[#7FA35C]"
      : delta < 0
      ? "text-[#C96A5B]"
      : "text-[#6F7A5A]";
  return (
    <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">{value}</div>
        {delta != null && (
          <span className={`text-xs font-medium ${deltaColor}`}>
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-[#A8B096] mt-1">{hint}</div>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm animate-pulse">
      <div className="h-3 w-24 bg-[#ECEEE4] rounded mb-3" />
      <div className="h-8 w-20 bg-[#ECEEE4] rounded" />
    </div>
  );
}

// Inline SVG sparkline (area chart) — без recharts.
function Sparkline({
  data,
  range,
  height = 220,
}: {
  data: TimeseriesPoint[];
  range: RangeKey;
  height?: number;
}) {
  if (!data.length) {
    return (
      <div
        className="rounded-2xl border border-[#ECEEE4] bg-white p-8 text-center text-sm text-[#6F7A5A]"
        style={{ minHeight: height }}
      >
        No data yet for this period.
      </div>
    );
  }

  const W = 1000; // viewBox width; scales responsively
  const H = height;
  const padding = { t: 16, r: 16, b: 28, l: 36 };
  const innerW = W - padding.l - padding.r;
  const innerH = H - padding.t - padding.b;

  const max = Math.max(1, ...data.map((d) => d.views));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padding.l + i * stepX;
    const y = padding.t + innerH * (1 - d.views / max);
    return { x, y, v: d.views, u: d.unique_sessions, b: d.bucket };
  });

  // Area path
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L${points[points.length - 1].x.toFixed(1)},${(padding.t + innerH).toFixed(1)} ` +
    `L${points[0].x.toFixed(1)},${(padding.t + innerH).toFixed(1)} Z`;

  // Y-axis ticks: 0, max/2, max
  const yTicks = [0, max / 2, max];
  // X-axis ticks: ~6 labels max
  const xTickStride = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="rounded-2xl border border-[#ECEEE4] bg-white p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => {
          const y = padding.t + innerH * (1 - t / max);
          return (
            <line
              key={i}
              x1={padding.l}
              x2={W - padding.r}
              y1={y}
              y2={y}
              stroke="#ECEEE4"
              strokeWidth={1}
            />
          );
        })}

        {/* Area */}
        <path d={areaPath} fill="#8F9E4F" fillOpacity={0.15} />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#8F9E4F" strokeWidth={2.2} />

        {/* Points (small) */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#8F9E4F">
            <title>
              {fmtBucket(p.b, range)} — {p.v} views, {p.u} unique
            </title>
          </circle>
        ))}

        {/* Y labels */}
        {yTicks.map((t, i) => {
          const y = padding.t + innerH * (1 - t / max);
          return (
            <text
              key={i}
              x={padding.l - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill="#A8B096"
              fontFamily="ui-monospace, monospace"
            >
              {fmtNum(Math.round(t))}
            </text>
          );
        })}

        {/* X labels */}
        {points.map((p, i) =>
          i % xTickStride === 0 || i === points.length - 1 ? (
            <text
              key={i}
              x={p.x}
              y={H - 8}
              textAnchor="middle"
              fontSize={11}
              fill="#6F7A5A"
            >
              {fmtBucket(p.b, range)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

// Inline горизонтальный bar для devices/share
function ShareBar({
  rows,
}: {
  rows: { label: string; value: number; color: string }[];
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) {
    return <div className="text-sm text-[#6F7A5A]">No device data yet.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#ECEEE4]">
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              width: `${(r.value / total) * 100}%`,
              backgroundColor: r.color,
            }}
            title={`${r.label}: ${r.value} (${Math.round((r.value / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-[#1F2A1F] capitalize">{r.label}</span>
            <span className="ml-auto text-[#6F7A5A]">
              {Math.round((r.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────── page ────────────────

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<AnalyticsKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Гейт
  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) router.replace("/profile");
  }, [accessLoading, isAdmin, router]);

  const fetchKpi = useCallback(
    async (r: RangeKey) => {
      setLoading(true);
      setError(null);
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "get_analytics_kpi" as never,
          { p_range: r } as never,
        );
        if (rpcError) {
          setError(rpcError.message || "Failed to load analytics");
          setLoading(false);
          return;
        }
        setData(rpcData as unknown as AnalyticsKpi);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!accessLoading && isAdmin) fetchKpi(range);
  }, [accessLoading, isAdmin, range, fetchKpi]);

  const deviceShare = useMemo(() => {
    const map = new Map<string, number>();
    data?.devices?.forEach((d) => {
      map.set(d.device, (map.get(d.device) || 0) + d.views);
    });
    const palette: Record<string, string> = {
      mobile: "#8F9E4F",
      desktop: "#5E8FAF",
      tablet: "#D6B25E",
      unknown: "#A8B096",
    };
    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
      color: palette[label] || "#6F7A5A",
    }));
  }, [data]);

  const totalViews = data?.overview.total_views ?? 0;
  const uniqueSessions = data?.overview.unique_sessions ?? 0;
  const authViews = data?.overview.auth_views ?? 0;
  const guestViews = data?.overview.guest_views ?? 0;
  const prevTotal = data?.overview.prev_period_total_views ?? 0;
  const avgPerSession = data?.overview.avg_views_per_session ?? 0;

  const authShare = totalViews > 0 ? Math.round((authViews / totalViews) * 100) : 0;
  const delta = deltaPercent(totalViews, prevTotal);

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div>
              <div className="flex items-center gap-2 text-sm text-[#6F7A5A] mb-2">
                <Link href="/profile" className="hover:text-[#1F2A1F] transition">
                  Profile
                </Link>
                <span>·</span>
                <span>Analytics</span>
              </div>
              <h1 className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">
                Analytics
              </h1>
              <p className="text-sm text-[#6F7A5A] mt-1">
                Page views, sessions, geography — admin only.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Range selector */}
              <div className="inline-flex rounded-xl border border-[#ECEEE4] bg-white p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRange(r.key)}
                    className={
                      "px-3 h-8 rounded-lg text-sm font-medium transition " +
                      (range === r.key
                        ? "bg-[#1F2A1F] text-white"
                        : "text-[#6F7A5A] hover:text-[#1F2A1F]")
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => fetchKpi(range)}
                disabled={loading}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[#ECEEE4] bg-white text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition disabled:opacity-50"
              >
                <Icon name="add" size={16} className="rotate-45" aria-hidden />
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </header>

          {error && (
            <div className="mb-6 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-4 text-sm text-[#C96A5B]">
              {error}
            </div>
          )}

          {/* Overview */}
          <section className="mb-8">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {loading || !data ? (
                [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
              ) : (
                <>
                  <StatCard
                    label="Total views"
                    value={fmtNum(totalViews)}
                    hint={`vs prev ${range}`}
                    delta={delta}
                  />
                  <StatCard
                    label="Unique sessions"
                    value={fmtNum(uniqueSessions)}
                    hint="per browser, 30d window"
                  />
                  <StatCard
                    label="Avg views / session"
                    value={avgPerSession.toFixed(2)}
                    hint="engagement depth"
                  />
                  <StatCard
                    label="Auth share"
                    value={`${authShare}%`}
                    hint={`${fmtNum(authViews)} auth · ${fmtNum(guestViews)} guest`}
                  />
                </>
              )}
            </div>
          </section>

          {/* Timeseries */}
          <section className="mb-8">
            <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-4">
              Views over time
            </h2>
            {loading || !data ? (
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-8 animate-pulse h-[220px]" />
            ) : (
              <Sparkline data={data.timeseries} range={data.range} />
            )}
          </section>

          {/* Two-column block: paths + places */}
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top paths */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ECEEE4] bg-[#FAFAF7]">
                <h3 className="font-fraunces text-base font-semibold text-[#1F2A1F]">
                  Top pages
                </h3>
              </div>
              {loading || !data ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
              ) : data.top_paths.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">No views yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-white">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-[#6F7A5A]">Path</th>
                      <th className="text-right px-4 py-2 font-medium text-[#6F7A5A]">Views</th>
                      <th className="text-right px-4 py-2 font-medium text-[#6F7A5A]">Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_paths.map((row) => (
                      <tr key={row.path} className="border-t border-[#ECEEE4]">
                        <td className="px-4 py-2 font-mono text-xs text-[#1F2A1F] truncate max-w-[280px]">
                          {row.path}
                        </td>
                        <td className="px-4 py-2 text-right text-[#1F2A1F]">{fmtNum(row.views)}</td>
                        <td className="px-4 py-2 text-right text-[#6F7A5A]">
                          {fmtNum(row.unique_sessions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top places */}
            <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ECEEE4] bg-[#FAFAF7]">
                <h3 className="font-fraunces text-base font-semibold text-[#1F2A1F]">
                  Top places
                </h3>
              </div>
              {loading || !data ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
              ) : data.top_places.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">
                  No place views yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-white">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-[#6F7A5A]">Place</th>
                      <th className="text-right px-4 py-2 font-medium text-[#6F7A5A]">Views</th>
                      <th className="text-right px-4 py-2 font-medium text-[#6F7A5A]">Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_places.map((row) => (
                      <tr key={row.place_id} className="border-t border-[#ECEEE4]">
                        <td className="px-4 py-2">
                          <Link
                            href={`/id/${row.place_id}`}
                            className="text-[#1F2A1F] hover:text-[#8F9E4F] transition"
                          >
                            <div className="truncate max-w-[240px] font-medium">{row.title}</div>
                            <div className="text-xs text-[#A8B096]">
                              {[row.kind, row.city].filter(Boolean).join(" · ")}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right text-[#1F2A1F]">{fmtNum(row.views)}</td>
                        <td className="px-4 py-2 text-right text-[#6F7A5A]">
                          {fmtNum(row.unique_sessions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Referrers + UTM */}
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ECEEE4] bg-[#FAFAF7]">
                <h3 className="font-fraunces text-base font-semibold text-[#1F2A1F]">
                  Top referrers
                </h3>
              </div>
              {loading || !data ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
              ) : data.top_referrers.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">No referrers yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.top_referrers.map((row) => (
                      <tr key={row.referrer_host} className="border-t border-[#ECEEE4] first:border-0">
                        <td className="px-4 py-2 text-[#1F2A1F]">{row.referrer_host}</td>
                        <td className="px-4 py-2 text-right text-[#1F2A1F]">{fmtNum(row.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ECEEE4] bg-[#FAFAF7]">
                <h3 className="font-fraunces text-base font-semibold text-[#1F2A1F]">
                  Top UTM sources
                </h3>
              </div>
              {loading || !data ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
              ) : data.top_utm.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">
                  No UTM-tagged visits yet. Add ?utm_source=… to outbound links.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.top_utm.map((row) => (
                      <tr key={row.utm_source} className="border-t border-[#ECEEE4] first:border-0">
                        <td className="px-4 py-2 text-[#1F2A1F]">{row.utm_source}</td>
                        <td className="px-4 py-2 text-right text-[#1F2A1F]">{fmtNum(row.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Geo + Devices */}
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ECEEE4] bg-[#FAFAF7]">
                <h3 className="font-fraunces text-base font-semibold text-[#1F2A1F]">Geography</h3>
              </div>
              {loading || !data ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
              ) : data.geo.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#6F7A5A]">No geo data yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.geo.map((row) => (
                      <tr key={row.country} className="border-t border-[#ECEEE4] first:border-0">
                        <td className="px-4 py-2 text-[#1F2A1F]">
                          <span className="mr-2">{countryFlag(row.country)}</span>
                          {row.country}
                        </td>
                        <td className="px-4 py-2 text-right text-[#1F2A1F]">{fmtNum(row.views)}</td>
                        <td className="px-4 py-2 text-right text-[#6F7A5A]">
                          {fmtNum(row.unique_sessions)} uniq
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#ECEEE4] bg-[#FAFAF7]">
                <h3 className="font-fraunces text-base font-semibold text-[#1F2A1F]">Devices</h3>
              </div>
              <div className="p-5">
                {loading || !data ? (
                  <div className="text-center text-sm text-[#6F7A5A]">Loading…</div>
                ) : (
                  <ShareBar rows={deviceShare} />
                )}
              </div>
            </div>
          </section>

          {data?.generated_at && (
            <p className="text-xs text-[#A8B096] text-center">
              Generated at {new Date(data.generated_at).toLocaleString("en-US")} · raw events kept
              for 60 days
            </p>
          )}
        </div>
      </main>
    </ErrorBoundary>
  );
}
