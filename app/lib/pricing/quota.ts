/**
 * Pricing quota — чистые функции для решения «может ли юзер создать карточку».
 *
 * Эти функции — **поведенческий близнец** SQL-функции `enforce_place_quota()`.
 * Если расходятся — клиент думает «можно создать», сервер откажет, юзер видит loading + ошибку.
 *
 * Equivalence test (Φ12) гоняет случайные входы через обе реализации и сверяет ответы.
 *
 * См. docs/PRICING_V2_PLAN.md § 3 (инвариант квоты) и § 11.2 (DB performance).
 * v3 (2026-05-11) — creator_pro + combinedKinds, см. docs/PRICING_V3_CREATOR_MERGE.md § 3.
 */

import {
  PRICING_REGISTRY,
  type Capability,
  type Kind,
  type PlanId,
} from "./registry";

// Re-export для обратной совместимости — Kind теперь декларируется в registry,
// чтобы PlanQuota.combinedKinds мог его типизировать без circular dep.
export type { Kind } from "./registry";

const DEFAULT_COMBINED_KINDS: readonly Kind[] = [
  "location",
  "service",
  "experience",
] as const;

/**
 * Сколько активных (не удалённых) карточек у юзера сейчас, разбиение по primary kind.
 *
 * SQL-эквивалент: `SELECT kind, count(*) FROM places WHERE created_by = $1 AND
 *                  (deleted_at IS NULL) GROUP BY kind`.
 */
export type PlaceCounts = Record<Kind, number>;

export type QuotaDecision = {
  allowed: boolean;
  reason: "ok" | "no_plan_for_kind" | "limit_reached";
  /** null = безлимит. */
  limit: number | null;
  /** Сколько уже занято под этот kind (или combined-pool). */
  used: number;
  /** Активных bonus credits на момент проверки. */
  bonusCredits: number;
};

/**
 * Может ли юзер создать карточку с данным primary kind.
 *
 * **Не учитывает secondary_kinds.** Secondary location у Pro Service/Pro Creator —
 * бесплатен и не уменьшает location-квоту. Это инвариант новой модели (см. план § 3).
 *
 * Для combined-планов (Pro Creator / Pro All) проверка:
 *   1. `primaryKind` обязан входить в `combinedKinds` (иначе план не покрывает kind).
 *   2. used = сумма counts по всем kind'ам из `combinedKinds`.
 *
 * @param args.plan          — текущий plan юзера (`profiles.plan`).
 * @param args.primaryKind   — kind, который юзер хочет сделать primary.
 * @param args.counts        — текущие counts по kind'ам.
 * @param args.bonusCredits  — `profiles.bonus_listing_credits`.
 * @param args.isAdmin       — админ обходит проверку.
 */
export function computeQuota(args: {
  plan: PlanId;
  primaryKind: Kind;
  counts: PlaceCounts;
  bonusCredits?: number;
  isAdmin?: boolean;
}): QuotaDecision {
  const bonus = args.bonusCredits ?? 0;

  if (args.isAdmin) {
    return { allowed: true, reason: "ok", limit: null, used: 0, bonusCredits: bonus };
  }

  const spec = PRICING_REGISTRY[args.plan];
  if (!spec) {
    throw new Error(`computeQuota: unknown plan "${args.plan}"`);
  }

  // Combined-pool (Pro Creator, Pro All) — общий лимит на kind'ы из combinedKinds.
  if (spec.quota.combined != null) {
    const kinds = spec.quota.combinedKinds ?? DEFAULT_COMBINED_KINDS;

    // primary kind должен входить в combinedKinds.
    // Pro Creator + primaryKind=location → план не покрывает.
    if (!kinds.includes(args.primaryKind)) {
      return {
        allowed: false,
        reason: "no_plan_for_kind",
        limit: 0,
        used: args.counts[args.primaryKind],
        bonusCredits: bonus,
      };
    }

    const used = kinds.reduce((acc, k) => acc + args.counts[k], 0);
    const limit = spec.quota.combined + bonus;
    if (used >= limit) {
      return { allowed: false, reason: "limit_reached", limit, used, bonusCredits: bonus };
    }
    return { allowed: true, reason: "ok", limit, used, bonusCredits: bonus };
  }

  // Per-kind квота (creator_location, creator_service legacy, creator_experience legacy, premium_grandfathered).
  const kindLimit = spec.quota[args.primaryKind];

  if (kindLimit === 0 || kindLimit === undefined) {
    return {
      allowed: false,
      reason: "no_plan_for_kind",
      limit: 0,
      used: args.counts[args.primaryKind],
      bonusCredits: bonus,
    };
  }

  if (kindLimit === null) {
    // Unlimited (например premium_grandfathered.location).
    return {
      allowed: true,
      reason: "ok",
      limit: null,
      used: args.counts[args.primaryKind],
      bonusCredits: bonus,
    };
  }

  const used = args.counts[args.primaryKind];
  const limit = kindLimit + bonus;
  if (used >= limit) {
    return { allowed: false, reason: "limit_reached", limit, used, bonusCredits: bonus };
  }
  return { allowed: true, reason: "ok", limit, used, bonusCredits: bonus };
}

/**
 * Может ли юзер создать карточку, у которой `kind = primary` и
 * `secondary_kinds = secondary`. Возвращает true, только если у плана
 * есть capability на каждый kind.
 *
 * - `primary='location'` → требуется `create_location`.
 * - `primary='service'` → требуется `create_service`.
 * - `primary='experience'` → требуется `create_experience`.
 * - secondary `'location'` → разрешён, если есть `create_location` ИЛИ `create_secondary_location`.
 *
 * NB: эта функция отвечает только на «есть ли capability», не на квоту.
 * Для квоты используй `computeQuota` отдельно.
 */
export function canCreateMultiKind(args: {
  plan: PlanId;
  primary: Kind;
  secondary: readonly Kind[];
  isAdmin?: boolean;
}): boolean {
  if (args.isAdmin) return true;

  const spec = PRICING_REGISTRY[args.plan];
  if (!spec) return false;

  const directCap: Capability =
    args.primary === "location"
      ? "create_location"
      : args.primary === "service"
        ? "create_service"
        : "create_experience";

  if (!spec.capabilities.includes(directCap)) return false;

  for (const k of args.secondary) {
    if (k === args.primary) continue; // не должно случаться по CHECK constraint, но defensive.
    const direct: Capability =
      k === "location" ? "create_location" : k === "service" ? "create_service" : "create_experience";
    const secondary: Capability =
      k === "location" ? "create_secondary_location" : direct; // secondary-bonus сейчас только на location

    if (!spec.capabilities.includes(direct) && !spec.capabilities.includes(secondary)) {
      return false;
    }
  }

  return true;
}

/**
 * Какой минимально-достаточный план покрывает выбранный набор kind'ов.
 * Используется в `BecomeProviderModal` и `PaywallModal` для авто-подбора.
 *
 * Логика v3 (см. docs/PRICING_V3_CREATOR_MERGE.md § 2):
 *   location + (service ∨ experience)  → creator_all     (location требует Pro All)
 *   service ∨ experience               → creator_pro     (merged Pro Creator $14.99)
 *   только location                    → creator_location
 *   пустой набор                       → creator_location (defensive default)
 */
export function suggestPlanForKinds(
  kinds: readonly Kind[],
): Extract<PlanId, "creator_location" | "creator_pro" | "creator_all"> {
  const set = new Set(kinds);
  const hasLocation = set.has("location");
  const hasService = set.has("service");
  const hasExperience = set.has("experience");

  // Любая комбинация с location + чем-то ещё → Pro All (только он даёт create_location вместе с service/experience).
  if (hasLocation && (hasService || hasExperience)) return "creator_all";

  // Только service / experience / их комбинация → Pro Creator.
  if (hasService || hasExperience) return "creator_pro";

  // Чистый location.
  return "creator_location";
}

/** Удобная проверка для UI — пометить чекбокс «covered» если текущий план покрывает kind. */
export function planCoversKind(plan: PlanId, kind: Kind): boolean {
  return canCreateMultiKind({ plan, primary: kind, secondary: [] });
}
