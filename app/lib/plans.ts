/**
 * Тарифы Maporia: единый источник правды для UI, биллинга и пейволлов.
 *
 * Окончательная сетка (от пользователя):
 *  - Premium: $35 one-time, открывает скрытые локации навсегда.
 *  - Pro Service: $14.99 / мес, можно опубликовать 5 услуг (плюс Premium бесплатно).
 *  - Pro Experience: $14.99 / мес, можно опубликовать 5 впечатлений (плюс Premium).
 *  - Pro All: $34.99 / мес, **10 в сумме** (services + experiences) + Premium.
 *  - Каждая карточка сверх лимита докупается за $2.99 (one-time, листинг навсегда).
 *
 * Любой Pro-тариф автоматически даёт hasPremium = true (через `isPaidPlan` в access.ts),
 * так что отдельно покупать Premium при наличии Pro не нужно.
 *
 * ⚠️ Цены здесь должны совпадать с Stripe Price'ами по env-переменным.
 */

import type { CreatorPlan, PaidPlan, Plan } from "../types";

export type PlanFeature = {
  label: string;
  included: boolean;
};

/** Период в Stripe для каждого тарифа. */
export type PlanBilling =
  | { kind: "one_time" }
  | { kind: "subscription"; period: "month" | "year" };

export type PlanQuota = {
  /**
   * Лимит активных карточек по конкретному kind'у.
   * null = безлимит, 0 = создавать нельзя.
   */
  service: number | null;
  experience: number | null;
  /**
   * Если задан — это **общий пул** на услуги + впечатления (Pro All).
   * При наличии combined `service` и `experience` задают только верхние частные пределы
   * (не больше combined). Pooled квота используется первой при подсчёте.
   */
  combined?: number;
};

export type PlanConfig = {
  id: PaidPlan;
  display: {
    name: string;
    tagline: string;
    emoji: string;
    /** USD. Для one-time — общая сумма. Для subscription — за период. */
    price: number;
    currency: "USD";
    features: PlanFeature[];
    highlighted?: boolean;
    audience: string;
    /** Подпись цены, например "/ мес" или "разово". */
    priceSuffix: string;
  };
  billing: PlanBilling;
  quota: PlanQuota;
  /** ENV-переменная со Stripe Price ID. */
  priceIdEnv: string;
};

/**
 * Add-on: одна дополнительная карточка сверх лимита тарифа.
 * Разовый платёж, навсегда добавляет +1 к квоте юзера через
 * profiles.bonus_listing_credits.
 */
export const EXTRA_LISTING = {
  price: 2.99,
  currency: "USD" as const,
  priceIdEnv: "STRIPE_PRICE_EXTRA_LISTING",
};

/** ENV-переменная legacy Premium one-time. Совместима со старым STRIPE_PRICE_ID. */
const PREMIUM_PRICE_ENV = "STRIPE_PRICE_PREMIUM_ONETIME";

export const PLAN_CONFIG: Record<PaidPlan, PlanConfig> = {
  premium_viewer: {
    id: "premium_viewer",
    display: {
      name: "Premium",
      tagline: "Unlock all hidden locations",
      emoji: "🗝",
      price: 35,
      currency: "USD",
      priceSuffix: "one-time",
      audience: "For travellers who want to see secret places",
      features: [
        { label: "Access to all hidden locations", included: true },
        { label: "Unlimited favourites and collections", included: true },
        { label: "Publish your own locations", included: true },
        { label: "One payment, lifetime access", included: true },
        { label: "Publish services", included: false },
        { label: "Publish experiences", included: false },
      ],
    },
    billing: { kind: "one_time" },
    quota: { service: 0, experience: 0 },
    priceIdEnv: PREMIUM_PRICE_ENV,
  },

  creator_service: {
    id: "creator_service",
    display: {
      name: "Pro Service",
      tagline: "Publish your services",
      emoji: "🛠",
      price: 14.99,
      currency: "USD",
      priceSuffix: "/ mo",
      audience: "Photographers, instructors, makers, freelancers",
      features: [
        { label: "Premium included for free", included: true },
        { label: "Up to 5 active services", included: true },
        { label: "Publish locations", included: true },
        { label: "Extra listing over the limit — $2.99", included: true },
        { label: "Publish experiences", included: false },
      ],
    },
    billing: { kind: "subscription", period: "month" },
    quota: { service: 5, experience: 0 },
    priceIdEnv: "STRIPE_PRICE_CREATOR_SERVICE_MONTH",
  },

  creator_experience: {
    id: "creator_experience",
    display: {
      name: "Pro Experience",
      tagline: "Launch your experiences",
      emoji: "✨",
      price: 14.99,
      currency: "USD",
      priceSuffix: "/ mo",
      audience: "Guides, tour operators, workshop hosts",
      features: [
        { label: "Premium included for free", included: true },
        { label: "Up to 5 active experiences", included: true },
        { label: "Airbnb-style experience page", included: true },
        { label: "Extra listing over the limit — $2.99", included: true },
        { label: "Publish services", included: false },
      ],
    },
    billing: { kind: "subscription", period: "month" },
    quota: { service: 0, experience: 5 },
    priceIdEnv: "STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH",
  },

  creator_all: {
    id: "creator_all",
    display: {
      name: "Pro All-in",
      tagline: "Services + experiences + locations",
      emoji: "🚀",
      price: 34.99,
      currency: "USD",
      priceSuffix: "/ mo",
      highlighted: true,
      audience: "Agencies, productions, creators running multiple formats",
      features: [
        { label: "Premium included for free", included: true },
        { label: "Up to 10 listings combined (services + experiences)", included: true },
        { label: "Unlimited locations", included: true },
        { label: "Extra listing over the limit — $2.99", included: true },
        { label: "Pro badge on your listings", included: true },
      ],
    },
    billing: { kind: "subscription", period: "month" },
    // 10 is the combined pool. service/experience individually also can't exceed 10.
    quota: { service: 10, experience: 10, combined: 10 },
    priceIdEnv: "STRIPE_PRICE_CREATOR_ALL_MONTH",
  },
};

/** Список тарифов слева направо в /pricing. */
export const PLAN_ORDER: PaidPlan[] = [
  "premium_viewer",
  "creator_service",
  "creator_experience",
  "creator_all",
];

export const CREATOR_PLAN_IDS: CreatorPlan[] = [
  "creator_service",
  "creator_experience",
  "creator_all",
];

/** Форматирование цены в UI. */
export function formatPrice(amount: number, currency: "USD" = "USD"): string {
  const symbol = currency === "USD" ? "$" : currency;
  const hasCents = amount % 1 !== 0;
  return `${symbol}${hasCents ? amount.toFixed(2) : Math.round(amount)}`;
}

/**
 * Какой тариф минимально достаточен для публикации kind'а.
 *  - location → premium_viewer (любой Pro тоже подойдёт, но минимум — Premium).
 *  - service → creator_service.
 *  - experience → creator_experience.
 */
export function suggestPlanForKind(
  kind: "location" | "service" | "experience"
): PaidPlan {
  if (kind === "location") return "premium_viewer";
  if (kind === "service") return "creator_service";
  return "creator_experience";
}

/**
 * Возвращает квоту по конкретному kind'у с учётом combined-pool.
 * Если у тарифа есть `combined`, значит лимит общий между service+experience.
 */
export function quotaFor(plan: Plan, kind: "service" | "experience"): {
  limit: number | null;
  pooled: boolean;
} {
  if (plan === "free") return { limit: 0, pooled: false };
  const cfg = PLAN_CONFIG[plan as PaidPlan];
  if (!cfg) return { limit: 0, pooled: false };
  if (cfg.quota.combined != null) {
    return { limit: cfg.quota.combined, pooled: true };
  }
  return { limit: cfg.quota[kind], pooled: false };
}
