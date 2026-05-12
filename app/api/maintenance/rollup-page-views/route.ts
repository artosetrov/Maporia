/**
 * GET/POST /api/maintenance/rollup-page-views
 *
 * Daily cron:
 *   1) rollup_page_views_daily(yesterday)  — свернуть вчерашний день в _daily/referrers/utm
 *   2) prune_page_views_raw(60)            — удалить raw старше 60 дней
 *
 * Auth (любой):
 *   - Authorization: Bearer <CRON_SECRET>   (Vercel Cron / external)
 *   - x-cron-secret: <CRON_SECRET>
 *   - Authorization: Bearer <user session> + is_admin profile
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/app/types/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

type RollupResponse =
  | {
      ok: true;
      rolled_up_day: string;
      rows_aggregated: number;
      pruned_raw_rows: number;
      retention_days: number;
    }
  | { error: string; code?: string };

const json = (b: RollupResponse, status: number) =>
  NextResponse.json<RollupResponse>(b, { status });

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${secret}`) return true;
  const x = req.headers.get("x-cron-secret");
  return Boolean(x && x === secret);
}

async function isCallerAdmin(req: NextRequest): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.replace("Bearer ", "");
  const { data: u, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !u?.user) return false;
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", u.user.id)
    .single();
  if (!p) return false;
  const row = p as { is_admin: boolean | null; role: string | null };
  return Boolean(row.is_admin) || row.role === "admin";
}

const RETENTION_DAYS = 60;

async function handle(req: NextRequest) {
  if (!supabaseAdmin) return json({ error: "config" }, 500);

  if (!isCronRequest(req)) {
    const ok = await isCallerAdmin(req);
    if (!ok) return json({ error: "Forbidden", code: "NOT_ALLOWED" }, 403);
  }

  // 1) Rollup yesterday. RPC возвращает SETOF (date, bigint).
  const { data: rollupDataRaw, error: rollupErr } = await (
    supabaseAdmin.rpc as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("rollup_page_views_daily", {});

  if (rollupErr) {
    return json({ error: `rollup failed: ${rollupErr.message}`, code: "ROLLUP_FAILED" }, 500);
  }

  const rollupArr = Array.isArray(rollupDataRaw) ? rollupDataRaw : [];
  const rollupRow =
    rollupArr.length > 0
      ? (rollupArr[0] as { target_day: string; rows_aggregated: number | string })
      : { target_day: "?", rows_aggregated: 0 };

  // 2) Prune
  const { data: prunedRaw, error: pruneErr } = await (
    supabaseAdmin.rpc as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )("prune_page_views_raw", { p_retention_days: RETENTION_DAYS });
  if (pruneErr) {
    return json({ error: `prune failed: ${pruneErr.message}`, code: "PRUNE_FAILED" }, 500);
  }

  return json(
    {
      ok: true,
      rolled_up_day: rollupRow.target_day,
      rows_aggregated: Number(rollupRow.rows_aggregated) || 0,
      pruned_raw_rows: typeof prunedRaw === "number" ? prunedRaw : Number(prunedRaw ?? 0),
      retention_days: RETENTION_DAYS,
    },
    200,
  );
}

export const GET = handle;
export const POST = handle;
