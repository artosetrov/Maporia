import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizePostgrestValueForLike } from "@/app/utils";

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

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  is_admin: boolean | null;
  plan: string | null;
};

type UserResult = ProfileRow & {
  email: string | null;
};

type UserSearchResponse =
  | { users: UserResult[]; callerId: string }
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

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function matchesQuery(user: UserResult, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    user.email,
    user.username,
    user.display_name,
    user.id,
  ].some((value) => value?.toLowerCase().includes(q));
}

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG",
    );
  }

  const caller = await getAdminCaller(request);
  if (!caller) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const ids = uniq((searchParams.get("ids") || "").split(",")).slice(0, 20);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 12), 1), 25);

  let profilesQuery = supabaseAdmin
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, is_admin, plan")
    .order("created_at", { ascending: false })
    .limit(q ? 100 : limit);

  if (ids.length > 0) {
    profilesQuery = profilesQuery.in("id", ids);
  } else if (q) {
    const safeQ = sanitizePostgrestValueForLike(q);
    profilesQuery = profilesQuery.or(`username.ilike.%${safeQ}%,display_name.ilike.%${safeQ}%`);
  }

  const { data: profiles, error: profilesError } = await profilesQuery;
  if (profilesError) {
    return jsonError(profilesError.message || "Failed to search users", 500, "SEARCH_FAILED");
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  const profileIds = profileRows.map((profile) => profile.id);

  const emailById = new Map<string, string | null>();
  if (profileIds.length > 0) {
    await Promise.all(
      profileIds.map(async (id) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        emailById.set(id, data?.user?.email ?? null);
      }),
    );
  }

  const users = profileRows
    .map((profile): UserResult => ({
      ...profile,
      email: emailById.get(profile.id) ?? null,
    }))
    .filter((user) => ids.length > 0 || matchesQuery(user, q))
    .slice(0, limit);

  return NextResponse.json<UserSearchResponse>({ users, callerId: caller.id });
}
