import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase admin client (service role only)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DbCheckResult = {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  count?: number;
};

type ServiceCheckResult = {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

type EnvStatus = Record<string, boolean>;

type DataStats = Record<string, number | null>;

type DbHealthReport = {
  status: "green" | "yellow" | "red";
  timestamp: string;
  checks: DbCheckResult[];
  services: ServiceCheckResult[];
  env: EnvStatus;
  stats: DataStats;
};

// ---------------------------------------------------------------------------
// Admin auth helper
// ---------------------------------------------------------------------------

const authenticateAdmin = async (
  request: NextRequest,
): Promise<boolean> => {
  if (!supabaseAdmin) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return false;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  if (!profile) return false;
  return !!(profile.is_admin || profile.role === "admin");
};

// ---------------------------------------------------------------------------
// Individual DB checks
// ---------------------------------------------------------------------------

/** Check RLS is enabled on critical tables */
const checkRls = async (): Promise<DbCheckResult[]> => {
  const results: DbCheckResult[] = [];
  const criticalTables = [
    "places",
    "profiles",
    "collections",
    "reactions",
    "comments",
    "place_photos",
  ];

  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const result = await supabaseAdmin!.rpc("exec_sql", {
      query: `
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
      `,
    });
    data = result.data;
    error = result.error;
  } catch {
    error = { message: "RPC not available" };
  }

  // Fallback: if rpc is not available, try raw query via pg_tables
  if (error || !data) {
    let fallback: unknown = null;
    try {
      const result = await supabaseAdmin!
        .from("pg_tables" as never)
        .select("tablename, rowsecurity")
        .eq("schemaname", "public")
        .in("tablename", criticalTables);
      fallback = result.data;
    } catch {
      fallback = null;
    }

    if (!fallback) {
      results.push({
        id: "rls.check-unavailable",
        name: "RLS check",
        status: "warn",
        message:
          "Could not verify RLS status — pg_tables query not accessible. Run SUPABASE-RLS-AUDIT.sql manually.",
      });
      return results;
    }
  }

  // If we have data from the RPC call
  if (Array.isArray(data)) {
    const tableMap = new Map(
      (data as Array<{ tablename: string; rowsecurity: boolean }>).map(
        (r) => [r.tablename, r.rowsecurity],
      ),
    );
    for (const table of criticalTables) {
      const hasRls = tableMap.get(table);
      if (hasRls === undefined) {
        results.push({
          id: `rls.${table}-missing`,
          name: `RLS: ${table}`,
          status: "warn",
          message: `Table "${table}" not found in database`,
        });
      } else if (!hasRls) {
        results.push({
          id: `rls.${table}-disabled`,
          name: `RLS: ${table}`,
          status: "fail",
          message: `RLS is DISABLED on "${table}" — data may be publicly accessible`,
        });
      } else {
        results.push({
          id: `rls.${table}-ok`,
          name: `RLS: ${table}`,
          status: "pass",
          message: `RLS enabled on "${table}"`,
        });
      }
    }
  } else {
    // Couldn't get RLS info, report as warning
    for (const table of criticalTables) {
      results.push({
        id: `rls.${table}-unknown`,
        name: `RLS: ${table}`,
        status: "warn",
        message: `Could not determine RLS status for "${table}"`,
      });
    }
  }

  return results;
};

/** Check for orphan reactions (place_id references non-existent place) */
const checkOrphanReactions = async (): Promise<DbCheckResult> => {
  const { count, error } = await supabaseAdmin!
    .from("reactions")
    .select("id", { count: "exact", head: true })
    .is("place_id", null);

  if (error) {
    // Try a different approach — count reactions whose place doesn't exist
    let orphans: unknown = null;
    try {
      const result = await supabaseAdmin!.rpc("exec_sql", {
        query: `
          SELECT COUNT(*) as cnt FROM reactions r
          LEFT JOIN places p ON r.place_id = p.id
          WHERE p.id IS NULL
        `,
      });
      orphans = result.data;
    } catch {
      orphans = null;
    }

    const orphanCount =
      Array.isArray(orphans) && (orphans[0] as { cnt?: number })?.cnt
        ? Number((orphans[0] as { cnt: number }).cnt)
        : null;

    if (orphanCount === null) {
      return {
        id: "orphan.reactions-unknown",
        name: "Orphan reactions",
        status: "warn",
        message: "Could not verify orphan reactions — query not accessible",
      };
    }

    return orphanCount > 0
      ? {
          id: "orphan.reactions",
          name: "Orphan reactions",
          status: "warn",
          message: `${orphanCount} reaction(s) reference non-existent places`,
          count: orphanCount,
        }
      : {
          id: "orphan.reactions-ok",
          name: "Orphan reactions",
          status: "pass",
          message: "No orphan reactions found",
        };
  }

  if (count && count > 0) {
    return {
      id: "orphan.reactions-null",
      name: "Orphan reactions",
      status: "warn",
      message: `${count} reaction(s) have NULL place_id`,
      count,
    };
  }

  return {
    id: "orphan.reactions-ok",
    name: "Orphan reactions",
    status: "pass",
    message: "No orphan reactions found",
  };
};

/** Check for orphan place_photos */
const checkOrphanPhotos = async (): Promise<DbCheckResult> => {
  const { count, error } = await supabaseAdmin!
    .from("place_photos")
    .select("id", { count: "exact", head: true })
    .is("place_id", null);

  if (error) {
    return {
      id: "orphan.photos-unknown",
      name: "Orphan photos",
      status: "warn",
      message: "Could not query place_photos — table may not exist",
    };
  }

  if (count && count > 0) {
    return {
      id: "orphan.photos-null",
      name: "Orphan photos",
      status: "warn",
      message: `${count} photo(s) have NULL place_id`,
      count,
    };
  }

  return {
    id: "orphan.photos-ok",
    name: "Orphan photos",
    status: "pass",
    message: "No orphan photos found",
  };
};

/** Check places missing both lat/lng AND google_place_id */
const checkPlacesWithoutLocation = async (): Promise<DbCheckResult> => {
  const { count, error } = await supabaseAdmin!
    .from("places")
    .select("id", { count: "exact", head: true })
    .is("lat", null)
    .is("lng", null)
    .is("google_place_id", null);

  if (error) {
    return {
      id: "location.check-error",
      name: "Places without location",
      status: "warn",
      message: `Could not query: ${error.message}`,
    };
  }

  if (count && count > 0) {
    return {
      id: "location.missing",
      name: "Places without location",
      status: "warn",
      message: `${count} place(s) have no lat/lng AND no google_place_id`,
      count,
    };
  }

  return {
    id: "location.ok",
    name: "Places with location",
    status: "pass",
    message: "All places have at least lat/lng or google_place_id",
  };
};

/** Check for invalid city_id references */
const checkInvalidCityRefs = async (): Promise<DbCheckResult> => {
  // Count places where city_id is set but doesn't exist in cities table
  const { data: placesWithCity, error: fetchError } = await supabaseAdmin!
    .from("places")
    .select("id, city_id")
    .not("city_id", "is", null)
    .limit(1000);

  if (fetchError) {
    return {
      id: "city.check-error",
      name: "City references",
      status: "warn",
      message: `Could not query places: ${fetchError.message}`,
    };
  }

  if (!placesWithCity || placesWithCity.length === 0) {
    return {
      id: "city.no-refs",
      name: "City references",
      status: "pass",
      message: "No places with city_id to verify",
    };
  }

  const cityIds = [...new Set(placesWithCity.map((p) => p.city_id).filter(Boolean))];
  const { data: cities, error: cityError } = await supabaseAdmin!
    .from("cities")
    .select("id")
    .in("id", cityIds);

  if (cityError) {
    return {
      id: "city.cities-error",
      name: "City references",
      status: "warn",
      message: `Could not query cities table: ${cityError.message}`,
    };
  }

  const validCityIds = new Set((cities || []).map((c) => c.id));
  const invalidRefs = placesWithCity.filter(
    (p) => p.city_id && !validCityIds.has(p.city_id),
  );

  if (invalidRefs.length > 0) {
    return {
      id: "city.invalid-refs",
      name: "City references",
      status: "warn",
      message: `${invalidRefs.length} place(s) reference non-existent city_id`,
      count: invalidRefs.length,
    };
  }

  return {
    id: "city.refs-ok",
    name: "City references",
    status: "pass",
    message: `All ${placesWithCity.length} city_id references are valid`,
  };
};

/** Check for tags in places that don't exist in tags table */
const checkOrphanTags = async (): Promise<DbCheckResult> => {
  // Get all tags from tags table
  const { data: knownTags, error: tagsError } = await supabaseAdmin!
    .from("tags")
    .select("name");

  if (tagsError) {
    return {
      id: "tags.table-error",
      name: "Tag consistency",
      status: "warn",
      message: `Could not query tags table: ${tagsError.message}`,
    };
  }

  const knownTagNames = new Set(
    (knownTags || []).map((t) => (t.name as string).trim().toLowerCase()),
  );

  // Get all unique tags from places
  const { data: places, error: placesError } = await supabaseAdmin!
    .from("places")
    .select("tags")
    .not("tags", "is", null)
    .limit(2000);

  if (placesError) {
    return {
      id: "tags.places-error",
      name: "Tag consistency",
      status: "warn",
      message: `Could not query places: ${placesError.message}`,
    };
  }

  const usedTags = new Set<string>();
  for (const place of places || []) {
    if (Array.isArray(place.tags)) {
      for (const tag of place.tags) {
        if (typeof tag === "string" && tag.trim()) {
          usedTags.add(tag.trim());
        }
      }
    }
  }

  const orphanTags = [...usedTags].filter(
    (t) => !knownTagNames.has(t.toLowerCase()),
  );

  if (orphanTags.length > 0) {
    return {
      id: "tags.orphan",
      name: "Orphan tags",
      status: "warn",
      message: `${orphanTags.length} tag(s) used in places but missing from tags table: ${orphanTags.slice(0, 10).join(", ")}${orphanTags.length > 10 ? "..." : ""}`,
      count: orphanTags.length,
    };
  }

  return {
    id: "tags.consistent",
    name: "Tag consistency",
    status: "pass",
    message: `All ${usedTags.size} tags used in places exist in tags table`,
  };
};

// ---------------------------------------------------------------------------
// Service availability checks
// ---------------------------------------------------------------------------

/** Check Supabase DB connectivity */
const checkSupabaseDb = async (): Promise<ServiceCheckResult> => {
  try {
    const start = Date.now();
    const { error } = await supabaseAdmin!
      .from("profiles")
      .select("id", { count: "exact", head: true });
    const latency = Date.now() - start;

    if (error) {
      return {
        id: "service.supabase-db",
        name: "Supabase DB",
        status: "fail",
        message: `Connection error: ${error.message}`,
      };
    }

    return {
      id: "service.supabase-db",
      name: "Supabase DB",
      status: "pass",
      message: `Connected (${latency}ms)`,
    };
  } catch {
    return {
      id: "service.supabase-db",
      name: "Supabase DB",
      status: "fail",
      message: "Connection failed — unreachable",
    };
  }
};

/** Check Supabase Storage availability */
const checkSupabaseStorage = async (): Promise<ServiceCheckResult> => {
  try {
    const { data, error } = await supabaseAdmin!.storage.listBuckets();

    if (error) {
      return {
        id: "service.supabase-storage",
        name: "Supabase Storage",
        status: "fail",
        message: `Storage error: ${error.message}`,
      };
    }

    const bucketNames = (data || []).map((b) => b.name).join(", ");
    return {
      id: "service.supabase-storage",
      name: "Supabase Storage",
      status: "pass",
      message: `Available — buckets: ${bucketNames || "none"}`,
    };
  } catch {
    return {
      id: "service.supabase-storage",
      name: "Supabase Storage",
      status: "fail",
      message: "Storage unreachable",
    };
  }
};

/** Check Supabase Auth service */
const checkSupabaseAuth = async (): Promise<ServiceCheckResult> => {
  try {
    const { data, error } = await supabaseAdmin!.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    if (error) {
      return {
        id: "service.supabase-auth",
        name: "Supabase Auth",
        status: "fail",
        message: `Auth error: ${error.message}`,
      };
    }

    return {
      id: "service.supabase-auth",
      name: "Supabase Auth",
      status: "pass",
      message: `Auth service operational (${data.users.length >= 0 ? "ok" : "unknown"})`,
    };
  } catch {
    return {
      id: "service.supabase-auth",
      name: "Supabase Auth",
      status: "fail",
      message: "Auth service unreachable",
    };
  }
};

/** Check Google Maps API key presence */
const checkGoogleMaps = (): ServiceCheckResult => {
  const clientKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const serverKey = process.env.GOOGLE_MAPS_API_KEY;

  if (clientKey) {
    return {
      id: "service.google-maps",
      name: "Google Maps API",
      status: "pass",
      message: `Client key configured${serverKey ? ", server key configured" : ""}`,
    };
  }

  return {
    id: "service.google-maps",
    name: "Google Maps API",
    status: "warn",
    message: "Client API key not configured",
  };
};

/** Check OpenAI API key presence */
const checkOpenAi = (): ServiceCheckResult => {
  const key = process.env.OPENAI_API_KEY;

  if (key) {
    return {
      id: "service.openai",
      name: "OpenAI API",
      status: "pass",
      message: "API key configured",
    };
  }

  return {
    id: "service.openai",
    name: "OpenAI API",
    status: "warn",
    message: "API key not configured — AI features disabled",
  };
};

// ---------------------------------------------------------------------------
// Environment variable audit
// ---------------------------------------------------------------------------

const checkEnvVars = (): EnvStatus => {
  const vars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAP_ID",
    "OPENAI_API_KEY",
  ];

  const result: EnvStatus = {};
  for (const v of vars) {
    result[v] = !!process.env[v];
  }
  return result;
};

// ---------------------------------------------------------------------------
// Data stats
// ---------------------------------------------------------------------------

const getDataStats = async (): Promise<DataStats> => {
  const tables = [
    "places",
    "profiles",
    "collections",
    "tags",
    "reactions",
    "comments",
    "place_photos",
    "cities",
  ] as const;

  const results = await Promise.all(
    tables.map(async (table) => {
      const { count, error } = await supabaseAdmin!
        .from(table)
        .select("id", { count: "exact", head: true });
      return [table, error ? null : (count ?? 0)] as const;
    }),
  );

  const stats: DataStats = {};
  for (const [table, count] of results) {
    stats[table] = count;
  }
  return stats;
};

// ---------------------------------------------------------------------------
// GET /api/health — Admin-only runtime health check
// ---------------------------------------------------------------------------

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  // Auth gate
  if (!supabaseAdmin) {
    return NextResponse.json(
      {
        error: "SUPABASE_SERVICE_ROLE_KEY is required for health checks",
      },
      { status: 500 },
    );
  }

  const isAdmin = await authenticateAdmin(request);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized — admin access required" },
      { status: 401 },
    );
  }

  // Run all checks in parallel
  const [
    rlsResults,
    orphanReactions,
    orphanPhotos,
    locationCheck,
    cityRefCheck,
    tagCheck,
    supabaseDbCheck,
    supabaseStorageCheck,
    supabaseAuthCheck,
    stats,
  ] = await Promise.all([
    checkRls(),
    checkOrphanReactions(),
    checkOrphanPhotos(),
    checkPlacesWithoutLocation(),
    checkInvalidCityRefs(),
    checkOrphanTags(),
    checkSupabaseDb(),
    checkSupabaseStorage(),
    checkSupabaseAuth(),
    getDataStats(),
  ]);

  // Synchronous checks
  const googleMapsCheck = checkGoogleMaps();
  const openAiCheck = checkOpenAi();
  const env = checkEnvVars();

  const checks: DbCheckResult[] = [
    ...rlsResults,
    orphanReactions,
    orphanPhotos,
    locationCheck,
    cityRefCheck,
    tagCheck,
  ];

  const services: ServiceCheckResult[] = [
    supabaseDbCheck,
    supabaseStorageCheck,
    supabaseAuthCheck,
    googleMapsCheck,
    openAiCheck,
  ];

  const allStatuses = [
    ...checks.map((c) => c.status),
    ...services.map((s) => s.status),
  ];
  const hasFailures = allStatuses.includes("fail");
  const hasWarnings = allStatuses.includes("warn");

  const report: DbHealthReport = {
    status: hasFailures ? "red" : hasWarnings ? "yellow" : "green",
    timestamp: new Date().toISOString(),
    checks,
    services,
    env,
    stats,
  };

  return NextResponse.json(report);
};
