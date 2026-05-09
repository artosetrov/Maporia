"use client";

/**
 * /admin/billing — admin-only billing analytics.
 *
 * Pulls aggregates from public.get_billing_kpi() RPC (SECURITY DEFINER).
 * RPC itself enforces admin gate; we redirect non-admins client-side too
 * to skip the round-trip.
 *
 * Sections:
 *  - Overview cards: free / paid / lifetime / active subs / past_due / cancelled / bonus credits
 *  - By plan: active / past_due / cancelled / total per plan
 *  - Monthly: last 12 months × plan, new vs cancelled
 *
 * No charts (yet) — plain numbers and tables. Intent: read-at-a-glance.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useUserAccessContext } from "../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../lib/access";
import Icon from "../../../components/Icon";
import { PLAN_CONFIG } from "../../../lib/plans";
import { ErrorBoundary } from "../../../components/ErrorBoundary";

// ── Types ──────────────────────────────────────────────────────

type Overview = {
  free_users: number;
  paid_users: number;
  lifetime_premium_users: number;
  active_subscriptions: number;
  past_due_subscriptions: number;
  cancelled_subscriptions_total: number;
  total_bonus_credits_remaining: number;
  total_places_count: number;
};

type ByPlanRow = {
  plan: string;
  active: number;
  past_due: number;
  cancelled: number;
  total_ever: number;
};

type MonthlyRow = {
  month: string; // YYYY-MM
  plan: string;
  new_count: number;
  cancelled_count: number;
  still_active_count: number;
};

type KpiResponse = {
  overview: Overview;
  by_plan: ByPlanRow[];
  monthly: MonthlyRow[];
  generated_at: string;
};

// ── Helpers ────────────────────────────────────────────────────

function planLabel(planId: string): string {
  if (planId in PLAN_CONFIG) {
    return PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG].display.name;
  }
  return planId;
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1">{label}</div>
      <div className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">{value}</div>
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

// ── Page ───────────────────────────────────────────────────────

export default function AdminBillingPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  const [data, setData] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin gate
  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) router.replace("/profile");
  }, [accessLoading, isAdmin, router]);

  const fetchKpi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_billing_kpi");
      if (rpcError) {
        setError(rpcError.message || "Failed to load KPI");
        setLoading(false);
        return;
      }
      setData(rpcData as KpiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load KPI");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accessLoading && isAdmin) fetchKpi();
  }, [accessLoading, isAdmin, fetchKpi]);

  // Monthly aggregated: collapse to wide rows month → {plan: counts}
  const monthlyByMonth: Record<string, Record<string, MonthlyRow>> = {};
  const planSet = new Set<string>();
  if (data?.monthly) {
    for (const row of data.monthly) {
      monthlyByMonth[row.month] ??= {};
      monthlyByMonth[row.month][row.plan] = row;
      planSet.add(row.plan);
    }
  }
  const months = Object.keys(monthlyByMonth).sort().reverse();
  const plans = Array.from(planSet).sort();

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">Billing</h1>
            <p className="text-sm text-[#6F7A5A] mt-1">
              Subscriptions, plans, churn — admin only.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchKpi}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[#ECEEE4] bg-white text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition disabled:opacity-50"
          >
            <Icon name="add" size={16} className="rotate-45" aria-hidden />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-4 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        {/* Overview */}
        <section className="mb-8">
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-4">Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {loading || !data ? (
              [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <StatCard label="Free users" value={data.overview.free_users} />
                <StatCard label="Paid users" value={data.overview.paid_users} />
                <StatCard
                  label="Lifetime premium"
                  value={data.overview.lifetime_premium_users}
                  hint="legacy one-time payments"
                />
                <StatCard
                  label="Active subscriptions"
                  value={data.overview.active_subscriptions}
                  hint="recurring"
                />
                <StatCard
                  label="Past due"
                  value={data.overview.past_due_subscriptions}
                  hint="payment retry"
                />
                <StatCard
                  label="Cancelled (lifetime)"
                  value={data.overview.cancelled_subscriptions_total}
                />
                <StatCard
                  label="Bonus credits left"
                  value={data.overview.total_bonus_credits_remaining}
                  hint="$2.99 add-ons unspent"
                />
                <StatCard label="Total places" value={data.overview.total_places_count} />
              </>
            )}
          </div>
        </section>

        {/* By plan */}
        <section className="mb-8">
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-4">By plan</h2>
          <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-hidden">
            {loading || !data ? (
              <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
            ) : data.by_plan.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#6F7A5A]">
                No subscriptions yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-[#ECEEE4] bg-[#FAFAF7]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-[#6F7A5A]">Plan</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Active</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Past due</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Cancelled</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Total ever</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Churn</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_plan.map((row) => {
                    const churnPct =
                      row.total_ever > 0
                        ? Math.round((row.cancelled / row.total_ever) * 100)
                        : 0;
                    return (
                      <tr key={row.plan} className="border-b border-[#ECEEE4] last:border-0">
                        <td className="px-4 py-3 text-[#1F2A1F] font-medium">
                          {planLabel(row.plan)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#1F2A1F]">{row.active}</td>
                        <td className="px-4 py-3 text-right text-[#D6B25E]">{row.past_due}</td>
                        <td className="px-4 py-3 text-right text-[#6F7A5A]">{row.cancelled}</td>
                        <td className="px-4 py-3 text-right text-[#1F2A1F]">{row.total_ever}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={
                              churnPct >= 30
                                ? "text-[#C96A5B] font-medium"
                                : churnPct >= 10
                                ? "text-[#D6B25E] font-medium"
                                : "text-[#7FA35C]"
                            }
                          >
                            {churnPct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Monthly */}
        <section className="mb-8">
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-4">
            Last 12 months — new subscriptions
          </h2>
          <div className="rounded-2xl border border-[#ECEEE4] bg-white overflow-x-auto">
            {loading || !data ? (
              <div className="p-8 text-center text-sm text-[#6F7A5A]">Loading…</div>
            ) : months.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#6F7A5A]">
                No subscription history yet — once people subscribe, monthly stats will show up here.
              </div>
            ) : (
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-[#ECEEE4] bg-[#FAFAF7]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-[#6F7A5A]">Month</th>
                    {plans.map((p) => (
                      <th key={p} className="text-right px-4 py-3 font-medium text-[#6F7A5A]">
                        {planLabel(p)}
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Total new</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6F7A5A]">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const row = monthlyByMonth[m];
                    const totalNew = Object.values(row).reduce((s, x) => s + x.new_count, 0);
                    const totalCancelled = Object.values(row).reduce(
                      (s, x) => s + x.cancelled_count,
                      0
                    );
                    return (
                      <tr key={m} className="border-b border-[#ECEEE4] last:border-0">
                        <td className="px-4 py-3 text-[#1F2A1F] font-mono text-xs">{m}</td>
                        {plans.map((p) => (
                          <td key={p} className="px-4 py-3 text-right text-[#1F2A1F]">
                            {row[p]?.new_count ?? "—"}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right text-[#1F2A1F] font-medium">
                          {totalNew}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6F7A5A]">{totalCancelled}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {data?.generated_at && (
          <p className="text-xs text-[#A8B096] text-center">
            Generated at {new Date(data.generated_at).toLocaleString("en-US")}
          </p>
        )}
        </div>
      </main>
    </ErrorBoundary>
  );
}
