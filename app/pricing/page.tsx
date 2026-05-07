"use client";

/**
 * /pricing — публичная страница тарифов.
 *
 * Сетка:
 *   - Free: $0
 *   - Premium: $35 one-time, скрытые локации навсегда
 *   - Pro Service: $14.99/мес, 5 услуг
 *   - Pro Experience: $14.99/мес, 5 впечатлений
 *   - Pro All: $34.99/мес, 10 в сумме (services + experiences)
 *
 * Любой Pro включает Premium бесплатно.
 * Карточка сверх лимита — $2.99 (см. footer).
 *
 * CTA → POST /api/stripe/checkout.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import {
  EXTRA_LISTING,
  PLAN_CONFIG,
  PLAN_ORDER,
  formatPrice,
} from "../lib/plans";
import type { PaidPlan } from "../types";
import TopBar from "../components/TopBar";
import Icon from "../components/Icon";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function PricingPage() {
  const router = useRouter();
  const { user, profile, access } = useUserAccessContext();
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = access?.plan ?? "free";
  const plans = PLAN_ORDER.map((id) => PLAN_CONFIG[id]);

  async function startCheckout(plan: PaidPlan) {
    setError(null);

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

      const cfg = PLAN_CONFIG[plan];
      const body: Record<string, string> = { access_token: accessToken, plan };
      if (cfg.billing.kind === "subscription") {
        body.period = cfg.billing.period;
      }

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
    <main className="min-h-screen bg-[#FAFAF7]">
      <TopBar
        showBackButton
        onBackClick={() => router.back()}
        userAvatar={profile?.avatar_url ?? null}
        userDisplayName={profile?.display_name ?? null}
        userEmail={user?.email ?? null}
      />

      {/* pt компенсирует sticky TopBar (~64px) + дыхание */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-[88px] sm:pt-[112px] pb-8 sm:pb-14">
        <header className="text-center mb-8 sm:mb-10">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-semibold text-[#1F2A1F] mb-3">
            Maporia plans
          </h1>
          <p className="text-[15px] text-[#6F7A5A] max-w-2xl mx-auto">
            Premium unlocks hidden locations with a one-time payment. Pro plans
            let you publish services and experiences — Premium is included.
          </p>
        </header>

        {/* 4 платных тарифа */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => {
            const isCurrent = currentPlan === p.id;
            const isLoading = checkoutPlan === p.id;
            const ctaLabel = isCurrent
              ? "Current plan"
              : isLoading
              ? "Loading…"
              : p.billing.kind === "one_time"
              ? "Buy"
              : "Subscribe";

            return (
              <div
                key={p.id}
                className={cx(
                  "relative rounded-2xl border bg-white p-5 sm:p-6 flex flex-col",
                  p.display.highlighted
                    ? "border-[#8F9E4F] shadow-md"
                    : "border-[#ECEEE4] shadow-sm"
                )}
              >
                {p.display.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#8F9E4F] text-white text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
                    Popular
                  </div>
                )}
                {p.billing.kind === "one_time" && (
                  <div className="absolute -top-3 right-4 bg-[#1F2A1F] text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full">
                    one-time
                  </div>
                )}

                <div className="mb-4">
                  <div className="text-3xl mb-2" aria-hidden>
                    {p.display.emoji}
                  </div>
                  <div className="font-fraunces text-xl font-semibold text-[#1F2A1F]">
                    {p.display.name}
                  </div>
                  <div className="text-sm text-[#6F7A5A]">{p.display.tagline}</div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">
                      {formatPrice(p.display.price)}
                    </span>
                    <span className="text-sm text-[#6F7A5A]">{p.display.priceSuffix}</span>
                  </div>
                </div>

                <div className="mb-5 text-xs text-[#3F4A35]">{p.display.audience}</div>

                <ul className="space-y-2 mb-6 flex-1">
                  {p.display.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#8F9E4F]/15 text-[#556036]">
                          <Icon name="check" size={12} />
                        </span>
                      ) : (
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#ECEEE4] text-[#A8B096]">
                          ×
                        </span>
                      )}
                      <span className={cx(f.included ? "text-[#1F2A1F]" : "text-[#A8B096] line-through")}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => startCheckout(p.id)}
                  disabled={isCurrent || isLoading}
                  className={cx(
                    "w-full h-11 rounded-xl text-sm font-medium transition",
                    isCurrent
                      ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                      : p.display.highlighted
                      ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                      : "border border-[#8F9E4F] bg-white text-[#556036] hover:bg-[#FAFAF7]",
                    isLoading && "opacity-70 cursor-wait"
                  )}
                >
                  {ctaLabel}
                </button>
              </div>
            );
          })}
        </div>

        {/* Add-on info */}
        <div className="mt-6 rounded-2xl border border-[#ECEEE4] bg-white p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div>
            <div className="font-fraunces font-semibold text-[#1F2A1F] mb-1">
              Hit the limit? Buy more slots
            </div>
            <div className="text-sm text-[#6F7A5A]">
              {formatPrice(EXTRA_LISTING.price)} per extra listing (one-time, kept forever). Bought right from the editor when you need it.
            </div>
          </div>
          <div className="rounded-full bg-[#FAFAF7] border border-[#ECEEE4] px-4 py-2 text-sm font-medium text-[#1F2A1F]">
            +1 slot for {formatPrice(EXTRA_LISTING.price)}
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
          <Link className="underline" href="/profile?section=premium">account</Link>.
        </div>
      </div>
    </main>
  );
}
