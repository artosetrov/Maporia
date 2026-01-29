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
  google_opening_hours?: any | null; // JSONB
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  // User interests for recommendations
  favorite_categories?: string[] | null;
  favorite_tags?: string[] | null;
};

/**
 * Place from the places table
 */
export type Place = {
  id: string;
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
  // For draft state in wizard
  accessLevel?: AccessLevel;
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
