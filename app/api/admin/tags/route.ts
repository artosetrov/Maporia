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

async function checkAdminAccess(request: NextRequest): Promise<{ user: any; supabase: any } | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return null;
  }

  // Check if user is admin
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return null;
  }

  if (!profile.is_admin && profile.role !== "admin") {
    return null;
  }

  return { user, supabase: supabaseAdmin };
}

/**
 * GET /api/admin/tags
 * Get all unique tags from tags table (or fallback to places.tags if table doesn't exist)
 */
export async function GET(request: NextRequest) {
  try {
    const access = await checkAdminAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabase } = access;

    // Try to get tags from tags table first
    const { data: tagsData, error: tagsError } = await supabase
      .from("tags")
      .select("name")
      .order("name", { ascending: true });

    if (!tagsError && tagsData) {
      // Tags table exists, use it
      const sortedTags = tagsData
        .map((t) => t.name)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
      return NextResponse.json({ tags: sortedTags });
    }

    // Fallback: extract from places.tags (if tags table doesn't exist)
    console.warn("Tags table not found, falling back to places.tags extraction");
    const { data: places, error: placesError } = await supabase
      .from("places")
      .select("tags")
      .not("tags", "is", null);

    if (placesError) {
      console.error("Error fetching places for tags:", placesError);
      return NextResponse.json(
        { error: "Failed to fetch tags", details: placesError.message },
        { status: 500 }
      );
    }

    // Extract all unique tags
    const allTags = new Set<string>();
    if (places) {
      for (const place of places) {
        if (place.tags && Array.isArray(place.tags)) {
          for (const tag of place.tags) {
            if (typeof tag === "string" && tag.trim().length > 0) {
              allTags.add(tag.trim());
            }
          }
        }
      }
    }

    // Sort tags alphabetically
    const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ tags: sortedTags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tags
 * Create a new tag in tags table
 */
export async function POST(request: NextRequest) {
  try {
    const access = await checkAdminAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    const tagName = name.trim();

    // Try to insert into tags table first
    const { data: newTag, error: insertError } = await access.supabase
      .from("tags")
      .insert({ name: tagName })
      .select("id, name")
      .single();

    if (!insertError && newTag) {
      // Successfully created in tags table
      return NextResponse.json({ success: true, tag: newTag.name, id: newTag.id });
    }

    // If tags table doesn't exist (PGRST116 = no rows, 42P01 = table doesn't exist)
    if (insertError?.code === "PGRST116" || insertError?.code === "42P01" || insertError?.message?.includes("does not exist")) {
      console.warn("Tags table not found, tag will be created when added to a place");
      // Fallback: just validate that tag doesn't exist in places
      const { data: places } = await access.supabase
        .from("places")
        .select("tags")
        .not("tags", "is", null);

      const existingTags = new Set<string>();
      if (places) {
        for (const place of places) {
          if (place.tags && Array.isArray(place.tags)) {
            for (const tag of place.tags) {
              if (typeof tag === "string" && tag.trim().length > 0) {
                existingTags.add(tag.trim());
              }
            }
          }
        }
      }

      if (existingTags.has(tagName)) {
        return NextResponse.json(
          { error: "Tag already exists", code: "DUPLICATE_TAG" },
          { status: 409 }
        );
      }

      // Tag will be created when added to a place
      return NextResponse.json({ success: true, tag: tagName });
    }

    // Check for duplicate (unique constraint violation)
    if (insertError?.code === "23505" || insertError?.message?.includes("duplicate") || insertError?.message?.includes("unique")) {
      return NextResponse.json(
        { error: "Tag already exists", code: "DUPLICATE_TAG" },
        { status: 409 }
      );
    }

    // Other error
    return NextResponse.json(
      { error: "Failed to create tag", details: insertError?.message || "Unknown error" },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/tags
 * Update (rename) a tag across all places
 */
export async function PUT(request: NextRequest) {
  try {
    const access = await checkAdminAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { oldName, newName } = body;

    if (!oldName || typeof oldName !== "string" || oldName.trim().length === 0) {
      return NextResponse.json(
        { error: "Old tag name is required" },
        { status: 400 }
      );
    }

    if (!newName || typeof newName !== "string" || newName.trim().length === 0) {
      return NextResponse.json(
        { error: "New tag name is required" },
        { status: 400 }
      );
    }

    const oldTagName = oldName.trim();
    const newTagName = newName.trim();

    if (oldTagName === newTagName) {
      return NextResponse.json(
        { error: "Old and new tag names are the same" },
        { status: 400 }
      );
    }

    // Try to update in tags table first
    const { data: updatedTag, error: updateTagError } = await access.supabase
      .from("tags")
      .update({ name: newTagName })
      .eq("name", oldTagName)
      .select("id, name")
      .single();

    if (!updateTagError && updatedTag) {
      // Successfully updated in tags table, now update all places
      const { data: places } = await access.supabase
        .from("places")
        .select("id, tags")
        .not("tags", "is", null);

      let updatedCount = 0;
      if (places) {
        for (const place of places) {
          if (place.tags && Array.isArray(place.tags)) {
            const hasOldTag = place.tags.some(
              (tag) => typeof tag === "string" && tag.trim() === oldTagName
            );

            if (hasOldTag) {
              const updatedTags = place.tags.map((tag) =>
                typeof tag === "string" && tag.trim() === oldTagName ? newTagName : tag
              );

              const { error: updateError } = await access.supabase
                .from("places")
                .update({ tags: updatedTags })
                .eq("id", place.id);

              if (!updateError) {
                updatedCount++;
              }
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        updatedCount,
        oldTag: oldTagName,
        newTag: newTagName,
      });
    }

    // Fallback: tags table doesn't exist or old tag not found, use places-based logic
    if (updateTagError?.code === "PGRST116" || updateTagError?.code === "42P01" || updateTagError?.message?.includes("does not exist")) {
      console.warn("Tags table not found or tag not in table, using places-based update");
    } else if (updateTagError?.code === "PGRST116") {
      // Tag not found in tags table, but table exists - check if it exists in places
    } else {
      // Check if new tag already exists
      const { data: existingNewTag } = await access.supabase
        .from("tags")
        .select("name")
        .eq("name", newTagName)
        .single();

      if (existingNewTag) {
        return NextResponse.json(
          { error: "New tag name already exists", code: "DUPLICATE_TAG" },
          { status: 409 }
        );
      }
    }

    // Update all places that have the old tag
    const { data: places, error: checkError } = await access.supabase
      .from("places")
      .select("id, tags")
      .not("tags", "is", null);

    if (checkError) {
      return NextResponse.json(
        { error: "Failed to check tags", details: checkError.message },
        { status: 500 }
      );
    }

    const existingTags = new Set<string>();
    if (places) {
      for (const place of places) {
        if (place.tags && Array.isArray(place.tags)) {
          for (const tag of place.tags) {
            if (typeof tag === "string" && tag.trim().length > 0) {
              existingTags.add(tag.trim());
            }
          }
        }
      }
    }

    if (existingTags.has(newTagName)) {
      return NextResponse.json(
        { error: "New tag name already exists", code: "DUPLICATE_TAG" },
        { status: 409 }
      );
    }

    let updatedCount = 0;
    if (places) {
      for (const place of places) {
        if (place.tags && Array.isArray(place.tags)) {
          const hasOldTag = place.tags.some(
            (tag) => typeof tag === "string" && tag.trim() === oldTagName
          );

          if (hasOldTag) {
            const updatedTags = place.tags.map((tag) =>
              typeof tag === "string" && tag.trim() === oldTagName ? newTagName : tag
            );

            const { error: updateError } = await access.supabase
              .from("places")
              .update({ tags: updatedTags })
              .eq("id", place.id);

            if (!updateError) {
              updatedCount++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      oldTag: oldTagName,
      newTag: newTagName,
    });
  } catch (error) {
    console.error("Error updating tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tags
 * Delete a tag from all places
 */
export async function DELETE(request: NextRequest) {
  try {
    const access = await checkAdminAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tagName = searchParams.get("name");

    if (!tagName || tagName.trim().length === 0) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    const tagToDelete = tagName.trim();

    // Try to delete from tags table first
    const { error: deleteTagError } = await access.supabase
      .from("tags")
      .delete()
      .eq("name", tagToDelete);

    // Get all places that have this tag
    const { data: places, error: placesError } = await access.supabase
      .from("places")
      .select("id, tags")
      .not("tags", "is", null);

    if (placesError) {
      return NextResponse.json(
        { error: "Failed to fetch places", details: placesError.message },
        { status: 500 }
      );
    }

    // Remove tag from all places
    let deletedCount = 0;
    if (places) {
      for (const place of places) {
        if (place.tags && Array.isArray(place.tags)) {
          const hasTag = place.tags.some(
            (tag) => typeof tag === "string" && tag.trim() === tagToDelete
          );

          if (hasTag) {
            // Remove the tag
            const updatedTags = place.tags.filter(
              (tag) => typeof tag !== "string" || tag.trim() !== tagToDelete
            );

            const { error: updateError } = await access.supabase
              .from("places")
              .update({ tags: updatedTags.length > 0 ? updatedTags : null })
              .eq("id", place.id);

            if (updateError) {
              console.error(`Failed to update place ${place.id}:`, updateError);
            } else {
              deletedCount++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      tag: tagToDelete,
    });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
