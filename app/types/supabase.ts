/**
 * Generated TypeScript types from Supabase database
 * 
 * To regenerate these types:
 * 
 * Option 1: Using Supabase CLI (recommended)
 *   supabase gen types typescript --linked > app/types/supabase.ts
 * 
 * Option 2: Manual generation
 *   1. Go to Supabase Dashboard → Settings → API
 *   2. Scroll to "TypeScript types"
 *   3. Copy the generated types here
 * 
 * Option 3: Using Supabase CLI with project ref
 *   supabase gen types typescript --project-id your-project-ref > app/types/supabase.ts
 * 
 * NOTE: This file is a placeholder. Run the command above to generate actual types.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Тип карточки в Maporia.
 * - location: классическое место на карте (бар, видовая, парк).
 * - service: услуга (массаж, фотограф, инструктор, химчистка). Цена обязательна.
 * - experience: впечатление в стиле Airbnb Experiences (тур, мастер-класс, экскурсия).
 *   Цена + длительность + расписание/даты.
 */
export type PlaceKind = 'location' | 'service' | 'experience';

export const PLACE_KINDS: PlaceKind[] = ['location', 'service', 'experience'];

export type PriceUnit =
  | 'fixed'
  | 'from'
  | 'per_hour'
  | 'per_person'
  | 'per_day'
  | 'per_session';

/**
 * Гибкое расписание / даты для services и experiences.
 * Намеренно `Json` (jsonb в БД), но с подсказкой по форме:
 *   { type: 'weekly', days: ['mon','tue'], from: '10:00', to: '18:00' }
 *   { type: 'dates',  dates: ['2026-06-01','2026-06-08'] }
 *   { type: 'on_request' }
 */
export type PlaceSchedule = Json;

export interface Database {
  public: {
    Tables: {
      // TODO: Generate actual types from database
      // This is a placeholder structure
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          bio: string | null
          avatar_url: string | null
          role: string | null
          subscription_status: string | null
          is_admin: boolean | null
          created_at: string
          updated_at: string | null
          favorite_categories: string[] | null
          favorite_tags: string[] | null
        }
        Insert: {
          id: string
          username?: string | null
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          role?: string | null
          subscription_status?: string | null
          is_admin?: boolean | null
          created_at?: string
          updated_at?: string | null
          favorite_categories?: string[] | null
          favorite_tags?: string[] | null
        }
        Update: {
          id?: string
          username?: string | null
          display_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          role?: string | null
          subscription_status?: string | null
          is_admin?: boolean | null
          created_at?: string
          updated_at?: string | null
          favorite_categories?: string[] | null
          favorite_tags?: string[] | null
        }
      }
      places: {
        Row: {
          id: string
          title: string
          description: string | null
          address: string | null
          city: string | null
          city_id: string | null
          city_name_cached: string | null
          country: string | null
          cover_url: string | null
          photo_urls: string[] | null
          video_url: string | null
          categories: string[] | null
          tags: string[] | null
          link: string | null
          phone: string | null
          website: string | null
          instagram: string | null
          youtube: string | null
          telegram: string | null
          created_by: string | null
          created_at: string
          updated_at: string | null
          lat: number | null
          lng: number | null
          access_level: string | null
          is_premium: boolean | null
          premium_only: boolean | null
          visibility: string | null
          comments_enabled: boolean | null
          google_place_id: string | null
          is_hidden: boolean | null
          kind: PlaceKind
          /** Дополнительные kind'ы; не пересекаются с primary `kind`. См. add_secondary_kinds_to_places. */
          secondary_kinds: PlaceKind[]
          price_amount: number | null
          price_currency: string | null
          price_unit: PriceUnit | null
          duration_minutes: number | null
          schedule: PlaceSchedule | null
          host_qualification: string | null
          service_mode: 'at_provider' | 'at_client' | 'online' | 'flexible' | null
          max_guests: number | null
          min_guests: number | null
          meeting_point: string | null
          cancellation_policy: 'flexible' | 'moderate' | 'strict' | 'non_refundable' | 'custom' | null
          included_items: string[] | null
          bring_items: string[] | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          address?: string | null
          city?: string | null
          city_id?: string | null
          city_name_cached?: string | null
          country?: string | null
          cover_url?: string | null
          photo_urls?: string[] | null
          video_url?: string | null
          categories?: string[] | null
          tags?: string[] | null
          link?: string | null
          phone?: string | null
          website?: string | null
          instagram?: string | null
          youtube?: string | null
          telegram?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string | null
          lat?: number | null
          lng?: number | null
          access_level?: string | null
          is_premium?: boolean | null
          premium_only?: boolean | null
          visibility?: string | null
          comments_enabled?: boolean | null
          google_place_id?: string | null
          is_hidden?: boolean | null
          kind?: PlaceKind
          secondary_kinds?: PlaceKind[]
          price_amount?: number | null
          price_currency?: string | null
          price_unit?: PriceUnit | null
          duration_minutes?: number | null
          schedule?: PlaceSchedule | null
          host_qualification?: string | null
          service_mode?: 'at_provider' | 'at_client' | 'online' | 'flexible' | null
          max_guests?: number | null
          min_guests?: number | null
          meeting_point?: string | null
          cancellation_policy?: 'flexible' | 'moderate' | 'strict' | 'non_refundable' | 'custom' | null
          included_items?: string[] | null
          bring_items?: string[] | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          address?: string | null
          city?: string | null
          city_id?: string | null
          city_name_cached?: string | null
          country?: string | null
          cover_url?: string | null
          photo_urls?: string[] | null
          video_url?: string | null
          categories?: string[] | null
          tags?: string[] | null
          link?: string | null
          phone?: string | null
          website?: string | null
          instagram?: string | null
          youtube?: string | null
          telegram?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string | null
          lat?: number | null
          lng?: number | null
          access_level?: string | null
          is_premium?: boolean | null
          premium_only?: boolean | null
          visibility?: string | null
          comments_enabled?: boolean | null
          google_place_id?: string | null
          is_hidden?: boolean | null
          kind?: PlaceKind
          secondary_kinds?: PlaceKind[]
          price_amount?: number | null
          price_currency?: string | null
          price_unit?: PriceUnit | null
          duration_minutes?: number | null
          schedule?: PlaceSchedule | null
          host_qualification?: string | null
          service_mode?: 'at_provider' | 'at_client' | 'online' | 'flexible' | null
          max_guests?: number | null
          min_guests?: number | null
          meeting_point?: string | null
          cancellation_policy?: 'flexible' | 'moderate' | 'strict' | 'non_refundable' | 'custom' | null
          included_items?: string[] | null
          bring_items?: string[] | null
        }
      }
      reactions: {
        Row: { id?: string; place_id: string; user_id: string; reaction: string; created_at?: string }
        Insert: { place_id: string; user_id: string; reaction: string }
        Update: { place_id?: string; user_id?: string; reaction?: string }
      }
      comments: {
        Row: { id: string; place_id: string; user_id: string; text: string; rating: number | null; created_at: string; user_display_name?: string | null; user_username?: string | null; user_avatar_url?: string | null }
        Insert: { place_id: string; user_id: string; text: string; rating?: number | null }
        Update: { place_id?: string; user_id?: string; text?: string; rating?: number | null }
      }
      place_photos: {
        Row: { id: string; place_id: string; user_id: string; url: string; sort: number; is_cover: boolean; created_at?: string }
        Insert: { place_id: string; user_id: string; url: string; sort: number; is_cover: boolean }
        Update: { place_id?: string; user_id?: string; url?: string; sort?: number; is_cover?: boolean }
      }
      app_settings: {
        Row: { id: string; settings: Json | null }
        Insert: { id: string; settings?: Json | null }
        Update: { id?: string; settings?: Json | null }
      }
      cities: {
        Row: { id: string; name: string | null }
        Insert: { id?: string; name?: string | null }
        Update: { id?: string; name?: string | null }
      }
      tags: {
        Row: { id: string; name: string | null; emoji: string | null; category_ids: string[] | null }
        Insert: { id?: string; name?: string | null; emoji?: string | null; category_ids?: string[] | null }
        Update: { id?: string; name?: string | null; emoji?: string | null; category_ids?: string[] | null }
      }
      collections: {
        Row: {
          id: string
          title: string
          description: string | null
          cover_image: string | null
          access_type: "free" | "premium"
          is_active: boolean
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          cover_image?: string | null
          access_type?: "free" | "premium"
          is_active?: boolean
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          cover_image?: string | null
          access_type?: "free" | "premium"
          is_active?: boolean
          created_at?: string
          updated_at?: string | null
        }
      }
      place_collections: {
        Row: {
          id: string
          place_id: string
          collection_id: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          place_id: string
          collection_id: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          place_id?: string
          collection_id?: string
          sort_order?: number
          created_at?: string
        }
      }
      admin_impersonation_log: {
        Row: {
          id: string
          admin_id: string
          target_id: string
          started_at: string
          ended_at: string | null
          ip: string | null
          user_agent: string | null
          reason: string | null
        }
        Insert: {
          id?: string
          admin_id: string
          target_id: string
          started_at?: string
          ended_at?: string | null
          ip?: string | null
          user_agent?: string | null
          reason?: string | null
        }
        Update: {
          id?: string
          admin_id?: string
          target_id?: string
          started_at?: string
          ended_at?: string | null
          ip?: string | null
          user_agent?: string | null
          reason?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_or_create_city: {
        Args: {
          p_name: string
          p_state?: string | null
          p_country?: string | null
          p_lat?: number | null
          p_lng?: number | null
        }
        Returns: string
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      has_premium_access: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      update_premium_modal_settings: {
        Args: {
          p_settings: Json
          p_updated_by: string
        }
        Returns: Json
      }
    }
    Enums: {
      collection_access_type: "free" | "premium"
    }
  }
}
