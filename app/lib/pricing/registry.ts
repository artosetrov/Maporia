/**
 * Pricing registry — единственный источник правды о планах, ценах, квотах,
 * и Stripe Price ID. Все остальные модули (quota.ts, checkout.ts, features.ts,
 * UI на /pricing, BecomeProviderModal, webhook) читают этот файл.
 *
 * Принципы (см. docs/PRICING_V2_PLAN.md § 11.1):
 *   1. Добавление нового плана = патч этого файла + миграция БД. Ничего больше.
 *   2. Никаких хардкоженных STRIPE_PRICE_* в роутах — только через `prices.<currency>.<cycle>.stripeIdEnv`.
 *   3. UI features генерируются из `capabilities` + `quota` (см. features.ts) — не пишутся руками.
 *   4. Структура `prices.USD = {...}` готова к расширению до `prices.EUR/RUB` без рефактора.
 *
 * Связь с SQL: enum `profiles.plan` в БД должен содержать ровно те же ключи,
 * что и `PRICING_REGISTRY`. Тест эквивалентности — см. `__tests__/registry.spec.ts`
 * (Φ12 — TS↔SQL quota equivalence).
 */

/** Что юзер может делать с этим планом. Используется UI и quota.ts для решений. */
export type Capability =
  | "view_hidden" // открывать скрытые локации (consumer)
  | "create_location" // создавать pure-location карточки (primary kind = location)
  | "create_service" // создавать service-карточки
  | "create_experience" // создавать experience-карточки
  | "create_secondary_location"; // прикрепить координату к service/experience карточке (secondary_kinds=['location'])

/** Биллинг-период. `lifetime` — for one-time платежей (Premium, add-on). */
export type Cycle = "month" | "year" | "lifetime";

/** ISO 4217. Реально используем только USD сейчас. EUR/RUB — точки расширения. */
export type Currency = "USD";

export type PriceSpec = {
  /** Сумма в долларах (для UI). Stripe хранит в центах (`amount * 100`). */
  amount: number;
  /** Имя ENV-переменной, в которой лежит Stripe Price ID. */
  stripeIdEnv: string;
};

/**
 * Лимиты по primary kind.
 * - 0 = создавать этот kind как primary нельзя.
 * - null = безлимит (используется для grandfathered).
 * - combined = общий пул на ВСЕ 3 kind'а (Pro All).
 *
 * Если задан `combined`, остальные поля игнорируются.
 */
export type PlanQuota = {
  location?: number | null;
  service?: number | null;
  experience?: number | null;
  combined?: number;
};

export type PlanDisplay = {
  /** Имя для /pricing-карточки. */
  name: string;
  /** Подпись под названием. */
  tagline: string;
  emoji: string;
  /** Кому подходит — короткая строка. */
  audience: string;
  /** Подсветить как "popular" в /pricing. */
  highlighted?: boolean;
};

export type PlanSpec = {
  /** Consumer = только просмотр; creator = публикация. */
  type: "consumer" | "creator";
  capabilities: readonly Capability[];
  quota: PlanQuota;
  /** Цены по валютам и циклам. Для free и internal — пустой объект. */
  prices: Partial<Record<Currency, Partial<Record<Cycle, PriceSpec>>>>;
  /** Не показывать на /pricing — для grandfathered и других internal-only планов. */
  internal?: boolean;
  /** Display-данные. Опциональны для internal планов. */
  display?: PlanDisplay;
};

/**
 * Каноничный union plan ID. Источник правды для типизации `profiles.plan`.
 * Совпадение с SQL-enum проверяется в Φ12 (TS↔SQL equivalence test).
 */
export type PlanId =
  | "free"
  | "premium_viewer"
  | "premium_grandfathered"
  | "creator_location"
  | "creator_service"
  | "creator_experience"
  | "creator_all";

/**
 * Финальная сетка тарифов Maporia v2 (см. docs/PRICING_V2_PLAN.md § 1).
 *
 * Yearly-цены посчитаны как `monthly × 12 × 0.80` с округлением до `.99`-ending
 * monthly equivalent: $11.99/mo billed yearly = $143.88/yr.
 *
 * Тип `Record<PlanId, PlanSpec>` гарантирует exhaustive-проверку: добавил `PlanId`,
 * но забыл объект здесь — TS падает. Удалил из union, не убрал из объекта — TS падает.
 */
export const PRICING_REGISTRY: Record<PlanId, PlanSpec> = {
  /** Аноним или авторизованный без оплаты. */
  free: {
    type: "consumer",
    capabilities: [],
    quota: { location: 0, service: 0, experience: 0 },
    prices: {},
    internal: true, // на /pricing free показываем как "current state", не как покупаемый план
  },

  /** $35 one-time, открывает скрытые локации. С v2 — чисто consumer. */
  premium_viewer: {
    type: "consumer",
    capabilities: ["view_hidden"],
    quota: { location: 0, service: 0, experience: 0 },
    prices: {
      USD: {
        lifetime: { amount: 35, stripeIdEnv: "STRIPE_PRICE_PREMIUM_ONETIME" },
      },
    },
    display: {
      name: "Premium",
      tagline: "Unlock all hidden locations",
      emoji: "🗝",
      audience: "Travellers who want to see secret places",
    },
  },

  /**
   * Grandfather-план для existing Premium-юзеров, у которых ДО релиза v2
   * уже опубликованы location-карточки. Не продаётся; миграция переводит
   * их в этот план pre-deploy. См. docs/PRICING_V2_PLAN.md § 7.
   */
  premium_grandfathered: {
    type: "consumer",
    capabilities: ["view_hidden", "create_location"],
    quota: { location: null, service: 0, experience: 0 }, // unlimited locations
    prices: {},
    internal: true,
  },

  /** $9.99/mo. Только location. */
  creator_location: {
    type: "creator",
    capabilities: ["view_hidden", "create_location"],
    quota: { location: 5, service: 0, experience: 0 },
    prices: {
      USD: {
        month: { amount: 9.99, stripeIdEnv: "STRIPE_PRICE_CREATOR_LOCATION_MONTH" },
        year: { amount: 95.88, stripeIdEnv: "STRIPE_PRICE_CREATOR_LOCATION_YEAR" },
      },
    },
    display: {
      name: "Pro Location",
      tagline: "Publish places on the map",
      emoji: "📍",
      audience: "Local business owners, café/bar/spot keepers",
    },
  },

  /** $14.99/mo. Service + secondary location free. */
  creator_service: {
    type: "creator",
    capabilities: [
      "view_hidden",
      "create_service",
      "create_secondary_location",
    ],
    quota: { location: 0, service: 5, experience: 0 },
    prices: {
      USD: {
        month: { amount: 14.99, stripeIdEnv: "STRIPE_PRICE_CREATOR_SERVICE_MONTH" },
        year: { amount: 143.88, stripeIdEnv: "STRIPE_PRICE_CREATOR_SERVICE_YEAR" },
      },
    },
    display: {
      name: "Pro Service",
      tagline: "Publish your services",
      emoji: "🛠",
      audience: "Photographers, instructors, makers, freelancers",
    },
  },

  /** $14.99/mo. Experience + secondary location free. */
  creator_experience: {
    type: "creator",
    capabilities: [
      "view_hidden",
      "create_experience",
      "create_secondary_location",
    ],
    quota: { location: 0, service: 0, experience: 5 },
    prices: {
      USD: {
        month: { amount: 14.99, stripeIdEnv: "STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH" },
        year: { amount: 143.88, stripeIdEnv: "STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR" },
      },
    },
    display: {
      name: "Pro Experience",
      tagline: "Launch your experiences",
      emoji: "✨",
      audience: "Guides, tour operators, workshop hosts",
    },
  },

  /** $34.99/mo. All 3 types in a combined pool of 10. */
  creator_all: {
    type: "creator",
    capabilities: [
      "view_hidden",
      "create_location",
      "create_service",
      "create_experience",
      "create_secondary_location",
    ],
    quota: { combined: 10 },
    prices: {
      USD: {
        month: { amount: 34.99, stripeIdEnv: "STRIPE_PRICE_CREATOR_ALL_MONTH" },
        year: { amount: 335.88, stripeIdEnv: "STRIPE_PRICE_CREATOR_ALL_YEAR" },
      },
    },
    display: {
      name: "Pro All-in",
      tagline: "Locations + services + experiences",
      emoji: "🚀",
      highlighted: true,
      audience: "Agencies, productions, creators with multiple formats",
    },
  },
};

/** Set всех публично продаваемых планов (без `internal`). Для /pricing-grid. */
export const PUBLIC_PLANS: readonly PlanId[] = (
  Object.keys(PRICING_REGISTRY) as PlanId[]
).filter((p) => !PRICING_REGISTRY[p].internal);

/** Все creator-планы (могут что-то публиковать). */
export const CREATOR_PLAN_IDS: readonly PlanId[] = (
  Object.keys(PRICING_REGISTRY) as PlanId[]
).filter((p) => PRICING_REGISTRY[p].type === "creator");

/** Add-on $2.99 — не вписывается в plan model, оставляем отдельно. */
export const EXTRA_LISTING = {
  amount: 2.99,
  currency: "USD" as const,
  stripeIdEnv: "STRIPE_PRICE_EXTRA_LISTING" as const,
} as const;

/** Скидка для yearly cycle. Используется UI для "Save XX%" badge. */
export const ANNUAL_DISCOUNT = 0.2;

/** Выводит cycle (month/year) для recurring planов; lifetime для Premium. */
export function planBillingCycle(plan: PlanId): Cycle | "none" {
  const spec = PRICING_REGISTRY[plan];
  const usd = spec.prices.USD;
  if (!usd) return "none";
  if (usd.month) return "month";
  if (usd.lifetime) return "lifetime";
  return "none";
}

/**
 * Безопасный геттер price spec. Возвращает null, если такого варианта нет
 * (например, premium у которого нет yearly).
 */
export function getPriceSpec(
  plan: PlanId,
  cycle: Cycle,
  currency: Currency = "USD",
): PriceSpec | null {
  return PRICING_REGISTRY[plan].prices[currency]?.[cycle] ?? null;
}
