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
          // Add other fields as needed
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
          categories: string[] | null
          tags: string[] | null
          link: string | null
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
          categories?: string[] | null
          tags?: string[] | null
          link?: string | null
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
          categories?: string[] | null
          tags?: string[] | null
          link?: string | null
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
        }
      }
      // Add other tables: cities, comments, reactions, place_photos, app_settings, etc.
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
      [_ in never]: never
    }
  }
}
