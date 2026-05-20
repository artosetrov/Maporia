import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/app/types/supabase";
import {
  getCaller,
  jsonError,
  loadPlacesById,
  PLACE_LINK_SELECT,
  supabaseAdmin,
} from "./_server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateLinkBody = {
  parentId?: unknown;
  childId?: unknown;
  relation?: unknown;
};

type PlaceLinkRow = Database["public"]["Tables"]["place_links"]["Row"];
type CreateLinkResponse = { ok: true; link: PlaceLinkRow };

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG",
    );
  }

  const { caller, response: callerResponse } = await getCaller(request, supabaseAdmin);
  if (!caller) return callerResponse;

  const body = (await request.json().catch(() => null)) as CreateLinkBody | null;
  if (!body || typeof body !== "object") {
    return jsonError("Invalid JSON body", 400, "BAD_REQUEST");
  }

  const parentId = normalizeId(body.parentId);
  const childId = normalizeId(body.childId);
  if (!parentId || !childId || parentId === childId) {
    return jsonError("Invalid parent or child place id", 400, "BAD_PLACE_LINK");
  }

  if (body.relation !== undefined && body.relation !== "happens_at") {
    return jsonError("Unsupported place link relation", 400, "BAD_RELATION");
  }

  const { places, response: placesResponse } = await loadPlacesById(supabaseAdmin, [
    parentId,
    childId,
  ]);
  if (!places) return placesResponse;

  const parent = places.find((place) => place.id === parentId);
  const child = places.find((place) => place.id === childId);
  if (!parent || !child) return jsonError("Place not found", 404, "PLACE_NOT_FOUND");
  if (parent.kind !== "location") {
    return jsonError("Parent place must be a location", 400, "BAD_PARENT_KIND");
  }
  if (child.kind !== "service" && child.kind !== "experience") {
    return jsonError("Child place must be a service or experience", 400, "BAD_CHILD_KIND");
  }

  const ownsParent = parent.created_by === caller.userId;
  const ownsChild = child.created_by === caller.userId;
  if (!caller.isAdmin && !ownsChild) {
    return jsonError("You can only link services or experiences that you own.", 403, "FORBIDDEN");
  }

  const status = caller.isAdmin || ownsParent ? "active" : "pending";
  const { data, error } = await supabaseAdmin
    .from("place_links")
    // @ts-expect-error Supabase generated types infer insert payload as never
    .insert({
      parent_place_id: parentId,
      child_place_id: childId,
      relation: "happens_at",
      status,
      created_by: caller.userId,
    })
    .select(PLACE_LINK_SELECT)
    .single();

  if (error) {
    const isDuplicate = /duplicate|unique/i.test(error.message);
    return jsonError(
      isDuplicate ? "Already linked or request pending." : error.message,
      isDuplicate ? 409 : 500,
      isDuplicate ? "LINK_EXISTS" : "LINK_CREATE_FAILED",
    );
  }

  return NextResponse.json<CreateLinkResponse>({ ok: true, link: data as PlaceLinkRow });
}
