/**
 * POST /api/admin/impersonate
 *
 * Body: {
 *   targetUserId: string,
 *   accessToken:  string,   // текущая admin-сессия (нужно для бэкапа)
 *   refreshToken: string,
 * }
 *
 * Шаги:
 *   1. Auth — проверяем, что вызывающий действительно admin.
 *   2. Резолвим email таргета через supabase.auth.admin.getUserById.
 *   3. Запрещаем impersonate-ить себя и других админов.
 *   4. Генерируем magiclink (получаем hashed_token).
 *   5. INSERT в admin_impersonation_log → log_id.
 *   6. Set-Cookie: admin_session_backup (signed) + impersonation_log_id.
 *   7. Возвращаем { tokenHash } — клиент сделает supabase.auth.verifyOtp().
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  COOKIE_ADMIN_BACKUP,
  COOKIE_LOG_ID,
  COOKIE_OPTIONS_BACKUP,
  COOKIE_OPTIONS_LOG_ID,
  encodeAdminBackup,
} from "@/app/lib/impersonation";

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

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG"
    );
  }

  // 1. Body
  const body = (await request.json().catch(() => ({}))) as {
    targetUserId?: string;
    accessToken?: string;
    refreshToken?: string;
  };
  const { targetUserId, accessToken, refreshToken } = body;
  if (!targetUserId || !accessToken || !refreshToken) {
    return jsonError(
      "targetUserId, accessToken and refreshToken are required",
      400,
      "BAD_REQUEST"
    );
  }

  // 2. Auth + admin gate
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  const callerUser = authData?.user;
  if (authError || !callerUser) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", callerUser.id)
    .single();

  if (callerErr || !callerProfile) return jsonError("Profile not found", 404, "PROFILE_MISSING");
  if (!callerProfile.is_admin && callerProfile.role !== "admin") {
    return jsonError("Forbidden", 403, "NOT_ADMIN");
  }

  // 3. Гарды
  if (targetUserId === callerUser.id) {
    return jsonError("Cannot impersonate yourself", 400, "TARGET_IS_SELF");
  }

  const { data: targetProfile, error: targetProfileErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", targetUserId)
    .single();

  if (targetProfileErr || !targetProfile) {
    return jsonError("Target user not found", 404, "TARGET_NOT_FOUND");
  }

  if (targetProfile.is_admin || targetProfile.role === "admin") {
    return jsonError(
      "Cannot impersonate another admin",
      403,
      "TARGET_IS_ADMIN"
    );
  }

  // 4. Резолвим email таргета
  const { data: targetUserData, error: targetUserErr } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  const targetEmail = targetUserData?.user?.email;
  if (targetUserErr || !targetEmail) {
    return jsonError(
      "Target user has no email — cannot generate magic link",
      400,
      "TARGET_NO_EMAIL"
    );
  }

  // 5. Magic link
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return jsonError(
      `Failed to generate magic link: ${linkErr?.message ?? "unknown"}`,
      500,
      "LINK_FAILED"
    );
  }

  // 6. Лог
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent") || null;

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from("admin_impersonation_log")
    .insert({
      admin_id: callerUser.id,
      target_id: targetUserId,
      ip,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (logErr || !logRow) {
    return jsonError(
      `Failed to write audit log: ${logErr?.message ?? "unknown"}`,
      500,
      "LOG_FAILED"
    );
  }

  // 7. Set cookies + ответ
  const response = NextResponse.json({
    tokenHash,
    targetEmail,
  });

  response.cookies.set(
    COOKIE_ADMIN_BACKUP,
    encodeAdminBackup({
      accessToken,
      refreshToken,
      adminId: callerUser.id,
    }),
    COOKIE_OPTIONS_BACKUP
  );

  response.cookies.set(COOKIE_LOG_ID, (logRow as { id: string }).id, COOKIE_OPTIONS_LOG_ID);

  return response;
}
