import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAiPrompt,
  callOpenAiForDescription,
  fetchGooglePlaceAiContext,
} from "../../../lib/ai/placeDescription";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// Use service role key if available for bypassing RLS (or use user token)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function hasPremiumAccessFromProfile(profile: {
  role?: string | null;
  subscription_status?: string | null;
  is_admin?: boolean | null;
} | null): boolean {
  if (!profile) return false;
  if (profile.is_admin) return true;
  if (profile.role === "admin" || profile.role === "premium") return true;
  if (profile.subscription_status === "active") return true;
  return false;
}

async function resolveCityId(
  supabase: ReturnType<typeof createClient>,
  args: {
    name: string;
    state?: string | null;
    country?: string | null;
    lat?: number | null;
    lng?: number | null;
  }
): Promise<{ city_id: string; name: string } | null> {
  const name = args.name?.trim();
  if (!name) return null;

  const { data: cityId, error: rpcError } = await supabase.rpc("get_or_create_city", {
    p_name: name,
    p_state: args.state || null,
    p_country: args.country || null,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
  });

  if (rpcError || !cityId) {
    console.error("Failed to resolve city via get_or_create_city:", rpcError);
    return null;
  }

  // Best-effort fetch for canonical city name
  const { data: cityRow } = await supabase
    .from("cities")
    .select("id, name")
    .eq("id", cityId)
    .single();

  return { city_id: (cityRow as any)?.id || cityId, name: (cityRow as any)?.name || name };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      google_place_id,
      target_place_id,
      selectedFields,
      access_token 
    } = body;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration is missing", code: "MISSING_SUPABASE_CONFIG" },
        { status: 500 }
      );
    }

    if (!google_place_id || typeof google_place_id !== "string") {
      return NextResponse.json(
        { error: "Invalid request: google_place_id is required" },
        { status: 400 }
      );
    }

    if (!selectedFields || typeof selectedFields !== "object") {
      return NextResponse.json(
        { error: "Invalid request: selectedFields is required" },
        { status: 400 }
      );
    }

    // Authenticate user first
    let user = null;
    if (!access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create Supabase client with anon key for user verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify user authentication
    const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(access_token);
    if (authError || !authUser) {
      console.error("Authentication error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = authUser;

    // Check if we're using service role key (must be checked before creating client)
    const isUsingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!isUsingServiceRole) {
      console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY not set. Using anon key - RLS policies will apply.");
      console.warn("⚠️ This may cause RLS policy violations. Please set SUPABASE_SERVICE_ROLE_KEY in .env.local");
    }

    // Create Supabase client with service role key for database operations
    // This bypasses RLS, but we've already verified the user is authenticated
    // Note: We ALSO check premium access server-side for security.
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Server-side access check (defense-in-depth)
    let isAdmin = false;
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, subscription_status, is_admin")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Failed to load profile for access check:", profileError);
        // If service role is misconfigured, this will likely fail — surface a helpful error.
        if (!isUsingServiceRole) {
          return NextResponse.json(
            {
              error:
                "Server is missing SUPABASE_SERVICE_ROLE_KEY. Cannot verify permissions to create a place.",
              code: "MISSING_SERVICE_ROLE_KEY",
            },
            { status: 500 }
          );
        }
      } else {
        isAdmin = !!(profile as any)?.is_admin || (profile as any)?.role === "admin";
        const ok = hasPremiumAccessFromProfile(profile as any);
        if (!ok) {
          return NextResponse.json(
            {
              error: "Premium required to create places.",
              code: "PREMIUM_REQUIRED",
            },
            { status: 403 }
          );
        }
      }
    } catch (e) {
      console.error("Access check exception:", e);
    }

    // If we're importing into an existing place, update it instead of creating a new one
    if (target_place_id && typeof target_place_id === "string") {
      const targetPlaceId = target_place_id;

      // Load target place to verify ownership (unless admin)
      const { data: targetPlace, error: targetPlaceError } = await supabase
        .from("places")
        .select("id, created_by, description")
        .eq("id", targetPlaceId)
        .single();

      if (targetPlaceError || !targetPlace) {
        return NextResponse.json(
          { error: "Target place not found", code: "TARGET_PLACE_NOT_FOUND" },
          { status: 404 }
        );
      }

      const isOwner = targetPlace.created_by === user.id;
      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "Forbidden", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      // If google_place_id already exists for another place, return duplicate
      const { data: existingByGoogleId, error: existingByGoogleIdError } = await supabase
        .from("places")
        .select("id, title")
        .eq("google_place_id", google_place_id)
        .neq("id", targetPlaceId)
        .single();

      if (existingByGoogleIdError && existingByGoogleIdError.code !== "PGRST116") {
        console.error("Error checking google_place_id duplicate:", existingByGoogleIdError);
        return NextResponse.json(
          { error: "Failed to check for duplicate place", code: "DUPLICATE_CHECK_ERROR" },
          { status: 500 }
        );
      }

      if (existingByGoogleId) {
        return NextResponse.json(
          {
            error: "Place already exists",
            code: "DUPLICATE_PLACE",
            existing_place_id: existingByGoogleId.id,
            existing_title: existingByGoogleId.title,
          },
          { status: 409 }
        );
      }

      // Build update payload (only selected fields + always-included ones)
      const updates: any = {
        google_place_id,
      };

      // Selected fields
      if (selectedFields?.title && selectedFields?.titleData) updates.title = selectedFields.titleData;
      if (selectedFields?.address && selectedFields?.addressData) updates.address = selectedFields.addressData;
      if (selectedFields?.description && selectedFields?.descriptionData) updates.description = selectedFields.descriptionData;

      // Always include coordinates and google_maps_url
      if (selectedFields?.lat !== null && selectedFields?.lat !== undefined) updates.lat = Number(selectedFields.lat);
      if (selectedFields?.lng !== null && selectedFields?.lng !== undefined) updates.lng = Number(selectedFields.lng);
      if (selectedFields?.google_maps_url) updates.link = selectedFields.google_maps_url;

      // City auto-fill for Location page (if available from Google response)
      if (selectedFields?.city && typeof selectedFields.city === "string" && selectedFields.city.trim().length > 0) {
        const resolved = await resolveCityId(supabase, {
          name: selectedFields.city,
          state: selectedFields.city_state || null,
          country: selectedFields.city_country || null,
          lat: updates.lat ?? selectedFields.lat ?? null,
          lng: updates.lng ?? selectedFields.lng ?? null,
        });
        if (resolved) {
          updates.city = resolved.name; // legacy
          updates.city_name_cached = resolved.name;
          updates.city_id = resolved.city_id;
        } else {
          // fallback: at least save city string
          updates.city = selectedFields.city.trim();
          updates.city_name_cached = selectedFields.city.trim();
        }
      }

      // If user didn't select title but it's empty, still set a safe placeholder to satisfy NOT NULL if needed
      if (!updates.title) {
        // no-op: do not overwrite existing title unless needed
      }

      // Apply updates
      const { data: updatedPlace, error: updateError } = await supabase
        .from("places")
        .update(updates)
        .eq("id", targetPlaceId)
        .select("id")
        .single();

      if (updateError || !updatedPlace) {
        console.error("Error updating place from import:", updateError);
        return NextResponse.json(
          { error: "Failed to update place", details: updateError?.message, code: "UPDATE_ERROR" },
          { status: 500 }
        );
      }

      // Replace photos if provided
      if (Array.isArray(selectedFields?.photos)) {
        const photos = selectedFields.photos
          .filter((p: any) => p && typeof p.url === "string" && p.url.length > 0)
          .map((p: any) => p.url);

        // If user selected photos, replace Photo tour
        if (photos.length > 0) {
          const { error: deletePhotosError } = await supabase
            .from("place_photos")
            .delete()
            .eq("place_id", targetPlaceId);

          if (deletePhotosError) {
            console.error("Failed to clear existing place photos:", deletePhotosError);
          }

          const photoInserts = photos.map((url: string, index: number) => ({
            place_id: targetPlaceId,
            user_id: user.id,
            url,
            sort: index,
            is_cover: index === 0,
          }));

          const { error: insertPhotosError } = await supabase
            .from("place_photos")
            .insert(photoInserts);

          if (insertPhotosError) {
            console.error("Failed to insert imported photos:", insertPhotosError);
          } else {
            // Keep legacy cover_url in sync for older parts of the app
            await supabase
              .from("places")
              .update({ cover_url: photos[0] })
              .eq("id", targetPlaceId);
          }
        }
      }

      // Auto-generate AI description after import (best-effort, don't overwrite existing)
      const importedDescription =
        !!(selectedFields?.description && selectedFields?.descriptionData && String(selectedFields.descriptionData).trim().length > 0);
      const hasExistingDescription =
        !!(targetPlace as any)?.description && String((targetPlace as any).description).trim().length > 0;

      if (!importedDescription && !hasExistingDescription) {
        try {
          const openAiApiKey = process.env.OPENAI_API_KEY;
          const googleApiKey =
            process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

          if (openAiApiKey && googleApiKey) {
            const ctx = await fetchGooglePlaceAiContext({ googleApiKey, googlePlaceId: google_place_id });
            const prompt = buildAiPrompt(ctx);
            const model = process.env.OPENAI_MODEL || "gpt-4.1";
            const aiText = await callOpenAiForDescription({ openAiApiKey, model, prompt });
            await supabase.from("places").update({ description: aiText }).eq("id", targetPlaceId);
          }
        } catch (e) {
          console.warn("AI description generation failed (non-fatal):", e);
        }
      }

      return NextResponse.json({ place_id: targetPlaceId, success: true, updated: true });
    }

    // Check for duplicate place by google_place_id
    const { data: existingPlace, error: checkError } = await supabase
      .from("places")
      .select("id, title")
      .eq("google_place_id", google_place_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("Error checking for duplicate:", checkError);
      return NextResponse.json(
        { error: "Failed to check for duplicate place" },
        { status: 500 }
      );
    }

    if (existingPlace) {
      return NextResponse.json(
        { 
          error: "Place already exists",
          code: "DUPLICATE_PLACE",
          existing_place_id: existingPlace.id,
          existing_title: existingPlace.title,
        },
        { status: 409 }
      );
    }

    // Build place data from selected fields
    const placeData: any = {
      created_by: user.id,
      google_place_id: google_place_id,
      // Match Add Gem defaults so the editor shows imported data but keeps it hidden until completed
      access_level: "public",
      is_hidden: true,
    };

    // Add status field only if it exists in the database
    // Check if status column exists by trying to set it (will fail gracefully if column doesn't exist)
    // For now, we'll try to add it, but handle the error if column doesn't exist
    try {
      // Try to add status field - if column doesn't exist, this will be ignored
      placeData.status = "draft";
    } catch {
      // Status column doesn't exist, continue without it
    }

    // Add selected fields
    if (selectedFields.title && selectedFields.titleData) {
      placeData.title = selectedFields.titleData;
    }

    if (selectedFields.address && selectedFields.addressData) {
      placeData.address = selectedFields.addressData;
    }

    if (selectedFields.description && selectedFields.descriptionData) {
      placeData.description = selectedFields.descriptionData;
    }

    // Always include coordinates and google_maps_url
    if (selectedFields.lat !== null && selectedFields.lat !== undefined) {
      placeData.lat = Number(selectedFields.lat);
    }

    if (selectedFields.lng !== null && selectedFields.lng !== undefined) {
      placeData.lng = Number(selectedFields.lng);
    }

    if (selectedFields.google_maps_url) {
      placeData.link = selectedFields.google_maps_url; // Using link field for google_maps_url
    }

    // City auto-fill for Location page (if provided)
    if (selectedFields.city && typeof selectedFields.city === "string" && selectedFields.city.trim().length > 0) {
      const resolved = await resolveCityId(supabase, {
        name: selectedFields.city,
        state: selectedFields.city_state || null,
        country: selectedFields.city_country || null,
        lat: placeData.lat ?? null,
        lng: placeData.lng ?? null,
      });
      if (resolved) {
        placeData.city = resolved.name; // legacy
        placeData.city_name_cached = resolved.name;
        placeData.city_id = resolved.city_id;
      } else {
        placeData.city = selectedFields.city.trim();
        placeData.city_name_cached = selectedFields.city.trim();
      }
    }

    // Ensure title exists (required field)
    if (!placeData.title) {
      placeData.title = "Untitled Place";
    }

    // Insert place
    console.log("Inserting place with data:", {
      hasTitle: !!placeData.title,
      hasAddress: !!placeData.address,
      hasCoords: !!(placeData.lat && placeData.lng),
      hasGooglePlaceId: !!placeData.google_place_id,
      hasStatus: !!placeData.status,
      userId: user.id,
    });

    const { data: newPlace, error: insertError } = await supabase
      .from("places")
      .insert(placeData)
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting place:", {
        error: insertError,
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        isUsingServiceRole,
        placeData: {
          ...placeData,
          created_by: "[REDACTED]",
        },
      });

      // Handle RLS policy violation
      if (insertError.code === "42501" || insertError.message?.includes("row-level security")) {
        if (!isUsingServiceRole) {
          return NextResponse.json(
            { 
              error: "Failed to create place due to security policy. Please ensure SUPABASE_SERVICE_ROLE_KEY is set in environment variables.",
              details: insertError.message,
              code: "RLS_POLICY_VIOLATION"
            },
            { status: 500 }
          );
        }
        // Even with service role, RLS might still apply - this shouldn't happen but handle it
        return NextResponse.json(
          { 
            error: "Failed to create place due to security policy violation.",
            details: insertError.message,
            code: "RLS_POLICY_VIOLATION"
          },
          { status: 500 }
        );
      }

      // Handle specific database errors
      if (insertError.code === "42703") {
        // Column doesn't exist (e.g., status column)
        // Try again without status field
        delete placeData.status;
        const { data: retryPlace, error: retryError } = await supabase
          .from("places")
          .insert(placeData)
          .select("id")
          .single();

        if (retryError) {
          return NextResponse.json(
            { 
              error: "Failed to create place", 
              details: retryError.message,
              code: "INSERT_ERROR"
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          place_id: retryPlace.id,
          success: true,
        });
      }

      return NextResponse.json(
        { 
          error: "Failed to create place", 
          details: insertError.message,
          code: insertError.code || "INSERT_ERROR"
        },
        { status: 500 }
      );
    }

    // Handle photos if selected
    if (selectedFields.photos && Array.isArray(selectedFields.photos) && selectedFields.photos.length > 0) {
      console.log("Inserting photos:", {
        photoCount: selectedFields.photos.length,
        placeId: newPlace.id,
      });

      // Filter out invalid photos and map to insert format
      const photoInserts = selectedFields.photos
        .filter((photo: any) => photo && photo.url && typeof photo.url === 'string')
        .map((photo: any, index: number) => ({
          place_id: newPlace.id,
          user_id: user.id,
          url: photo.url,
          sort: index,
          is_cover: index === 0, // First photo is cover
        }));

      console.log("Photo inserts prepared:", {
        count: photoInserts.length,
        urls: photoInserts.map(p => p.url.substring(0, 50)),
      });

      if (photoInserts.length > 0) {
        const { data: insertedPhotos, error: photosError } = await supabase
          .from("place_photos")
          .insert(photoInserts)
          .select("id, url");

        if (photosError) {
          console.error("Error inserting photos:", photosError);
          // Don't fail the request if photos fail, just log it
        } else {
          console.log("Successfully inserted photos:", {
            count: insertedPhotos?.length || 0,
            photoIds: insertedPhotos?.map(p => p.id),
          });
        }
      }
    } else {
      console.log("No photos to insert");
    }

    console.log("Import completed successfully:", {
      placeId: newPlace.id,
      hasTitle: !!placeData.title,
      hasAddress: !!placeData.address,
      hasDescription: !!placeData.description,
      hasCoords: !!(placeData.lat && placeData.lng),
      photoCount: selectedFields.photos?.length || 0,
    });

    // Auto-generate AI description after import (best-effort, only if user didn't import description)
    const importedDescription =
      !!(selectedFields?.description && selectedFields?.descriptionData && String(selectedFields.descriptionData).trim().length > 0);

    if (!importedDescription) {
      try {
        const openAiApiKey = process.env.OPENAI_API_KEY;
        const googleApiKey =
          process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

        if (openAiApiKey && googleApiKey) {
          const ctx = await fetchGooglePlaceAiContext({ googleApiKey, googlePlaceId: google_place_id });
          const prompt = buildAiPrompt(ctx);
          const model = process.env.OPENAI_MODEL || "gpt-4.1";
          const aiText = await callOpenAiForDescription({ openAiApiKey, model, prompt });
          await supabase.from("places").update({ description: aiText }).eq("id", newPlace.id);
        }
      } catch (e) {
        console.warn("AI description generation failed (non-fatal):", e);
      }
    }

    return NextResponse.json({
      place_id: newPlace.id,
      success: true,
    });
  } catch (error: unknown) {
    console.error("Import error:", error);
    const message = error instanceof Error ? error.message : "Failed to import place";
    return NextResponse.json(
      { error: message, code: "IMPORT_ERROR" },
      { status: 500 }
    );
  }
}
