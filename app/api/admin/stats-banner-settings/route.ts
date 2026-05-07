import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/app/lib/logger";

/**
 * /api/admin/stats-banner-settings
 * --------------------------------
 * GET  — отдаёт текущие настройки баннера (admin-only).
 *        Публичные клиенты читают settings напрямую через RLS на app_settings,
 *        этот эндпоинт нужен админке, чтобы убедиться в правах и в случае
 *        отсутствия строки получить дефолты.
 * POST — сохраняет настройки в app_settings(id='stats_banner').
 *        Использует service-role клиент, проверяет is_admin / role='admin'.
 *
 * Образец: app/api/admin/premium-modal-settings/route.ts (тот же паттерн).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is required for admin routes. Set it in your environment. Do not use NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}
if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing Supabase configuration. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for admin routes."
  );
}

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const SETTINGS_ID = "stats_banner";

const METRIC_KEYS = ["users", "locations", "services", "experiences"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

type MetricSettings = { enabled: boolean; manual: number | null; label: string };
type Settings = { enabled: boolean; metrics: Record<MetricKey, MetricSettings> };

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  metrics: {
    users: { enabled: true, manual: null, label: "explorers" },
    locations: { enabled: true, manual: null, label: "locations" },
    services: { enabled: true, manual: null, label: "services" },
    experiences: { enabled: true, manual: null, label: "experiences" },
  },
};

/**
 * Мягкая валидация: чистим вход до известной формы. Любые лишние поля
 * молча отбрасываем, неверные типы заменяем дефолтами.
 */
function sanitizeSettings(input: unknown): Settings {
  if (!input || typeof input !== "object") return DEFAULT_SETTINGS;
  const raw = input as Record<string, unknown>;
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled;
  const rawMetrics = (raw.metrics as Record<string, unknown> | undefined) ?? {};
  const metrics = { ...DEFAULT_SETTINGS.metrics };
  METRIC_KEYS.forEach((k: MetricKey) => {
    const m = rawMetrics[k];
    if (m && typeof m === "object") {
      const mr = m as Record<string, unknown>;
      const manualRaw = mr.manual;
      const manual: number | null =
        manualRaw === null || manualRaw === undefined
          ? null
          : Number.isFinite(Number(manualRaw))
            ? Math.max(0, Math.floor(Number(manualRaw)))
            : null;
      metrics[k] = {
        enabled: typeof mr.enabled === "boolean" ? mr.enabled : metrics[k].enabled,
        manual,
        label:
          typeof mr.label === "string" && mr.label.trim().length > 0
            ? mr.label.trim().slice(0, 40)
            : metrics[k].label,
      };
    }
  });
  return { enabled, metrics };
}

async function requireAdmin(request: NextRequest) {
  if (!supabaseAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Supabase admin client is not configured." },
        { status: 500 }
      ),
    };
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }
  const p = profile as { is_admin: boolean | null; role: string | null };
  if (!p.is_admin && p.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: user.id, admin: supabaseAdmin };
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;

    const { data, error } = await gate.admin
      .from("app_settings")
      .select("settings")
      .eq("id", SETTINGS_ID)
      .single();

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "PGRST116" || error.message?.includes("does not exist")) {
        // Нет строки или нет таблицы — отдаём дефолты, чтобы UI не падал.
        return NextResponse.json({ settings: DEFAULT_SETTINGS });
      }
      console.error("[stats-banner-settings] GET error:", error);
      return NextResponse.json({ settings: DEFAULT_SETTINGS });
    }

    const row = data as { settings: unknown } | null;
    return NextResponse.json({
      settings: row?.settings ? sanitizeSettings(row.settings) : DEFAULT_SETTINGS,
    });
  } catch (err) {
    console.error("[stats-banner-settings] GET exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if (!gate.ok) return gate.response;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const settings = sanitizeSettings((body as { settings?: unknown }).settings);

    const { data, error } = await gate.admin
      .from("app_settings")
      .upsert(
        {
          id: SETTINGS_ID,
          settings,
          updated_at: new Date().toISOString(),
          updated_by: gate.userId,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      logger.warn("[stats-banner-settings] upsert error:", {
        code: error.code,
        message: error.message,
        hint: (error as { hint?: string }).hint,
      });
      // Понятные сообщения для самых частых причин.
      if (error.code === "PGRST116" || error.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            error:
              "Table app_settings is missing. Run the existing premium-modal-settings migration to create it.",
            code: "TABLE_NOT_FOUND",
          },
          { status: 500 }
        );
      }
      if (
        error.code === "42501" ||
        error.message?.includes("row-level security") ||
        error.message?.includes("violates row-level security")
      ) {
        return NextResponse.json(
          {
            error: "Permission denied (RLS). Check SUPABASE_SERVICE_ROLE_KEY.",
            code: "RLS_VIOLATION",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: "Failed to save settings", details: error.message },
        { status: 500 }
      );
    }

    const row = data as { settings: unknown } | null;
    return NextResponse.json({
      success: true,
      settings: row?.settings ? sanitizeSettings(row.settings) : settings,
    });
  } catch (err) {
    console.error("[stats-banner-settings] POST exception:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
