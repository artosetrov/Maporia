import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/app/types/supabase";

export const PLACE_LINK_SELECT =
  "id,parent_place_id,child_place_id,relation,status,sort_order,created_at,approved_at,created_by";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export type AdminClient = SupabaseClient<Database>;

export type PlaceLinkStatus = "active" | "pending" | "rejected";
export type PlaceKindLite = "location" | "service" | "experience";

export type CallerContext = {
  userId: string;
  isAdmin: boolean;
};

export type PlaceAccessRow = {
  id: string;
  kind: PlaceKindLite | null;
  created_by: string | null;
};

export type LinkAccessRow = {
  id: string;
  parent_place_id: string;
  child_place_id: string;
  status: PlaceLinkStatus;
};

type ProfileAccessRow = {
  is_admin: boolean | null;
  role: string | null;
};

export const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  return token || null;
}

export async function getCaller(
  request: NextRequest,
  admin: AdminClient,
): Promise<{ caller: CallerContext | null; response?: NextResponse }> {
  const token = getBearerToken(request);
  if (!token) {
    return { caller: null, response: jsonError("Unauthorized", 401, "UNAUTHORIZED") };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) {
    return { caller: null, response: jsonError("Unauthorized", 401, "UNAUTHORIZED") };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .single<ProfileAccessRow>();

  if (profileError || !profile) {
    return {
      caller: null,
      response: jsonError("Profile not found", 404, "PROFILE_NOT_FOUND"),
    };
  }

  return {
    caller: {
      userId: user.id,
      isAdmin: profile.is_admin === true || profile.role === "admin",
    },
  };
}

export async function loadPlacesById(
  admin: AdminClient,
  ids: string[],
): Promise<{ places: PlaceAccessRow[] | null; response?: NextResponse }> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const { data, error } = await admin
    .from("places")
    .select("id, kind, created_by")
    .in("id", uniqueIds);

  if (error) {
    return {
      places: null,
      response: jsonError(error.message || "Failed to load places", 500, "PLACES_LOAD_FAILED"),
    };
  }

  const places = (data ?? []) as PlaceAccessRow[];
  if (places.length !== uniqueIds.length) {
    return { places: null, response: jsonError("Place not found", 404, "PLACE_NOT_FOUND") };
  }

  return { places };
}

export async function loadLinkAccess(
  admin: AdminClient,
  linkId: string,
): Promise<{ link: LinkAccessRow | null; places?: PlaceAccessRow[]; response?: NextResponse }> {
  const { data: link, error: linkError } = await admin
    .from("place_links")
    .select("id,parent_place_id,child_place_id,status")
    .eq("id", linkId)
    .single<LinkAccessRow>();

  if (linkError || !link) {
    return { link: null, response: jsonError("Link not found", 404, "LINK_NOT_FOUND") };
  }

  const { places, response } = await loadPlacesById(admin, [
    link.parent_place_id,
    link.child_place_id,
  ]);
  if (!places) return { link: null, response };

  return { link, places };
}
