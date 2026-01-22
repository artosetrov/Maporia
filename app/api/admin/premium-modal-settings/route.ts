import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase configuration. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) are required.");
}

// Create admin client for server-side operations
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}) : null;

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get the auth token from the request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!profile.is_admin && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("settings")
      .eq("id", "premium_modal")
      .single();

    if (settingsError) {
      // Check if it's a "table doesn't exist" error
      if (settingsError.code === "PGRST116" || settingsError.message?.includes("does not exist")) {
        console.warn("app_settings table does not exist. Please run create-premium-modal-settings-table.sql");
      } else {
        console.error("Error fetching settings:", settingsError);
      }
      
      // If settings don't exist, return default values
      return NextResponse.json({
        settings: {
          title: "Unlock Maporia Premium",
          titleHighlight: "Maporia",
          subtitle: "Get full access to our hidden local gems — no crowds, no tourist traps. Just authentic experiences.",
          benefit1Title: "Premium-only places",
          benefit1Desc: "Exclusive access to local secrets and hidden spots.",
          benefit2Title: "Curated Collections",
          benefit2Desc: "Secret Spots, Romantic Sunsets, Hidden Cafés & more.",
          benefit3Title: "Custom Routes",
          benefit3Desc: "Save favorites and build your personal itinerary.",
          socialProof: "Discover places you'd never find on Google.",
          price: "$20",
          pricePeriod: "/ year",
          priceSubtext: "Less than $2 a month",
          priceRightTitle: "Full Access",
          priceRightDesc: "All premium places + collections",
          primaryButtonText: "Coming Soon",
          primaryButtonLink: "",
          secondaryButtonText: "Not now, thanks",
          footerText: "Cancel anytime. Premium features will unlock instantly when available.",
          footerLinkText: "Terms of Service apply.",
          footerLinkUrl: "#",
        },
      });
    }

    return NextResponse.json({ settings: settings.settings });
  } catch (error) {
    console.error("Error fetching premium modal settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Get the auth token from the request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!profile.is_admin && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get settings from request body
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Invalid settings data" },
        { status: 400 }
      );
    }

    // Use RPC function to update settings (bypasses RLS)
    // This function uses SECURITY DEFINER and will work even with anon key
    const { data: updatedSettings, error: rpcError } = await supabaseAdmin.rpc(
      'update_premium_modal_settings',
      {
        p_settings: settings,
        p_updated_by: user.id
      }
    );

    if (rpcError) {
      console.error("Error saving premium modal settings via RPC:", {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      });
      
      // Fallback: try direct upsert if RPC function doesn't exist
      if (rpcError.code === "42883" || rpcError.message?.includes("does not exist")) {
        console.warn("RPC function not found, trying direct upsert...");
        
        // Check if we're using service role key (needed to bypass RLS)
        const isUsingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!isUsingServiceRole) {
          return NextResponse.json(
            { 
              error: "Database function not found. Please run create-premium-modal-settings-table.sql in Supabase SQL Editor. Also ensure SUPABASE_SERVICE_ROLE_KEY is set.",
              code: "FUNCTION_NOT_FOUND"
            },
            { status: 500 }
          );
        }

        // Try direct upsert with service role key
        const { data, error: upsertError } = await supabaseAdmin
          .from("app_settings")
          .upsert(
            {
              id: "premium_modal",
              settings: settings,
              updated_at: new Date().toISOString(),
              updated_by: user.id,
            },
            {
              onConflict: "id",
            }
          )
          .select()
          .single();

        if (upsertError) {
          console.error("Error saving premium modal settings (direct upsert):", {
            code: upsertError.code,
            message: upsertError.message,
            details: upsertError.details,
            hint: upsertError.hint,
          });
          
          // Check if it's a "table doesn't exist" error
          if (upsertError.code === "PGRST116" || upsertError.message?.includes("does not exist")) {
            return NextResponse.json(
              { 
                error: "Database table not found. Please run create-premium-modal-settings-table.sql in Supabase SQL Editor.",
                code: "TABLE_NOT_FOUND"
              },
              { status: 500 }
            );
          }
          
          // Check if it's an RLS policy violation
          if (upsertError.code === "42501" || upsertError.message?.includes("row-level security") || upsertError.message?.includes("violates row-level security")) {
            return NextResponse.json(
              { 
                error: "Permission denied. Please run create-premium-modal-settings-table.sql to create the update function, or ensure SUPABASE_SERVICE_ROLE_KEY is set correctly.",
                code: "RLS_VIOLATION",
                details: upsertError.message
              },
              { status: 500 }
            );
          }
          
          return NextResponse.json(
            { 
              error: "Failed to save settings",
              details: upsertError.message || "Unknown error",
              code: upsertError.code
            },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true, settings: data.settings });
      }
      
      return NextResponse.json(
        { 
          error: "Failed to save settings",
          details: rpcError.message || "Unknown error",
          code: rpcError.code
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error("Error saving premium modal settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
