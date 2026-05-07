/**
 * POST /api/admin/impersonate/exit
 *
 * Закрывает impersonation-сессию:
 *   1. Читает admin_session_backup (signed cookie) → токены админа.
 *   2. Закрывает запись в admin_impersonation_log (ended_at = now()).
 *   3. Очищает обе cookie.
 *   4. Возвращает { accessToken, refreshToken } — клиент сделает
 *      supabase.auth.setSession() и снова станет админом.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  COOKIE_ADMIN_BACKUP,
  COOKIE_LOG_ID,
  COOKIE_OPTIONS_CLEAR,
  decodeAdminBackup,
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
    return jsonError("Supabase admin not configured", 500, "MISSING_CONFIG");
  }

  const backupRaw = request.cookies.get(COOKIE_ADMIN_BACKUP)?.value;
  const logId = request.cookies.get(COOKIE_LOG_ID)?.value;

  const backup = decodeAdminBackup(backupRaw);
  if (!backup) {
    // нечего восстанавливать — просто чистим cookies, чтобы UI пришёл в норму
    const empty = NextResponse.json(
      { error: "No active impersonation session" },
      { status: 400 }
    );
    empty.cookies.set(COOKIE_ADMIN_BACKUP, "", COOKIE_OPTIONS_CLEAR);
    empty.cookies.set(COOKIE_LOG_ID, "", COOKIE_OPTIONS_CLEAR);
    return empty;
  }

  // Закрываем запись в логе. Если logId нет — значит куки рассинхронизировались,
  // но восстановить сессию админа всё равно надо.
  if (logId) {
    const { error: updErr } = await supabaseAdmin
      .from("admin_impersonation_log")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", logId)
      .is("ended_at", null);

    if (updErr) {
      // не фейлим — приоритет восстановить сессию пользователя
      console.error("[impersonate/exit] Failed to close log row:", updErr.message);
    }
  }

  const response = NextResponse.json({
    accessToken: backup.accessToken,
    refreshToken: backup.refreshToken,
  });

  response.cookies.set(COOKIE_ADMIN_BACKUP, "", COOKIE_OPTIONS_CLEAR);
  response.cookies.set(COOKIE_LOG_ID, "", COOKIE_OPTIONS_CLEAR);

  return response;
}
