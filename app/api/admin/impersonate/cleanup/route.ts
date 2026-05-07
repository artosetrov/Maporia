/**
 * POST/GET /api/admin/impersonate/cleanup
 *
 * Закрывает все висящие impersonation-сессии старше IMPERSONATION_TTL_SECONDS.
 * Предполагается вызов из cron / Vercel Cron / supabase scheduled function.
 *
 * Auth (любой из):
 *   1. `Authorization: Bearer <CRON_SECRET>` — Vercel Cron (стандартный механизм).
 *   2. `x-cron-secret: <CRON_SECRET>` — внешний cron.
 *   3. `Authorization: Bearer <user_session>` где user.is_admin === true.
 *
 * Vercel Cron работает только на GET — поэтому экспортируем и POST, и GET.
 *
 * Returns: { closed: number, expiredAt: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { IMPERSONATION_TTL_SECONDS } from "@/app/lib/impersonation";

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

/**
 * Возвращает true, если запрос пришёл от cron — есть валидный CRON_SECRET
 * либо в `Authorization: Bearer ...` (Vercel Cron), либо в `x-cron-secret`.
 */
function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const xSecret = req.headers.get("x-cron-secret");
  if (xSecret && xSecret === cronSecret) return true;

  return false;
}

async function isCallerAdmin(req: NextRequest): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !authData?.user) return false;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", authData.user.id)
    .single();

  if (!profile) return false;
  const p = profile as { is_admin: boolean | null; role: string | null };
  return Boolean(p.is_admin) || p.role === "admin";
}

async function handle(req: NextRequest) {
  if (!supabaseAdmin) return jsonError("Supabase admin not configured", 500, "MISSING_CONFIG");

  // Auth: cron первым (дешевле), потом admin (если cron не подошёл).
  if (!isCronRequest(req)) {
    const ok = await isCallerAdmin(req);
    if (!ok) return jsonError("Forbidden", 403, "NOT_ALLOWED");
  }

  const expiredAt = new Date(Date.now() - IMPERSONATION_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("admin_impersonation_log")
    .update({ ended_at: new Date().toISOString(), reason: "ttl_auto_closed" })
    .is("ended_at", null)
    .lt("started_at", expiredAt)
    .select("id");

  if (error) {
    return jsonError(`cleanup failed: ${error.message}`, 500, "CLEANUP_FAILED");
  }

  return NextResponse.json({
    closed: data?.length ?? 0,
    expiredAt,
  });
}

export const POST = handle;
// Vercel Cron шлёт GET — экспортируем и его.
export const GET = handle;
