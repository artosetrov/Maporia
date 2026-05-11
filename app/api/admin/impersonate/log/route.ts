/**
 * GET /api/admin/impersonate/log?limit=50&offset=0
 *
 * Возвращает список impersonation-сессий + информацию о юзерах.
 * Доступ — только admin.
 *
 * Response:
 *   {
 *     items: Array<{
 *       id, admin_id, target_id, started_at, ended_at, ip, user_agent, reason,
 *       admin:  { display_name, username, email } | null,
 *       target: { display_name, username, email } | null,
 *     }>,
 *     hasMore: boolean,
 *   }
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

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

type LogRow = {
  id: string;
  admin_id: string;
  target_id: string;
  started_at: string;
  ended_at: string | null;
  ip: string | null;
  user_agent: string | null;
  reason: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
};

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return jsonError("Supabase admin not configured", 500, "MISSING_CONFIG");

  // Auth + admin-gate
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", authData.user.id)
    .single();

  if (!callerProfile) return jsonError("Profile not found", 404, "PROFILE_MISSING");
  const cp = callerProfile as { is_admin: boolean | null; role: string | null };
  if (!cp.is_admin && cp.role !== "admin") return jsonError("Forbidden", 403, "NOT_ADMIN");

  // Pagination
  const url = new URL(req.url);
  const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
  const offset = parseBoundedInteger(url.searchParams.get("offset"), 0, 0, 100_000);

  const { data: logs, error: logErr } = await supabaseAdmin
    .from("admin_impersonation_log")
    .select("id, admin_id, target_id, started_at, ended_at, ip, user_agent, reason")
    .order("started_at", { ascending: false })
    .range(offset, offset + limit); // +1 чтобы понять hasMore

  if (logErr) return jsonError(`Query failed: ${logErr.message}`, 500, "QUERY_FAILED");

  const rows = (logs ?? []) as LogRow[];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  // Собираем уникальные user_ids для batch-fetch profile + email.
  const userIds = Array.from(
    new Set(trimmed.flatMap((r) => [r.admin_id, r.target_id]))
  );

  // profiles batch
  const profilesMap: Record<string, { display_name: string | null; username: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, username")
      .in("id", userIds);
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profilesMap[p.id] = { display_name: p.display_name, username: p.username };
    }
  }

  // emails — auth.admin.getUserById не принимает массив, делаем последовательно (limit'ом ограничено).
  const emailsMap: Record<string, string | null> = {};
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        emailsMap[uid] = data?.user?.email ?? null;
      } catch {
        emailsMap[uid] = null;
      }
    })
  );

  const enrich = (uid: string) => {
    const p = profilesMap[uid];
    if (!p && !emailsMap[uid]) return null;
    return {
      display_name: p?.display_name ?? null,
      username: p?.username ?? null,
      email: emailsMap[uid] ?? null,
    };
  };

  const items = trimmed.map((r) => ({
    ...r,
    admin: enrich(r.admin_id),
    target: enrich(r.target_id),
  }));

  return NextResponse.json({ items, hasMore });
}
