/**
 * Авто-генерация feature-list для /pricing-карточек.
 *
 * Источник правды — `capabilities` + `quota` из registry. UI не пишет
 * features руками — это держит /pricing страницу синхронной с реальной квотой.
 *
 * i18n: пока только `en`. Для русского/прочих локалей расширить `STRINGS`
 * без изменения логики.
 */

import {
  PRICING_REGISTRY,
  type PlanId,
} from "./registry";

export type FeatureItem = {
  label: string;
  included: boolean;
};

export type Locale = "en"; // | "ru" | "es"

const STRINGS = {
  en: {
    view_hidden: "Access to all hidden locations",
    create_location: (n: number | null) =>
      n === null ? "Unlimited locations" : `Up to ${n} locations`,
    create_service: (n: number) => `Up to ${n} services`,
    create_experience: (n: number) => `Up to ${n} experiences`,
    create_combined: (n: number) => `${n} listings combined (any type)`,
    create_secondary_location: "Add a map point to your listing",
    extra_listing: "Extra listing — $2.99",
    premium_included: "Premium access included",
    one_time_lifetime: "One payment, lifetime access",
    yearly_savings: (saved: number) => `Save $${saved.toFixed(2)}/year with annual`,
  },
} satisfies Record<Locale, Record<string, string | ((arg: number | null) => string) | ((arg: number) => string)>>;

/**
 * Сгенерировать список «зелёных галочек» для /pricing-карточки.
 *
 * Я сознательно НЕ возвращаю «не-включённые» фичи — для UI v2 чище показывать
 * только то, что юзер ПОЛУЧИТ. Сравнение между планами делает таблица фичей
 * сверху или сами цифры квот.
 */
export function getFeatures(plan: PlanId, locale: Locale = "en"): FeatureItem[] {
  const spec = PRICING_REGISTRY[plan];
  const t = STRINGS[locale];
  const out: FeatureItem[] = [];

  // Premium-доступ
  if (spec.capabilities.includes("view_hidden")) {
    if (spec.type === "creator") {
      out.push({ label: t.premium_included, included: true });
    } else {
      out.push({ label: t.view_hidden, included: true });
    }
  }

  // Combined-pool (Pro All) приоритетнее per-kind квоты
  if (spec.quota.combined != null) {
    out.push({ label: t.create_combined(spec.quota.combined), included: true });
  } else {
    if (spec.quota.location != null && spec.quota.location !== 0) {
      out.push({ label: t.create_location(spec.quota.location), included: true });
    } else if (spec.quota.location === null) {
      out.push({ label: t.create_location(null), included: true });
    }
    if (spec.quota.service && spec.quota.service > 0) {
      out.push({ label: t.create_service(spec.quota.service), included: true });
    }
    if (spec.quota.experience && spec.quota.experience > 0) {
      out.push({ label: t.create_experience(spec.quota.experience), included: true });
    }
  }

  // Secondary location (только если у плана нет direct create_location)
  if (
    spec.capabilities.includes("create_secondary_location") &&
    !spec.capabilities.includes("create_location")
  ) {
    out.push({ label: t.create_secondary_location, included: true });
  }

  // Add-on
  if (spec.type === "creator") {
    out.push({ label: t.extra_listing, included: true });
  }

  // Premium one-time
  const usd = spec.prices.USD;
  if (usd?.lifetime && !usd.month) {
    out.push({ label: t.one_time_lifetime, included: true });
  }

  return out;
}
