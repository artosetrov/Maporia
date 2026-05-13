/**
 * PATCH /api/profile
 *
 * Current-user profile updates through the service-role client. This avoids the
 * recursive profiles UPDATE RLS policy while still only allowing a signed-in
 * user to update their own safe profile fields.
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

type ProfilePatch = {
  avatar_url?: string | null;
  display_name?: string | null;
  bio?: string | null;
  username?: string | null;
  favorite_categories?: string[] | null;
  favorite_tags?: string[] | null;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeNullableString(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function buildPatch(body: unknown): { patch: ProfilePatch | null; error?: string } {
  if (!body || typeof body !== "object") {
    return { patch: null, error: "Invalid JSON body" };
  }

  const input = body as Record<string, unknown>;
  const patch: ProfilePatch = {};

  if ("avatar_url" in input) {
    if (input.avatar_url !== null && typeof input.avatar_url !== "string") {
      return { patch: null, error: "avatar_url must be a string or null" };
    }
    patch.avatar_url = input.avatar_url;
  }

  if ("display_name" in input) {
    const displayName = normalizeNullableString(input.display_name, 50);
    if (displayName === undefined) return { patch: null, error: "display_name must be a string or null" };
    if (displayName !== null && displayName.length < 2) {
      return { patch: null, error: "display_name must be at least 2 characters" };
    }
    patch.display_name = displayName;
  }

  if ("bio" in input) {
    const bio = normalizeNullableString(input.bio, 500);
    if (bio === undefined) return { patch: null, error: "bio must be a string or null" };
    patch.bio = bio;
  }

  if ("username" in input) {
    const username = normalizeNullableString(input.username, 30);
    if (username === undefined) return { patch: null, error: "username must be a string or null" };
    if (username !== null && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return { patch: null, error: "username must be 3-30 letters, numbers, or underscores" };
    }
    patch.username = username;
  }

  if ("favorite_categories" in input) {
    if (input.favorite_categories !== null && !isStringArray(input.favorite_categories)) {
      return { patch: null, error: "favorite_categories must be an array of strings or null" };
    }
    patch.favorite_categories = input.favorite_categories;
  }

  if ("favorite_tags" in input) {
    if (input.favorite_tags !== null && !isStringArray(input.favorite_tags)) {
      return { patch: null, error: "favorite_tags must be an array of strings or null" };
    }
    patch.favorite_tags = input.favorite_tags;
  }

  if (Object.keys(patch).length === 0) {
    return { patch: null, error: "No supported profile fields provided" };
  }

  return { patch };
}

export async function PATCH(request: NextRequest) {
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

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) {
    return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const { patch, error } = buildPatch(await request.json().catch(() => null));
  if (!patch) {
    return jsonError(error || "Invalid profile update", 400, "BAD_PROFILE_PATCH");
  }

  if (patch.username) {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", patch.username)
      .neq("id", user.id)
      .maybeSingle<{ id: string }>();

    if (lookupError) {
      return jsonError(lookupError.message || "Failed to check username", 500, "USERNAME_LOOKUP_FAILED");
    }
    if (existing) {
      return jsonError("Username is already taken", 409, "USERNAME_TAKEN");
    }
  }

  const { data: profile, error: updateError } = await supabaseAdmin
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("id, username, display_name, bio, avatar_url, favorite_categories, favorite_tags")
    .single();

  if (updateError) {
    return jsonError(updateError.message || "Failed to update profile", 500, "PROFILE_UPDATE_FAILED");
  }

  return NextResponse.json({ ok: true, profile });
}
