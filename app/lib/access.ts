/**
 * Access control utilities for Maporia user roles and permissions
 * 
 * User Roles:
 * - guest: Not authenticated
 * - standard: Authenticated without active subscription
 * - premium: Authenticated with active subscription
 * - admin: Platform administrator
 */

import type { Plan, Profile, Place } from "../types";

export type UserRole = "guest" | "standard" | "premium" | "admin";
export type SubscriptionStatus = "active" | "inactive";
export type AccessLevel = "public" | "premium";

/**
 * Тарифы, дающие право создавать карточки соответствующих kind'ов.
 *
 *   creator_service     → создаёт услуги + локации
 *   creator_experience  → создаёт впечатления + локации
 *   creator_all         → всё
 *
 * premium_viewer не создаёт ничего сам, но видит скрытые локации.
 * Любой creator-тариф автоматически даёт право premium_viewer.
 */
export const CREATOR_PLANS = [
  "creator_service",
  "creator_experience",
  "creator_all",
] as const satisfies ReadonlyArray<Plan>;

export type UserAccess = {
  role: UserRole;
  hasPremium: boolean;
  isAdmin: boolean;
  subscriptionStatus?: SubscriptionStatus;
  /** Точный тариф из profiles.plan; 'free' для гостей и не-плательщиков. */
  plan: Plan;
};

export type PlaceAccess = {
  accessLevel: AccessLevel;
};

/**
 * Determines user's role and access level based on profile
 * 
 * @param profile - User profile object (from profiles table) or null for guests
 * @returns UserAccess with role, hasPremium, and isAdmin status
 */
export function getUserAccess(profile: Profile | null): UserAccess {
  // Guest: no profile or no authenticated user
  if (!profile) {
    return {
      role: "guest",
      hasPremium: false,
      isAdmin: false,
      plan: "free",
    };
  }

  // Resolve plan with backward compatibility:
  //   - profiles.plan — новое поле (после миграции add_subscription_plans_and_history).
  //   - subscription_status='active' — legacy: lifetime premium из старых one-time платежей.
  //   - Иначе — free.
  let plan: Plan = (profile.plan as Plan | null | undefined) ?? "free";
  if (plan === "free" && profile.subscription_status === "active") {
    plan = "premium_viewer";
  }

  // Admin: check is_admin field — админ имеет полный доступ независимо от тарифа
  if (profile.is_admin === true) {
    return {
      role: "admin",
      hasPremium: true,
      isAdmin: true,
      subscriptionStatus: profile.subscription_status || undefined,
      plan,
    };
  }

  // Любой платный план даёт доступ ко всему premium-контенту
  const isPaidPlan = plan !== "free";
  if (isPaidPlan) {
    return {
      role: "premium",
      hasPremium: true,
      isAdmin: false,
      subscriptionStatus: "active",
      plan,
    };
  }

  // Standard: авторизован, но без оплаченного плана
  const subscriptionStatus = profile.subscription_status as SubscriptionStatus | undefined;
  return {
    role: "standard",
    hasPremium: false,
    isAdmin: false,
    subscriptionStatus: subscriptionStatus || "inactive",
    plan: "free",
  };
}

/**
 * Checks if a place is premium-only
 * 
 * @param place - Place object from database
 * @returns true if place is premium-only
 */
export function isPlacePremium(place: Place | { access_level?: string | null; is_premium?: boolean | null; premium_only?: boolean | null; visibility?: string | null; accessLevel?: AccessLevel }): boolean {
  // Check access_level field (primary)
  if (place.access_level === 'premium') {
    return true;
  }
  
  // Legacy fields (for backward compatibility)
  if (place.is_premium === true) {
    return true;
  }
  if (place.premium_only === true) {
    return true;
  }
  if (place.visibility === 'premium') {
    return true;
  }
  
  // For draft state (wizard)
  if (place.accessLevel === "premium") {
    return true;
  }
  
  return false;
}

/**
 * Determines if a user can view a specific place
 * 
 * @param userAccess - User's access level
 * @param place - Place object
 * @returns true if user can view the place
 */
export function canUserViewPlace(userAccess: UserAccess, place: Place | { access_level?: string | null; is_premium?: boolean | null; premium_only?: boolean | null; visibility?: string | null; accessLevel?: AccessLevel }): boolean {
  const isPremium = isPlacePremium(place);
  
  // Public places are viewable by everyone
  if (!isPremium) {
    return true;
  }
  
  // Premium places require premium access (premium role OR admin role)
  return userAccess.hasPremium === true;
}

/**
 * Checks if user can add/edit premium places
 * 
 * @param userAccess - User's access level
 * @returns true if user can create/edit premium places
 */
export function canUserCreatePremiumPlace(userAccess: UserAccess): boolean {
  // Only premium users and admins can create premium places
  return userAccess.role === "premium" || userAccess.role === "admin";
}

/**
 * Checks if user can like/comment/save places
 * 
 * @param userAccess - User's access level
 * @returns true if user can interact with places
 */
export function canUserInteract(userAccess: UserAccess): boolean {
  // Guests cannot interact, all authenticated users can
  return userAccess.role !== "guest";
}

/**
 * Checks if user can add places of any kind.
 *
 * @deprecated Use canUserCreate(userAccess, kind) instead — даёт права по конкретному типу.
 *             Сохранено для обратной совместимости (используется в /add и местах,
 *             которые пока не различают kind).
 */
export function canUserAddPlace(userAccess: UserAccess): boolean {
  return userAccess.role === "premium" || userAccess.role === "admin";
}

/**
 * Право публиковать карточку определённого типа.
 *
 *  - location:   любой платный план (premium_viewer тоже — такая модель сейчас).
 *  - service:    creator_service / creator_all / admin
 *  - experience: creator_experience / creator_all / admin
 *
 * Why: location — почти бесплатная фича каталога; основная монетизация
 * на услугах и впечатлениях, поэтому только creator-тарифы их публикуют.
 */
export function canUserCreate(
  userAccess: UserAccess,
  kind: "location" | "service" | "experience"
): boolean {
  if (userAccess.isAdmin) return true;

  if (kind === "location") {
    // Сохраняем текущее поведение: публиковать локации может любой платный.
    return userAccess.hasPremium === true;
  }

  if (kind === "service") {
    return userAccess.plan === "creator_service" || userAccess.plan === "creator_all";
  }

  if (kind === "experience") {
    return userAccess.plan === "creator_experience" || userAccess.plan === "creator_all";
  }

  return false;
}

/**
 * Какой минимальный тариф нужен для публикации kind'а.
 * Полезно в пейволле, чтобы предложить апгрейд.
 */
export function requiredPlanFor(
  kind: "location" | "service" | "experience"
): Plan {
  if (kind === "location") return "premium_viewer";
  if (kind === "service") return "creator_service";
  return "creator_experience";
}

/**
 * Право публиковать карточку с НЕСКОЛЬКИМИ kind'ами одновременно
 * (мульти-формат: например, локация + сервис в одной карточке).
 *
 * Принимает union — primary kind + secondary_kinds. Возвращает true, только
 * если у юзера есть права на КАЖДЫЙ из выбранных kind'ов.
 *
 * Used by BecomeProviderModal/wizard и серверной валидацией перед публикацией.
 *
 * Пустой массив трактуется как «нет требований» → true (defensive, не должно
 * случаться в реальном flow).
 */
export function canUserCreateMulti(
  userAccess: UserAccess,
  kinds: Array<"location" | "service" | "experience">
): boolean {
  if (userAccess.isAdmin) return true;
  if (kinds.length === 0) return true;

  // Все kind'ы должны быть доступны на текущем плане одновременно.
  return kinds.every((k) => canUserCreate(userAccess, k));
}

/**
 * Подсчёт квоты с учётом текущих карточек юзера и докупленных слотов.
 *
 *   activeServices, activeExperiences — текущие НЕ-удалённые карточки юзера
 *   данного kind'а (с учётом скрытых черновиков).
 *
 * Возвращает:
 *   - allowed: можно ли создать ещё одну карточку
 *   - limit: общий лимит (план + бонусные слоты), null = безлимит
 *   - used: сколько уже занято (с учётом combined-pool у Pro All)
 *   - reason: 'no_plan' | 'limit_reached' | 'ok'
 */
export type QuotaCheck = {
  allowed: boolean;
  limit: number | null;
  used: number;
  bonusCredits: number;
  reason: "ok" | "no_plan" | "limit_reached";
};

export function checkQuota(
  access: UserAccess,
  kind: "service" | "experience",
  activeServices: number,
  activeExperiences: number,
  bonusCredits: number = 0
): QuotaCheck {
  if (access.isAdmin) {
    return { allowed: true, limit: null, used: 0, bonusCredits, reason: "ok" };
  }

  const plan = access.plan;
  // Pro All — общий пул. Иначе считаем по конкретному kind'у.
  // Эта логика дублирует quotaFor() из plans.ts, но избегаем циклической зависимости:
  //   plans.ts ← access.ts уже импортирует её обратно, не хочется.
  let baseLimit: number;
  let used: number;

  if (plan === "creator_all") {
    baseLimit = 10;
    used = activeServices + activeExperiences;
  } else if (plan === "creator_service" && kind === "service") {
    baseLimit = 5;
    used = activeServices;
  } else if (plan === "creator_experience" && kind === "experience") {
    baseLimit = 5;
    used = activeExperiences;
  } else {
    // План не позволяет создавать этот kind вообще
    return { allowed: false, limit: 0, used: 0, bonusCredits, reason: "no_plan" };
  }

  const totalLimit = baseLimit + bonusCredits;

  if (used >= totalLimit) {
    return {
      allowed: false,
      limit: totalLimit,
      used,
      bonusCredits,
      reason: "limit_reached",
    };
  }

  return { allowed: true, limit: totalLimit, used, bonusCredits, reason: "ok" };
}

/**
 * Checks if user can add premium places
 * 
 * @param userAccess - User's access level
 * @returns true if user can add premium places
 */
export function canUserAddPremiumPlace(userAccess: UserAccess): boolean {
  // Only premium users and admins can add premium places
  return userAccess.role === "premium" || userAccess.role === "admin";
}

/**
 * Checks if user has admin privileges
 * 
 * @param userAccess - User's access level
 * @returns true if user is admin
 */
export function isUserAdmin(userAccess: UserAccess): boolean {
  return userAccess.role === "admin";
}
