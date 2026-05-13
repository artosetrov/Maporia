/**
 * PATCH /api/admin/users/[id]/role
 *
 * Admin-only endpoint for manual plan/admin assignment. This intentionally uses
 * the service-role client after verifying the caller's session and admin flag:
 * admin role changes should not depend on client-side RLS policies on profiles.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

const ASSIGNABLE = [
  "admin",
  "free",
  "premium_viewer",
  "creator_service",
  "creator_experience",
  "creator_all",
] as const;

type AdminAssignable = (typeof ASSIGNABLE)[number];

type Body = {
  assignment?: string;
};

type ProfileUpdate = {
  is_admin: boolean;
  role: "admin" | "premium" | "standard";
  plan?: AdminAssignable;
  plan_period?: "month" | "lifetime" | null;
  plan_renews_at?: string | null;
  subscription_status?: "active" | "inactive";
};

function isAdminAssignable(value: string | undefined): value is AdminAssignable {
  return ASSIGNABLE.includes(value as AdminAssignable);
}

function buildProfileUpdate(assignment: AdminAssignable): ProfileUpdate {
  if (assignment === "admin") {
    return {
      is_admin: true,
      role: "admin",
    };
  }

  if (assignment === "free") {
    return {
      is_admin: false,
      plan: "free",
      plan_period: null,
      plan_renews_at: null,
      subscription_status: "inactive",
      role: "standard",
    };
  }

  if (assignment === "premium_viewer") {
    return {
      is_admin: false,
      plan: "premium_viewer",
      plan_period: "lifetime",
      plan_renews_at: null,
      subscription_status: "active",
      role: "premium",
    };
  }

  return {
    is_admin: false,
    plan: assignment,
    plan_period: "month",
    plan_renews_at: null,
    subscription_status: "active",
    role: "premium",
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG"
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: callerAuth, error: callerAuthErr } = await supabaseAdmin.auth.getUser(token);
  const callerUser = callerAuth?.user;
  if (callerAuthErr || !callerUser) {
    return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const { data: callerProfile, error: callerProfileErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", callerUser.id)
    .single<{ is_admin: boolean | null; role: string | null }>();

  if (callerProfileErr || !callerProfile) {
    return jsonError("Profile not found", 404, "PROFILE_MISSING");
  }
  if (!callerProfile.is_admin && callerProfile.role !== "admin") {
    return jsonError("Forbidden", 403, "NOT_ADMIN");
  }

  const { id: targetUserId } = await context.params;
  if (!targetUserId) return jsonError("Missing user id", 400, "BAD_REQUEST");
  if (targetUserId === callerUser.id) {
    return jsonError("Use profile settings for your own account", 400, "SELF_FORBIDDEN");
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!isAdminAssignable(body.assignment)) {
    return jsonError("Invalid role assignment", 400, "BAD_ASSIGNMENT");
  }

  const { data: targetAuthData, error: targetAuthErr } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (targetAuthErr || !targetAuthData?.user) {
    return jsonError("Target user not found", 404, "TARGET_NOT_FOUND");
  }

  const updates = buildProfileUpdate(body.assignment);
  const { data: updatedProfile, error: updateErr } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", targetUserId)
    .select("id, username, display_name, avatar_url, role, is_admin, subscription_status, plan, plan_period, created_at")
    .single();

  if (updateErr) {
    return jsonError(updateErr.message || "Failed to update user role", 500, "UPDATE_FAILED");
  }

  return NextResponse.json({
    ok: true,
    assignment: body.assignment,
    profile: updatedProfile,
  });
}
