/**
 * Форматирование цен и периодов для UI.
 * Простые pure-функции без локализации валюты — пока только USD.
 */

import {
  ANNUAL_DISCOUNT,
  getPriceSpec,
  type Currency,
  type Cycle,
  type PlanId,
} from "./registry";

export function formatUSD(amount: number): string {
  const hasCents = amount % 1 !== 0;
  return `$${hasCents ? amount.toFixed(2) : Math.round(amount)}`;
}

export type PriceDisplay = {
  /** Большая цена, которая видна в карточке. */
  primary: string;
  /** Подпись под primary (например, "billed yearly · save $36"). null = нечего добавлять. */
  secondary: string | null;
  /** Краткий suffix к primary, например "/mo" / "/yr" / "one-time". */
  suffix: string;
};

/**
 * Готовое представление цены для /pricing-карточки.
 *
 * Monthly:  primary="$14.99/mo"             secondary="billed monthly"
 * Yearly:   primary="$11.99/mo"             secondary="$143.88 billed yearly · save $36"
 * Lifetime: primary="$35"                   secondary="one payment, lifetime access"
 */
export function priceDisplay(
  plan: PlanId,
  cycle: Cycle,
  currency: Currency = "USD",
): PriceDisplay | null {
  const spec = getPriceSpec(plan, cycle, currency);
  if (!spec) return null;

  if (cycle === "month") {
    return {
      primary: formatUSD(spec.amount),
      suffix: "/mo",
      secondary: "billed monthly",
    };
  }

  if (cycle === "year") {
    const monthlyEquivalent = spec.amount / 12;
    const monthlySpec = getPriceSpec(plan, "month", currency);
    const saved = monthlySpec ? monthlySpec.amount * 12 - spec.amount : null;
    return {
      primary: formatUSD(round2(monthlyEquivalent)),
      suffix: "/mo",
      secondary:
        saved != null && saved > 0
          ? `${formatUSD(spec.amount)} billed yearly · save ${formatUSD(round2(saved))}`
          : `${formatUSD(spec.amount)} billed yearly`,
    };
  }

  // lifetime
  return {
    primary: formatUSD(spec.amount),
    suffix: "one-time",
    secondary: "one payment, lifetime access",
  };
}

/** Saving-бейдж для toggle "Yearly · Save 20%". */
export function annualDiscountLabel(): string {
  return `Save ${Math.round(ANNUAL_DISCOUNT * 100)}%`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
