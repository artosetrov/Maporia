/**
 * Shared TypeScript types for Maporia
 */

import { UserRole, SubscriptionStatus, AccessLevel } from "./lib/access";

/**
 * User profile from the profiles table
 */
export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role?: UserRole | null;
  subscription_status?: SubscriptionStatus | null;
  is_admin?: boolean | null;
  created_at?: string;
  updated_at?: string;
  // Google Maps integration fields
  google_place_id?: string | null;
  google_maps_url?: string | null;
  google_rating?: number | null;
  google_reviews_count?: number | null;
  google_opening_hours?: unknown | null; // JSONB
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  // User interests for recommendations
  favorite_categories?: string[] | null;
  favorite_tags?: string[] | null;
  // Subscription / monetization
  plan?: Plan | null;
  plan_period?: PlanPeriod | null;
  plan_renews_at?: string | null;
  stripe_customer_id?: string | null;
  /** Докупленные слоты сверх квоты тарифа ($2.99 за каждую). */
  bonus_listing_credits?: number | null;
};

/**
 * Тарифы Maporia. Источник правды — `app/lib/pricing/registry.ts` (PlanId).
 * Этот файл просто реэкспортирует тип, чтобы старые импорты продолжали работать.
 *
 * v2 расширил union: добавились `creator_location` и `premium_grandfathered`.
 * См. docs/PRICING_V2_PLAN.md § 1.
 */
import type { PlanId } from "./lib/pricing/registry";
import type { PlacePageLayout } from "./config/placeLayout";

export type Plan = PlanId;

export type PlanPeriod = 'month' | 'year' | 'lifetime';

/** Тариф, который реально продаётся (free и internal не продаются). */
export type PaidPlan = Exclude<Plan, 'free' | 'premium_grandfathered'>;

/**
 * Любой creator-тариф — даёт право публиковать.
 * v3 (2026-05-11): creator_pro заменил creator_service+creator_experience.
 * Старые остаются в union — grandfathered активные подписчики.
 */
export type CreatorPlan =
  | 'creator_location'
  | 'creator_service'      // legacy v2 — grandfathered
  | 'creator_experience'   // legacy v2 — grandfathered
  | 'creator_pro'
  | 'creator_all';

/**
 * Place from the places table
 */
export type Place = {
  id: string;
  /** Stable public URL slug. `/slug` redirects to `/id/<id>` when present. */
  slug?: string | null;
  title: string;
  description?: string | null;
  address?: string | null;
  city?: string | null; // Legacy field, kept for backward compatibility
  city_id?: string | null; // Foreign key to cities table
  city_name_cached?: string | null; // Cached city name for display
  country?: string | null;
  cover_url?: string | null;
  photo_urls?: string[] | null;
  video_url?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  link?: string | null;
  /** Контактный телефон карточки. Используется в tel:. */
  phone?: string | null;
  /** URL сайта карточки. Отдельно от `link` (link — CTA для service/experience). */
  website?: string | null;
  /** Instagram: @username или полная ссылка. */
  instagram?: string | null;
  /** YouTube канал/ссылка. Не путать с `youtube_shorts_url` (контентный шортс). */
  youtube?: string | null;
  /** Telegram: @username или t.me/<handle>. */
  telegram?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  lat?: number | null;
  lng?: number | null;
  // Premium access fields (multiple for backward compatibility)
  access_level?: AccessLevel | string | null;
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
  // Google Maps integration
  google_place_id?: string | null;
  // Service / experience pricing
  price_amount?: number | null;
  price_currency?: string | null;
  price_unit?: string | null;
  price_options?: unknown | null;
  // For draft state in wizard
  accessLevel?: AccessLevel;
  /**
   * Дополнительные kind'ы помимо primary `kind` (смотри miграцию add_secondary_kinds_to_places).
   * Один листинг может одновременно быть локацией+сервисом или локацией+experience.
   * `kind` остаётся primary (определяет шаблон отображения через kind-router).
   * Quota: location считается только как primary kind; service/experience
   * считаются как primary OR secondary. См. docs/PRICING_V2_PLAN.md § 3.
   */
  secondary_kinds?: ('location' | 'service' | 'experience')[] | null;
  /**
   * Public detail page template. Defaults to `standard`; `story` is for
   * read/photo-led locations such as Devil's Tree.
   */
  place_page_layout?: PlacePageLayout | null;
};

/**
 * Place photo from place_photos table
 */
export type PlacePhoto = {
  id: string;
  place_id: string;
  url: string;
  sort: number;
  created_at?: string;
};

/**
 * Comment from comments table
 */
export type Comment = {
  id: string;
  place_id: string;
  user_id: string;
  text: string;
  created_at: string;
  // Joined fields
  user_display_name?: string | null;
  user_username?: string | null;
  user_avatar_url?: string | null;
};

/**
 * Reaction from reactions table
 */
export type Reaction = {
  id: string;
  place_id: string;
  user_id: string;
  reaction: "like" | "dislike" | string;
  created_at: string;
};

/**
 * Creator profile (subset of Profile for display)
 */
export type CreatorProfile = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

/**
 * Collection access type
 */
export type CollectionAccessType = "free" | "premium";

/**
 * Collection from collections table
 */
export type Collection = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  access_type: CollectionAccessType;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

/**
 * Place–collection join (place_collections table)
 */
export type PlaceCollection = {
  id: string;
  place_id: string;
  collection_id: string;
  sort_order: number;
  created_at?: string;
};

/**
 * Lightweight place type for list views (map, explore, home sections).
 * Contains only the fields needed for rendering cards and filtering.
 */
export type PlaceListItem = {
  id: string;
  slug?: string | null;
  title: string;
  description: string | null;
  city: string | null;
  city_name_cached?: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  created_by?: string | null;
  access_level?: string | null;
  // Optional fields used by some pages
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
  // Тип карточки (для маркеров на карте и фильтра)
  kind?: 'location' | 'service' | 'experience' | null;
  // Offer readiness fields used by home services/experiences.
  schedule?: unknown | null;
  service_mode?: 'at_provider' | 'at_client' | 'online' | 'flexible' | string | null;
  // Computed fields (added by some queries)
  commentsCount?: number;
  likesCount?: number;
};
