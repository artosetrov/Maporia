/**
 * Маппинг низкоуровневых ошибок Supabase Auth в структурированные коды
 * для UI. Никаких "Invalid login credentials" наружу — только понятные
 * сообщения и enum-коды для условного рендера (например, показать кнопку
 * "Resend confirmation").
 */
import type { AuthError } from "@supabase/supabase-js";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "weak_password"
  | "rate_limited"
  | "invalid_email"
  | "network"
  | "unknown";

export type MappedAuthError = {
  code: AuthErrorCode;
  message: string;
};

export function mapAuthError(error: AuthError | Error | null | undefined): MappedAuthError | null {
  if (!error) return null;

  const raw = (error.message || "").toLowerCase();
  // Supabase 2.x кладёт код в `error.code`, но у старых билдов его нет — fallback на текст.
  const code = (error as AuthError & { code?: string }).code ?? "";

  if (code === "invalid_credentials" || raw.includes("invalid login credentials")) {
    return {
      code: "invalid_credentials",
      message: "Wrong email or password.",
    };
  }
  if (code === "email_not_confirmed" || raw.includes("email not confirmed")) {
    return {
      code: "email_not_confirmed",
      message: "Please confirm your email before signing in.",
    };
  }
  if (code === "user_already_exists" || raw.includes("user already registered") || raw.includes("already exists")) {
    return {
      code: "user_already_exists",
      message: "An account with this email already exists. Try signing in instead.",
    };
  }
  if (code === "weak_password" || raw.includes("password should be") || raw.includes("password is too")) {
    return {
      code: "weak_password",
      message: "Password is too weak. Use at least 8 characters.",
    };
  }
  if (code === "over_email_send_rate_limit" || raw.includes("rate limit") || raw.includes("too many requests")) {
    return {
      code: "rate_limited",
      message: "Too many attempts. Please wait a minute and try again.",
    };
  }
  if (code === "validation_failed" || raw.includes("invalid email")) {
    return {
      code: "invalid_email",
      message: "Please enter a valid email address.",
    };
  }
  if (raw.includes("failed to fetch") || raw.includes("network")) {
    return {
      code: "network",
      message: "Network error. Check your connection and try again.",
    };
  }

  return {
    code: "unknown",
    message: error.message || "Something went wrong. Please try again.",
  };
}
