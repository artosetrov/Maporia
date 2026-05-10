"use client";

/**
 * /pricing — публичная страница тарифов (v2).
 *
 * Сетка (5 платных тарифов):
 *   - Premium: $35 one-time (consumer — скрытые локации)
 *   - Pro Location: $9.99/mo, 5 locations
 *   - Pro Service: $14.99/mo, 5 services + secondary location free
 *   - Pro Experience: $14.99/mo, 5 experiences + secondary location free
 *   - Pro All: $34.99/mo, 10 combined всех 3 типов
 *
 * Любой Pro-тариф автоматически включает Premium.
 * Yearly billing toggle — скидка 20%, default = Yearly.
 *
 * Источник данных — `app/lib/pricing/registry.ts` (single source of truth).
 * См. docs/PRICING_V2_PLAN.md § 1.
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import {
  PRICING_REGISTRY,
  PUBLIC_PLANS,
  EXTRA_LISTING,
  ANNUAL_DISCOUNT,
  getFeatures,
  priceDisplay,
  formatUSD,
  type PlanId,
  type Cycle,
} from "../lib/pricing";
import TopBar from "../components/TopBar";
import Icon from "../components/Icon";
import ImpersonationDisclaimer from "../components/ImpersonationDisclaimer";
import { useImpersonationStatus } from "../hooks/useImpersonationStatus";
import { ErrorBoundary } from "../components/ErrorBoundary";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

/**
 * Эффективный cycle для plan'а: для one-time-only (Premium) всегда `lifetime`,
 * для recurring — берём выбранный toggle.
 */
function effectiveCycle(plan: PlanId, toggle: "month" | "year"): Cycle {
  const usd = PRICING_REGISTRY[plan].prices.USD;
  if (usd?.lifetime && !usd.month) return "lifetime";
  return toggle;
}

/**
 * Tier для сравнения планов между собой при выборе ctaLabel.
 * 0 = free, 1 = premium_viewer (consumer), 2 = creator_location,
 * 3 = creator_service / creator_experience (siblings), 4 = creator_all.
 */
function planTier(plan: PlanId): number {
  if (plan === "free") return 0;
  if (plan === "premium_viewer" || plan === "premium_grandfathered") return 1;
  if (plan === "creator_location") return 2;
  if (plan === "creator_service" || plan === "creator_experience") return 3;
  if (plan === "creator_all") return 4;
  return 0;
}

/**
 * Решает что писать на CTA-кнопке исходя из текущего и целевого плана.
 *  - target = current → "Current plan"
 *  - current = free → "Buy" / "Subscribe"
 *  - target tier > current tier → "Upgrade"
 *  - target tier < current tier → "Downgrade"
 *  - target tier == current tier (siblings) → "Switch"
 */
function decideCtaLabel(args: {
  current: PlanId;
  target: PlanId;
  isCurrent: boolean;
  isImpersonating: boolean;
  isLoading: boolean;
  isOneTime: boolean;
}): string {
  if (args.isCurrent) return "Current plan";
  if (args.isImpersonating) return "Locked";
  if (args.isLoading) return "Loading…";

  if (args.current === "free") return args.isOneTime ? "Buy" : "Subscribe";

  const ct = planTier(args.current);
  const tt = planTier(args.target);
  if (tt > ct) return "Upgrade";
  if (tt < ct) return "Downgrade";
  return "Switch";
}

/**
 * Бейдж «What's included that you already have».
 * Показываем когда current план полностью или частично покрыт target планом.
 */
function getIncludesBadge(current: PlanId, target: PlanId): string | null {
  if (current === target) return null;

  // Любой Pro включает Premium
  if (current === "premium_viewer" && target.startsWith("creator_")) {
    return "Includes Premium";
  }
  // Pro All включает все остальные creator плюс Premium
  if (target === "creator_all" && current.startsWith("creator_") && current !== "creator_all") {
    return "Includes everything you have";
  }
  return null;
}

export default function PricingPage() {
  const router = useRouter();
  const { user, profile, access } = useUserAccessContext();
  const impersonation = useImpersonationStatus();
  const isImpersonating = !!impersonation?.active;
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cycleToggle, setCycleToggle] = useState<"month" | "year">("year");

  const currentPlan: PlanId = (access?.plan as PlanId | undefined) ?? "free";

  // Список планов в порядке отображения. Premium первым (consumer entry-point),
  // дальше creator-планы по возрастанию цены.
  const orderedPlans = useMemo<PlanId[]>(
    () =>
      [
        "premium_viewer",
        "creator_location",
        "creator_service",
        "creator_experience",
        "creator_all",
      ].filter((p) => PUBLIC_PLANS.includes(p as PlanId)) as PlanId[],
    [],
  );
  const hasPlans = orderedPlans.length > 0;

  async function startCheckout(plan: PlanId) {
    setError(null);

    if (isImpersonating) {
      setError("Stripe operations are disabled while impersonating.");
      return;
    }

    if (!user) {
      router.push(`/auth?next=${encodeURIComponent("/pricing")}`);
      return;
    }

    if (currentPlan === plan) {
      setError("You already have this plan.");
      return;
    }

    setCheckoutPlan(plan);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        router.push(`/auth?next=${encodeURIComponent("/pricing")}`);
        return;
      }

      const cycle = effectiveCycle(plan, cycleToggle);
      const body: Record<string, string> = { access_token: accessToken, plan, cycle };

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { url?: string; error?: string; code?: string };

      if (!res.ok || !data.url) {
        setError(data.error || "Couldn't start checkout");
        setCheckoutPlan(null);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setCheckoutPlan(null);
    }
  }

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7]">
        <TopBar
          showBackButton
          onBackClick={() => router.back()}
          userAvatar={profile?.avatar_url ?? null}
          userDisplayName={profile?.display_name ?? null}
          userEmail={user?.email ?? null}
        />

        {/* pt компенсирует sticky TopBar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-[88px] sm:pt-[112px] pb-8 sm:pb-14">
          <header className="text-center mb-6 sm:mb-8">
            <h1 className="font-fraunces text-3xl sm:text-4xl font-semibold text-[#1F2A1F] mb-3">
              Maporia plans
            </h1>
            <p className="text-[15px] text-[#6F7A5A] max-w-2xl mx-auto">
              Premium unlocks hidden locations with a one-time payment. Pro plans
              let you publish places, services and experiences — Premium is included.
            </p>
          </header>

          {/* Monthly | Yearly toggle */}
          <div className="flex items-center justify-center mb-6 sm:mb-10">
            <div
              role="tablist"
              aria-label="Billing cycle"
              className="inline-flex items-center gap-1 rounded-full border border-[#ECEEE4] bg-white p-1 shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={cycleToggle === "month"}
                onClick={() => setCycleToggle("month")}
                className={cx(
                  "h-9 px-4 rounded-full text-sm font-medium transition",
                  cycleToggle === "month"
                    ? "bg-[#1F2A1F] text-white"
                    : "text-[#6F7A5A] hover:text-[#1F2A1F]",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cycleToggle === "year"}
                onClick={() => setCycleToggle("year")}
                className={cx(
                  "h-9 px-4 rounded-full text-sm font-medium transition flex items-center gap-2",
                  cycleToggle === "year"
                    ? "bg-[#1F2A1F] text-white"
                    : "text-[#6F7A5A] hover:text-[#1F2A1F]",
                )}
              >
                Yearly
                <span
                  className={cx(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    cycleToggle === "year"
                      ? "bg-[#A4B968] text-[#1F2A1F]"
                      : "bg-[#A4B968]/20 text-[#556036]",
                  )}
                >
                  Save {Math.round(ANNUAL_DISCOUNT * 100)}%
                </span>
              </button>
            </div>
          </div>

          <div className="mb-6">
            <ImpersonationDisclaimer />
          </div>

          {/* 5 platных тарифов: Premium + 4 Pro */}
          {!hasPlans ? (
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-8 text-center">
              <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
                Plans are temporarily unavailable
              </h2>
              <p className="text-sm text-[#6F7A5A]">Please try again later.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {orderedPlans.map((planId) => {
              const spec = PRICING_REGISTRY[planId];
              const display = spec.display;
              if (!display) return null;

              const cycle = effectiveCycle(planId, cycleToggle);
              const price = priceDisplay(planId, cycle);
              const features = getFeatures(planId);

              const isCurrent = currentPlan === planId;
              const isLoading = checkoutPlan === planId;
              const isOneTime = cycle === "lifetime";

              const ctaLabel = decideCtaLabel({
                current: currentPlan,
                target: planId,
                isCurrent,
                isImpersonating,
                isLoading,
                isOneTime,
              });

              const includesBadge = getIncludesBadge(currentPlan, planId);

              return (
                <div
                  key={planId}
                  className={cx(
                    "relative rounded-2xl border bg-white p-5 sm:p-6 flex flex-col",
                    display.highlighted
                      ? "border-[#8F9E4F] shadow-md"
                      : "border-[#ECEEE4] shadow-sm",
                  )}
                >
                  {display.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#8F9E4F] text-white text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
                      Popular
                    </div>
                  )}
                  {isOneTime && (
                    <div className="absolute -top-3 right-4 bg-[#1F2A1F] text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full">
                      one-time
                    </div>
                  )}
                  {includesBadge && !isCurrent && (
                    <div className="mb-3 -mt-1 inline-flex items-center self-start gap-1 rounded-full bg-[#A4B968]/20 text-[#3F4A35] text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                      <Icon name="check" size={12} />
                      {includesBadge}
                    </div>
                  )}

                  <div className="mb-4">
                    <div className="text-3xl mb-2" aria-hidden>
                      {display.emoji}
                    </div>
                    <div className="font-fraunces text-xl font-semibold text-[#1F2A1F]">
                      {display.name}
                    </div>
                    <div className="text-sm text-[#6F7A5A]">{display.tagline}</div>
                  </div>

                  <div className="mb-4 min-h-[64px]">
                    {price && (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">
                            {price.primary}
                          </span>
                          <span className="text-sm text-[#6F7A5A]">
                            {price.suffix}
                          </span>
                        </div>
                        {price.secondary && (
                          <div className="text-xs text-[#6F7A5A] mt-1">
                            {price.secondary}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="mb-5 text-xs text-[#3F4A35]">{display.audience}</div>

                  <ul className="space-y-2 mb-6 flex-1">
                    {features.map((f) => (
                      <li key={f.label} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#8F9E4F]/15 text-[#556036]">
                          <Icon name="check" size={12} />
                        </span>
                        <span className="text-[#1F2A1F]">{f.label}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => startCheckout(planId)}
                    disabled={isCurrent || isLoading || isImpersonating}
                    title={
                      isImpersonating
                        ? "Purchases are disabled in impersonation mode"
                        : undefined
                    }
                    className={cx(
                      "w-full h-11 rounded-xl text-sm font-medium transition",
                      isCurrent || isImpersonating
                        ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                        : display.highlighted
                          ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                          : "border border-[#8F9E4F] bg-white text-[#556036] hover:bg-[#FAFAF7]",
                      isLoading && "opacity-70 cursor-wait animate-pulse",
                    )}
                  >
                    {ctaLabel}
                  </button>
                </div>
              );
              })}
            </div>
          )}

          {/* Add-on info */}
          <div className="mt-6 rounded-2xl border border-[#ECEEE4] bg-white p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div>
              <div className="font-fraunces font-semibold text-[#1F2A1F] mb-1">
                Hit the limit? Buy more slots
              </div>
              <div className="text-sm text-[#6F7A5A]">
                {formatUSD(EXTRA_LISTING.amount)} per extra listing (one-time, kept
                forever). Bought right from the editor when you need it.
              </div>
            </div>
            <div className="rounded-full bg-[#FAFAF7] border border-[#ECEEE4] px-4 py-2 text-sm font-medium text-[#1F2A1F]">
              +1 slot for {formatUSD(EXTRA_LISTING.amount)}
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-3 text-sm text-[#C96A5B] text-center">
              {error}
            </div>
          )}

          <div className="mt-10 text-center text-xs text-[#A8B096] max-w-2xl mx-auto">
            Prices exclude taxes. Maporia is a directory — we don&apos;t process
            payments between buyers and providers; deals happen directly. You can
            cancel any subscription from your{" "}
            <Link className="underline" href="/profile?section=premium">
              account
            </Link>
            .
          </div>
        </div>
      </main>
    </ErrorBoundary>
  );
}
