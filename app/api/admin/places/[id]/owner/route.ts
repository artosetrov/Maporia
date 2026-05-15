import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { PlaceListItem } from "@/app/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, code }, { status });

type OwnerTransferBody = {
  targetUserId?: string;
  reason?: string;
};

type PlaceOwnerRow = {
  id: string;
  title: string | null;
  kind: PlaceListItem["kind"];
  created_by: string | null;
};

type OwnerTransferResponse =
  | {
      ok: true;
      unchanged?: boolean;
      place: PlaceOwnerRow;
      owner: Record<string, unknown>;
      auditWarning?: string | null;
    }
  | { error: string; code?: string };

async function getAdminCaller(request: NextRequest) {
  if (!supabaseAdmin) return null;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const { data: callerAuth, error: callerAuthErr } = await supabaseAdmin.auth.getUser(token);
  const callerUser = callerAuth?.user;
  if (callerAuthErr || !callerUser) return null;

  const { data: callerProfile, error: callerProfileErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", callerUser.id)
    .single<{ is_admin: boolean | null; role: string | null }>();

  if (callerProfileErr || !callerProfile) return null;
  if (!callerProfile.is_admin && callerProfile.role !== "admin") return null;

  return callerUser;
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG",
    );
  }

  const caller = await getAdminCaller(request);
  if (!caller) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { id: placeId } = await context.params;
  if (!placeId) return jsonError("Missing place id", 400, "BAD_REQUEST");

  const body = (await request.json().catch(() => ({}))) as OwnerTransferBody;
  const targetUserId = body.targetUserId?.trim();
  if (!targetUserId) return jsonError("targetUserId is required", 400, "BAD_REQUEST");

  const { data: targetAuth, error: targetAuthError } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (targetAuthError || !targetAuth?.user) {
    return jsonError("Target user not found", 404, "TARGET_NOT_FOUND");
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, is_admin, plan")
    .eq("id", targetUserId)
    .single();
  if (targetProfileError || !targetProfile) {
    return jsonError("Target profile not found", 404, "TARGET_PROFILE_NOT_FOUND");
  }

  const { data: placeData, error: placeError } = await supabaseAdmin
    .from("places")
    .select("id, title, kind, created_by")
    .eq("id", placeId)
    .single<PlaceOwnerRow>();
  if (placeError || !placeData) {
    return jsonError("Place not found", 404, "PLACE_NOT_FOUND");
  }

  const oldOwnerId = placeData.created_by;
  if (oldOwnerId === targetUserId) {
    return NextResponse.json<OwnerTransferResponse>({
      ok: true,
      unchanged: true,
      place: placeData,
      owner: { ...targetProfile, email: targetAuth.user.email ?? null },
    });
  }

  const { data: updatedPlace, error: updateError } = await supabaseAdmin
    .from("places")
    .update({ created_by: targetUserId })
    .eq("id", placeId)
    .select("id, title, kind, created_by")
    .single<PlaceOwnerRow>();

  if (updateError || !updatedPlace) {
    return jsonError(updateError?.message || "Failed to transfer owner", 500, "TRANSFER_FAILED");
  }

  const auditPayload = {
    place_id: placeId,
    old_owner_id: oldOwnerId,
    new_owner_id: targetUserId,
    admin_id: caller.id,
    reason: normalizeReason(body.reason),
  };
  const { error: auditError } = await supabaseAdmin
    .from("admin_place_owner_transfers")
    .insert(auditPayload);

  return NextResponse.json<OwnerTransferResponse>({
    ok: true,
    place: updatedPlace,
    owner: { ...targetProfile, email: targetAuth.user.email ?? null },
    auditWarning: auditError?.message ?? null,
  });
}
