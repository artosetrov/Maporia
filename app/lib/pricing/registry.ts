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
 *
 * v3 (2026-05-11) — см. docs/PRICING_V3_CREATOR_MERGE.md.
 * Pro Service + Pro Experience объединены в Pro Creator ($14.99, 5 combined),
 * Pro All-in переоценён с $34.99 → $19.99. creator_service/creator_experience
 * помечены `legacy: true` — оставлены для grandfathered подписчиков, из PUBLIC_PLANS убраны.
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

/**
 * Канонические kind'ы карточек (place.kind). Дублирует тип из `quota.ts` — там
 * он реэкспортируется отсюда, чтобы избежать circular dep между registry и quota.
 */
export type Kind = "location" | "service" | "experience";

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
 * - combined = общий пул на kind'ы из `combinedKinds`.
 *
 * Если задан `combined`, остальные per-kind поля игнорируются.
 * `combinedKinds` опционально: если не задан и есть `combined` — считаем что пул на все 3 kind'а
 * (обратная совместимость с v2 семантикой Pro All).
 */
export type PlanQuota = {
  location?: number | null;
  service?: number | null;
  experience?: number | null;
  combined?: number;
  combinedKinds?: readonly Kind[];
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
  /** Не показывать на /pricing — для системных планов (free / grandfathered). */
  internal?: boolean;
  /**
   * План больше не продаётся новым юзерам, но активные подписчики на нём
   * остаются (grandfathered v3 от 2026-05-11). На /pricing не показываем,
   * на /profile/billing рендерим только если у юзера такой план.
   */
  legacy?: boolean;
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
  | "creator_service"      // legacy (v2 → v3 merge): grandfathered
  | "creator_experience"   // legacy (v2 → v3 merge): grandfathered
  | "creator_pro"          // v3: services + experiences combined
  | "creator_all";

const ALL_3_KINDS: readonly Kind[] = ["location", "service", "experience"] as const;
const SERVICE_EXPERIENCE_KINDS: readonly Kind[] = ["service", "experience"] as const;

/**
 * Финальная сетка тарифов Maporia v3 (см. docs/PRICING_V3_CREATOR_MERGE.md § 1).
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

  /**
   * LEGACY v2 (creator_service). С 2026-05-11 заменён `creator_pro`.
   * Активные подписчики остаются — план grandfathered. На /pricing не показываем.
   * Webhook (resolvePlanByPriceId) и enforce_place_quota продолжают его понимать.
   */
  creator_service: {
    type: "creator",
    legacy: true,
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

  /**
   * LEGACY v2 (creator_experience). С 2026-05-11 заменён `creator_pro`.
   * Активные подписчики остаются — план grandfathered.
   */
  creator_experience: {
    type: "creator",
    legacy: true,
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

  /**
   * v3 (2026-05-11): $14.99/mo. Services ИЛИ experiences в combined-пуле на 5 слотов.
   * Secondary location — бесплатно (как у legacy service/experience).
   */
  creator_pro: {
    type: "creator",
    capabilities: [
      "view_hidden",
      "create_service",
      "create_experience",
      "create_secondary_location",
    ],
    quota: { combined: 5, combinedKinds: SERVICE_EXPERIENCE_KINDS },
    prices: {
      USD: {
        month: { amount: 14.99, stripeIdEnv: "STRIPE_PRICE_CREATOR_PRO_MONTH" },
        year: { amount: 143.88, stripeIdEnv: "STRIPE_PRICE_CREATOR_PRO_YEAR" },
      },
    },
    display: {
      name: "Pro Creator",
      tagline: "Services + experiences",
      emoji: "🎨",
      audience: "Photographers, instructors, guides, workshop hosts — anyone selling time or expertise",
    },
  },

  /**
   * v3 (2026-05-11): $19.99/mo (было $34.99). All 3 types in a combined pool of 10.
   *
   * ⚠ Migration: активные подписки на старом $34.99 Stripe Price необходимо
   * переключить на новый Price ID через `scripts/stripe/migrate-all-in-to-v3.ts`.
   * Старые Stripe Prices в Dashboard надо пометить inactive до повторного
   * прогона provision-prices.ts (иначе скрипт переиспользует их с MISMATCH).
   */
  creator_all: {
    type: "creator",
    capabilities: [
      "view_hidden",
      "create_location",
      "create_service",
      "create_experience",
      "create_secondary_location",
    ],
    quota: { combined: 10, combinedKinds: ALL_3_KINDS },
    prices: {
      USD: {
        month: { amount: 19.99, stripeIdEnv: "STRIPE_PRICE_CREATOR_ALL_MONTH" },
        year: { amount: 191.88, stripeIdEnv: "STRIPE_PRICE_CREATOR_ALL_YEAR" },
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

/** Set всех публично продаваемых планов (без `internal` и без `legacy`). Для /pricing-grid. */
export const PUBLIC_PLANS: readonly PlanId[] = (
  Object.keys(PRICING_REGISTRY) as PlanId[]
).filter((p) => {
  const spec = PRICING_REGISTRY[p];
  return !spec.internal && !spec.legacy;
});

/** Все creator-планы (могут что-то публиковать) — включая legacy для webhook/quota. */
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

/** Является ли план legacy (отслужил, но grandfathered активным подписчикам). */
export function isLegacyPlan(plan: PlanId): boolean {
  return PRICING_REGISTRY[plan].legacy === true;
}

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
