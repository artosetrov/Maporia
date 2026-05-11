/**
 * GET/POST /api/maintenance/cleanup-drafts
 *
 * Deletes abandoned empty /add drafts older than ORPHAN_ADD_DRAFT_TTL_HOURS.
 *
 * Auth (any):
 *   1. Authorization: Bearer <CRON_SECRET> — Vercel Cron.
 *   2. x-cron-secret: <CRON_SECRET> — external cron.
 *   3. Authorization: Bearer <user_session> where user is admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isOrphanAddDraftCandidate,
  orphanAddDraftCutoff,
  ORPHAN_ADD_DRAFT_CLEANUP_LIMIT,
  ORPHAN_ADD_DRAFT_SELECT,
  ORPHAN_ADD_DRAFT_TTL_HOURS,
  type OrphanAddDraftCandidate,
} from "@/app/lib/placeDrafts";
import type { Database } from "@/app/types/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

type CleanupDraftsResponse =
  | { deleted: number; scanned: number; cutoff: string; ttlHours: number }
  | { error: string; code?: string };

const jsonError = (message: string, status: number, code?: string) =>
  NextResponse.json<CleanupDraftsResponse>({ error: message, code }, { status });

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const xSecret = req.headers.get("x-cron-secret");
  return Boolean(xSecret && xSecret === cronSecret);
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

  if (!isCronRequest(req)) {
    const ok = await isCallerAdmin(req);
    if (!ok) return jsonError("Forbidden", 403, "NOT_ALLOWED");
  }

  const cutoff = orphanAddDraftCutoff();
  const { data, error: loadError } = await supabaseAdmin
    .from("places")
    .select(ORPHAN_ADD_DRAFT_SELECT)
    .eq("title", "")
    .eq("is_hidden", true)
    .lt("created_at", cutoff)
    .limit(ORPHAN_ADD_DRAFT_CLEANUP_LIMIT);

  if (loadError) {
    return jsonError(`cleanup load failed: ${loadError.message}`, 500, "CLEANUP_LOAD_FAILED");
  }

  const draftIds = ((data ?? []) as unknown as OrphanAddDraftCandidate[])
    .filter(isOrphanAddDraftCandidate)
    .map((place) => place.id);

  if (draftIds.length === 0) {
    return NextResponse.json<CleanupDraftsResponse>({
      deleted: 0,
      scanned: data?.length ?? 0,
      cutoff,
      ttlHours: ORPHAN_ADD_DRAFT_TTL_HOURS,
    });
  }

  const [
    linksAsParent,
    linksAsChild,
    photosResult,
    commentsResult,
    reactionsResult,
    placesResult,
  ] = await Promise.all([
    supabaseAdmin.from("place_links").delete().in("parent_place_id", draftIds),
    supabaseAdmin.from("place_links").delete().in("child_place_id", draftIds),
    supabaseAdmin.from("place_photos").delete().in("place_id", draftIds),
    supabaseAdmin.from("comments").delete().in("place_id", draftIds),
    supabaseAdmin.from("reactions").delete().in("place_id", draftIds),
    supabaseAdmin.from("places").delete().in("id", draftIds).select("id"),
  ]);

  const cleanupError =
    linksAsParent.error ||
    linksAsChild.error ||
    photosResult.error ||
    commentsResult.error ||
    reactionsResult.error ||
    placesResult.error;

  if (cleanupError) {
    return jsonError(`cleanup failed: ${cleanupError.message}`, 500, "CLEANUP_FAILED");
  }

  return NextResponse.json<CleanupDraftsResponse>({
    deleted: placesResult.data?.length ?? draftIds.length,
    scanned: data?.length ?? 0,
    cutoff,
    ttlHours: ORPHAN_ADD_DRAFT_TTL_HOURS,
  });
}

export const GET = handle;
export const POST = handle;
