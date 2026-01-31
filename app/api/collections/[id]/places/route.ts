import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/app/types/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

/**
 * GET /api/collections/[id]/places
 * Returns the collection and all places in it (ordered by place_collections.sort_order).
 * Uses service role so all places are returned; client shows lock for premium when needed.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const collectionId = params?.id;
    if (!collectionId) {
      return NextResponse.json({ error: "Collection ID required" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error: "Server configuration error",
          hint: "Add SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) and NEXT_PUBLIC_SUPABASE_URL to .env.local",
        },
        { status: 500 }
      );
    }

    const { data: colData, error: colError } = await supabaseAdmin
      .from("collections")
      .select("id, title, description, cover_image, access_type, is_active")
      .eq("id", collectionId)
      .single();

    if (colError || !colData) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const col = colData as {
      id: string;
      title: string;
      description: string | null;
      cover_image: string | null;
      access_type: string;
      is_active: boolean;
    };

    if (!col.is_active) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    type PlaceCollectionRow = { place_id: string; sort_order?: number; order?: number };
    let pcData: PlaceCollectionRow[] | null = null;
    let pcError: { message: string } | null = null;

    const res = await supabaseAdmin
      .from("place_collections")
      .select("id, place_id, collection_id, sort_order")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: true });

    pcData = res.data as PlaceCollectionRow[] | null;
    pcError = res.error;

    if (pcError && pcError.message?.includes("sort_order")) {
      const legacyRes = await supabaseAdmin
        .from("place_collections")
        .select("id, place_id, collection_id")
        .eq("collection_id", collectionId);
      if (legacyRes.error) {
        const msg =
          "Run the migration in Supabase SQL Editor: scripts/sql/rename-place-collections-order-to-sort-order.sql";
        return NextResponse.json({ error: msg, detail: pcError.message }, { status: 500 });
      }
      pcData = (legacyRes.data ?? []).map((r: { place_id: string }, i: number) => ({
        place_id: r.place_id,
        sort_order: i,
      }));
      pcError = null;
    }

    if (pcError) {
      return NextResponse.json({ error: pcError.message }, { status: 500 });
    }

    const rows: { place_id: string; sort_order: number }[] = (pcData ?? []).map((r) => ({
      place_id: r.place_id,
      sort_order: r.sort_order ?? (r as { order?: number }).order ?? 0,
    }));
    if (rows.length === 0) {
      return NextResponse.json({
        collection: col,
        places: [],
      });
    }

    const placeIds = rows.map((r) => r.place_id);
    const orderMap: Record<string, number> = {};
    rows.forEach((r, i) => {
      orderMap[r.place_id] = i;
    });

    const { data: placesData, error: placesError } = await supabaseAdmin
      .from("places")
      .select("*")
      .in("id", placeIds);

    if (placesError) {
      return NextResponse.json({ error: placesError.message }, { status: 500 });
    }

    const rawList = (placesData as Record<string, unknown>[]) ?? [];
    const placesList = rawList.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? null,
      address: p.address ?? null,
      city: p.city ?? null,
      country: p.country ?? null,
      cover_url: p.cover_url ?? null,
      categories: p.categories ?? null,
      tags: p.tags ?? null,
      created_by: p.created_by ?? null,
      access_level: p.access_level ?? null,
      is_premium: p.is_premium ?? null,
      premium_only: p.premium_only ?? null,
      visibility: p.visibility ?? null,
    }));
    placesList.sort((a, b) => (orderMap[(a.id as string)] ?? 0) - (orderMap[(b.id as string)] ?? 0));

    return NextResponse.json({
      collection: col,
      places: placesList,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/collections/[id]/places]", err);
    return NextResponse.json(
      { error: message, hint: "If you see 'sort_order', run scripts/sql/rename-place-collections-order-to-sort-order.sql in Supabase." },
      { status: 500 }
    );
  }
}
