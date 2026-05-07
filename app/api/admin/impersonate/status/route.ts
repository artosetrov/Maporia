/**
 * GET /api/admin/impersonate/status
 *
 * Лёгкий эндпоинт — отвечает баннеру и клиентскому коду на вопрос
 * "идёт ли сейчас impersonation, и если да, то под каким email?".
 *
 * Без cookie impersonation_log_id — { active: false }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  COOKIE_ADMIN_BACKUP,
  COOKIE_LOG_ID,
  COOKIE_OPTIONS_CLEAR,
  isLogExpired,
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

/**
 * Возвращает {active:false} + чистит cookies.
 * Используется когда сессия закрыта / истекла / битая.
 */
function inactiveResponse() {
  const res = NextResponse.json({ active: false });
  res.cookies.set(COOKIE_LOG_ID, "", COOKIE_OPTIONS_CLEAR);
  res.cookies.set(COOKIE_ADMIN_BACKUP, "", COOKIE_OPTIONS_CLEAR);
  return res;
}

export async function GET(request: NextRequest) {
  const logId = request.cookies.get(COOKIE_LOG_ID)?.value;
  if (!logId || !supabaseAdmin) {
    return NextResponse.json({ active: false });
  }

  const { data: log } = await supabaseAdmin
    .from("admin_impersonation_log")
    .select("target_id, started_at, ended_at")
    .eq("id", logId)
    .single();

  if (!log) return inactiveResponse();
  const logRow = log as {
    target_id: string;
    started_at: string;
    ended_at: string | null;
  };

  if (logRow.ended_at) return inactiveResponse();

  // TTL: если сессия "забыта" — закрываем здесь же, чистим cookies, отдаём active=false.
  if (isLogExpired(logRow.started_at)) {
    await supabaseAdmin
      .from("admin_impersonation_log")
      .update({ ended_at: new Date().toISOString(), reason: "ttl_auto_closed" })
      .eq("id", logId)
      .is("ended_at", null);
    return inactiveResponse();
  }

  // Резолвим email таргета — для красивого баннера.
  const targetId = logRow.target_id;
  let targetEmail: string | null = null;
  let targetName: string | null = null;

  const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(targetId);
  targetEmail = targetUser?.user?.email ?? null;

  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("display_name, username")
    .eq("id", targetId)
    .single();
  if (targetProfile) {
    const tp = targetProfile as { display_name: string | null; username: string | null };
    targetName = tp.display_name || tp.username;
  }

  return NextResponse.json({
    active: true,
    targetId,
    targetEmail,
    targetName,
    startedAt: logRow.started_at,
  });
}
