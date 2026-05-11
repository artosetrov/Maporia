/**
 * POST /api/admin/users/[id]/auth
 *
 * Admin-only endpoint для управления учётными данными пользователя:
 *  - action="set_email"        → меняем email сразу (email_confirm: true).
 *  - action="set_password"     → задаём новый пароль вручную (admin.updateUserById).
 *  - action="send_reset_link"  → отправляем письмо со ссылкой восстановления пароля.
 *  - action="send_magic_link"  → отправляем magic-link для входа без пароля.
 *
 * Auth-flow стандартный admin-гейт: Bearer token из admin-сессии → проверяем
 * profiles.is_admin / role='admin' через service-role-клиент.
 *
 * Безопасность:
 *  - Запрещено менять email/пароль другому админу (доп. защита от захвата).
 *  - Запрещено менять собственный email/пароль через этот эндпоинт
 *    (для своих данных есть стандартный flow в /profile).
 *  - send_reset_link / send_magic_link для других админов разрешены —
 *    они не дают мгновенного доступа без email-подтверждения.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAppRedirectOrigin } from "@/app/lib/stripeRedirectOrigin";

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

type Action = "set_email" | "set_password" | "send_reset_link" | "send_magic_link";

type Body = {
  action?: Action;
  email?: string;       // for set_email
  password?: string;    // for set_password
};

const MUTATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MUTATION_RATE_LIMIT_MAX_REQUESTS = 12;
const mutationRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Минимальная валидация — серверу не нужна полная RFC5321,
// только защита от очевидной дряни.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function checkMutationRateLimit(key: string): boolean {
  const now = Date.now();
  const limit = mutationRateLimitMap.get(key);

  if (!limit || now > limit.resetAt) {
    mutationRateLimitMap.set(key, { count: 1, resetAt: now + MUTATION_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (limit.count >= MUTATION_RATE_LIMIT_MAX_REQUESTS) return false;

  limit.count++;
  return true;
}

function buildAdminAuthRedirect(request: NextRequest, nextPath: string): string {
  const origin = getAppRedirectOrigin(request);
  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

/**
 * GET /api/admin/users/[id]/auth — admin-only, возвращает базовые auth-данные
 * таргета (email, email_confirmed_at, last_sign_in_at). Используется UI-модалкой,
 * чтобы prefill-нуть email-поле перед редактированием.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured.",
      500,
      "MISSING_CONFIG"
    );
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: callerAuth, error: callerAuthErr } = await supabaseAdmin.auth.getUser(token);
  const callerUser = callerAuth?.user;
  if (callerAuthErr || !callerUser) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", callerUser.id)
    .single<{ is_admin: boolean | null; role: string | null }>();
  if (!callerProfile?.is_admin && callerProfile?.role !== "admin") {
    return jsonError("Forbidden", 403, "NOT_ADMIN");
  }

  const { id: targetUserId } = await context.params;
  const { data: targetData, error: targetErr } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (targetErr || !targetData?.user) {
    return jsonError("Target user not found", 404, "TARGET_NOT_FOUND");
  }
  const u = targetData.user;
  return NextResponse.json({
    id: u.id,
    email: u.email ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at ?? null,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!supabaseAdmin) {
    return jsonError(
      "Supabase admin client is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      500,
      "MISSING_CONFIG"
    );
  }

  // 1. Auth gate (Bearer token из admin-сессии)
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: callerAuth, error: callerAuthErr } = await supabaseAdmin.auth.getUser(token);
  const callerUser = callerAuth?.user;
  if (callerAuthErr || !callerUser) {
    return jsonError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const { data: callerProfile, error: callerProfileErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", callerUser.id)
    .single<{ is_admin: boolean | null; role: string | null }>();

  if (callerProfileErr || !callerProfile) {
    return jsonError("Profile not found", 404, "PROFILE_MISSING");
  }
  if (!callerProfile.is_admin && callerProfile.role !== "admin") {
    return jsonError("Forbidden", 403, "NOT_ADMIN");
  }

  // 2. Параметры
  const { id: targetUserId } = await context.params;
  if (!targetUserId) return jsonError("Missing user id", 400, "BAD_REQUEST");

  const body = (await request.json().catch(() => ({}))) as Body;
  const { action } = body;
  if (!action) return jsonError("action is required", 400, "BAD_REQUEST");

  if (!checkMutationRateLimit(`${callerUser.id}:${action}`)) {
    return jsonError(
      "Too many admin auth requests. Please wait a minute and try again.",
      429,
      "RATE_LIMITED"
    );
  }

  // 3. Резолвим таргета
  const { data: targetAuthData, error: targetAuthErr } =
    await supabaseAdmin.auth.admin.getUserById(targetUserId);
  const targetUser = targetAuthData?.user;
  if (targetAuthErr || !targetUser) {
    return jsonError("Target user not found", 404, "TARGET_NOT_FOUND");
  }

  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", targetUserId)
    .single<{ is_admin: boolean | null; role: string | null }>();

  const targetIsAdmin = !!(targetProfile?.is_admin || targetProfile?.role === "admin");
  const isSelf = targetUserId === callerUser.id;

  // 4. Action dispatch
  switch (action) {
    case "set_email": {
      const email = (body.email || "").trim().toLowerCase();
      if (!email || !isValidEmail(email)) {
        return jsonError("Valid email is required", 400, "BAD_EMAIL");
      }
      if (isSelf) {
        return jsonError(
          "Use your profile settings to change your own email",
          400,
          "SELF_FORBIDDEN"
        );
      }
      if (targetIsAdmin) {
        return jsonError(
          "Cannot change email of another admin",
          403,
          "TARGET_IS_ADMIN"
        );
      }

      const { data: updateData, error: updateErr } =
        await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          email,
          email_confirm: true,
        });

      if (updateErr) {
        const msg = updateErr.message || "Failed to update email";
        // Дублирующийся email Supabase возвращает 422/400.
        const status = /already.*exists|duplicate/i.test(msg) ? 409 : 500;
        return jsonError(msg, status, "UPDATE_FAILED");
      }

      return NextResponse.json({
        ok: true,
        action,
        email: updateData?.user?.email ?? email,
      });
    }

    case "set_password": {
      const password = body.password || "";
      if (password.length < 8) {
        return jsonError(
          "Password must be at least 8 characters",
          400,
          "BAD_PASSWORD"
        );
      }
      if (isSelf) {
        return jsonError(
          "Use your profile settings to change your own password",
          400,
          "SELF_FORBIDDEN"
        );
      }
      if (targetIsAdmin) {
        return jsonError(
          "Cannot change password of another admin",
          403,
          "TARGET_IS_ADMIN"
        );
      }

      const { error: updateErr } =
        await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          password,
        });

      if (updateErr) {
        return jsonError(
          updateErr.message || "Failed to update password",
          500,
          "UPDATE_FAILED"
        );
      }

      return NextResponse.json({ ok: true, action });
    }

    case "send_reset_link": {
      const email = targetUser.email;
      if (!email) {
        return jsonError("Target user has no email", 400, "TARGET_NO_EMAIL");
      }

      // Совпадает со стандартным flow в lib/auth/requestPasswordReset.ts:
      // ссылка ведёт через /auth/callback на /auth/update-password.
      const redirectTo = buildAdminAuthRedirect(request, "/auth/update-password");

      const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(
        email,
        { redirectTo }
      );

      if (resetErr) {
        return jsonError(
          resetErr.message || "Failed to send reset link",
          500,
          "RESET_FAILED"
        );
      }

      return NextResponse.json({ ok: true, action, email });
    }

    case "send_magic_link": {
      const email = targetUser.email;
      if (!email) {
        return jsonError("Target user has no email", 400, "TARGET_NO_EMAIL");
      }

      // Magic link → /auth/callback (там Supabase обменяет hash-токен на сессию).
      const redirectTo = buildAdminAuthRedirect(request, "/");

      // shouldCreateUser:false — не создавать нового пользователя, если targetUser
      // вдруг был удалён между resolve и отправкой.
      const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });

      if (otpErr) {
        return jsonError(
          otpErr.message || "Failed to send magic link",
          500,
          "MAGIC_FAILED"
        );
      }

      return NextResponse.json({ ok: true, action, email });
    }

    default:
      return jsonError(`Unknown action: ${action}`, 400, "BAD_ACTION");
  }
}
