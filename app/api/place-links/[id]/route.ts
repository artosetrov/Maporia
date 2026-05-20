import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/app/types/supabase";
import {
  getCaller,
  jsonError,
  loadLinkAccess,
  PLACE_LINK_SELECT,
  supabaseAdmin,
  type PlaceLinkStatus,
} from "../_server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LinkPatchBody = {
  status?: unknown;
};

type PlaceLinkRow = Database["public"]["Tables"]["place_links"]["Row"];
type LinkPatchResponse = { ok: true; link: PlaceLinkRow };
type LinkDeleteResponse = { ok: true };

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isModerationStatus(value: unknown): value is Extract<PlaceLinkStatus, "active" | "rejected"> {
  return value === "active" || value === "rejected";
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG",
    );
  }

  const { caller, response: callerResponse } = await getCaller(request, supabaseAdmin);
  if (!caller) return callerResponse;

  const { id: linkId } = await context.params;
  if (!linkId) return jsonError("Missing link id", 400, "BAD_REQUEST");

  const body = (await request.json().catch(() => null)) as LinkPatchBody | null;
  if (!body || typeof body !== "object" || !isModerationStatus(body.status)) {
    return jsonError("status must be active or rejected", 400, "BAD_STATUS");
  }

  const { link, places, response: linkResponse } = await loadLinkAccess(supabaseAdmin, linkId);
  if (!link || !places) return linkResponse;

  const parent = places.find((place) => place.id === link.parent_place_id);
  const ownsParent = parent?.created_by === caller.userId;
  if (!caller.isAdmin && !ownsParent) {
    return jsonError("Only the location owner can approve or reject this link.", 403, "FORBIDDEN");
  }

  const { data, error } = await supabaseAdmin
    .from("place_links")
    // @ts-expect-error Supabase generated types infer update payload as never
    .update({ status: body.status })
    .eq("id", linkId)
    .eq("status", "pending")
    .select(PLACE_LINK_SELECT)
    .single();

  if (error) {
    return jsonError(error.message || "Failed to update place link", 500, "LINK_UPDATE_FAILED");
  }

  return NextResponse.json<LinkPatchResponse>({ ok: true, link: data as PlaceLinkRow });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG",
    );
  }

  const { caller, response: callerResponse } = await getCaller(request, supabaseAdmin);
  if (!caller) return callerResponse;

  const { id: linkId } = await context.params;
  if (!linkId) return jsonError("Missing link id", 400, "BAD_REQUEST");

  const { link, places, response: linkResponse } = await loadLinkAccess(supabaseAdmin, linkId);
  if (!link || !places) return linkResponse;

  const parent = places.find((place) => place.id === link.parent_place_id);
  const child = places.find((place) => place.id === link.child_place_id);
  const canDelete =
    caller.isAdmin ||
    parent?.created_by === caller.userId ||
    child?.created_by === caller.userId;

  if (!canDelete) {
    return jsonError("Only either listing owner can remove this link.", 403, "FORBIDDEN");
  }

  const { error } = await supabaseAdmin.from("place_links").delete().eq("id", linkId);
  if (error) {
    return jsonError(error.message || "Failed to delete place link", 500, "LINK_DELETE_FAILED");
  }

  return NextResponse.json<LinkDeleteResponse>({ ok: true });
}
