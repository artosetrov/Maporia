"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import {
  signInWithPassword,
  requestPasswordReset,
  updatePassword,
  type MappedAuthError,
} from "@/app/lib/auth";
import { getSafeRedirectFrom, getAuthUrl } from "@/app/lib/authRedirect";
import Icon from "../Icon";
import PasswordField from "./PasswordField";
import PasswordlessAuthPanel from "./PasswordlessAuthPanel";

export type AuthMode = "login" | "signup" | "reset" | "updatePassword";

type AuthFormProps = {
  mode: AuthMode;
  /** Куда вернуть юзера после успешного входа/подтверждения. Из ?from=. */
  redirectAfter?: string;
  /** Password is now a secondary legacy path for existing users. */
  initialMethod?: "passwordless" | "password";
};

const TITLE: Record<AuthMode, string> = {
  login: "Continue with password",
  signup: "Log in or sign up",
  reset: "Reset your password",
  updatePassword: "Set a new password",
};

const SUBTITLE: Record<AuthMode, string> = {
  login: "For existing accounts that already use a password.",
  signup: "Use Google or your email to continue.",
  reset: "Enter your email and we'll send you a reset link.",
  updatePassword: "Choose a new password for your account.",
};

const SUBMIT_LABEL: Record<AuthMode, string> = {
  login: "Sign in",
  signup: "Continue",
  reset: "Send reset link",
  updatePassword: "Update password",
};

export default function AuthForm({
  mode,
  redirectAfter = "/",
  initialMethod = "passwordless",
}: AuthFormProps) {
  const router = useRouter();
  const safeRedirect = getSafeRedirectFrom(redirectAfter) ?? "/";
  const resetHref =
    safeRedirect === "/"
      ? "/auth/reset"
      : `/auth/reset?from=${encodeURIComponent(safeRedirect)}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MappedAuthError | null>(null);
  const [authMethod, setAuthMethod] = useState<"passwordless" | "password">(initialMethod);

  /** "Письмо отправлено" — для reset. */
  const [sentKind, setSentKind] = useState<"reset" | null>(null);
  /** "Пароль обновлён" — для updatePassword, перед редиректом. */
  const [updateDone, setUpdateDone] = useState(false);

  // Перед рендером updatePassword нужно убедиться, что есть recovery-сессия.
  // Если её нет — юзер пришёл сюда не по ссылке, отправляем на /auth/reset.
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(
    mode === "updatePassword" ? null : true
  );

  useEffect(() => {
    if (mode !== "updatePassword") return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // PASSWORD_RECOVERY срабатывает когда юзер только что прошёл по reset-ссылке.
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecoverySession(true);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [mode]);

  useEffect(() => {
    setAuthMethod(initialMethod);
  }, [initialMethod]);

  // password login: после успеха onAuthStateChange сетит сессию — редиректим.
  useEffect(() => {
    if (mode !== "login" || authMethod !== "password") return;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !sentKind) {
        router.replace(safeRedirect);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [authMethod, mode, router, safeRedirect, sentKind]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "login") {
      const result = await signInWithPassword({ email, password });
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Успех — onAuthStateChange сработает, useEffect выше редиректит.
      return;
    }

    if (mode === "reset") {
      const result = await requestPasswordReset({ email, redirectAfterUpdate: safeRedirect });
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSentKind("reset");
      return;
    }

    if (mode === "updatePassword") {
      if (password.length < 8) {
        setLoading(false);
        setError({ code: "weak_password", message: "Use at least 8 characters." });
        return;
      }
      if (password !== confirmPassword) {
        setLoading(false);
        setError({ code: "weak_password", message: "Passwords don't match." });
        return;
      }
      const result = await updatePassword({ newPassword: password });
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUpdateDone(true);
      // Небольшая пауза, чтобы юзер увидел подтверждение.
      setTimeout(() => router.replace(safeRedirect), 1200);
      return;
    }
  }

  // ── Состояние "письмо отправлено" — общий экран ──
  if (sentKind) {
    return (
      <Card>
        <Header />
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#ECEEE4] flex items-center justify-center mb-4">
            <Icon name="mail" size={32} className="text-[#8F9E4F]" />
          </div>
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">Check your inbox</h2>
          <p className="text-sm text-[#6F7A5A]">
            We sent it to <strong className="text-[#1F2A1F]">{email}</strong>.
          </p>
          <p className="text-sm text-[#A8B096] mt-2">Click the reset link in your email to choose a new password.</p>
          <button
            onClick={() => {
              setSentKind(null);
              setError(null);
            }}
            className="mt-6 text-[#8F9E4F] text-sm font-medium hover:text-[#556036] transition-colors"
          >
            Use a different email
          </button>
        </div>
      </Card>
    );
  }

  if ((mode === "login" || mode === "signup") && authMethod === "passwordless") {
    return (
      <Card>
        <Header />
        <PasswordlessAuthPanel
          redirectPath={safeRedirect}
          variant="default"
          onUsePassword={mode === "login" ? () => setAuthMethod("password") : undefined}
        />
      </Card>
    );
  }

  // ── updatePassword: проверка recovery-сессии ──
  if (mode === "updatePassword" && hasRecoverySession === null) {
    return (
      <Card>
        <Header />
        <div className="h-11 bg-[#ECEEE4] rounded-xl animate-pulse" />
      </Card>
    );
  }
  if (mode === "updatePassword" && hasRecoverySession === false) {
    return (
      <Card>
        <Header />
        <p className="text-sm text-[#1F2A1F] mb-4">
          This link has expired or is invalid. Request a new password reset email.
        </p>
        <Link
          href={resetHref}
          className="block w-full h-11 rounded-xl bg-[#8F9E4F] text-white font-medium text-sm flex items-center justify-center hover:brightness-110 active:brightness-90 transition-all"
        >
          Send a new reset link
        </Link>
      </Card>
    );
  }

  // ── updatePassword: подтверждение ──
  if (mode === "updatePassword" && updateDone) {
    return (
      <Card>
        <Header />
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#ECEEE4] flex items-center justify-center mb-4">
            <Icon name="check" size={32} className="text-[#8F9E4F]" />
          </div>
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
            Password updated
          </h2>
          <p className="text-sm text-[#6F7A5A]">Redirecting…</p>
        </div>
      </Card>
    );
  }

  // ── Основная форма ──
  return (
    <Card>
      <Header />

      <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">{TITLE[mode]}</h2>
      <p className="text-sm text-[#6F7A5A] mb-6">{SUBTITLE[mode]}</p>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode !== "updatePassword" && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@email.com"
              required
              disabled={loading}
              className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-white px-4 text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] transition-colors disabled:opacity-50"
            />
          </div>
        )}

        {(mode === "login" || mode === "updatePassword") && (
          <PasswordField
            value={password}
            onChange={setPassword}
            label={mode === "updatePassword" ? "New password" : "Password"}
            placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "login" ? undefined : 8}
            hint={mode === "updatePassword" ? "8+ characters" : undefined}
            disabled={loading}
          />
        )}

        {mode === "updatePassword" && (
          <PasswordField
            value={confirmPassword}
            onChange={setConfirmPassword}
            label="Confirm password"
            placeholder="Repeat password"
            autoComplete="new-password"
            minLength={8}
            disabled={loading}
          />
        )}

        {error && (
          <div
            className="rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 px-4 py-3 text-sm text-[#C96A5B]"
            role="alert"
          >
            {error.message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl bg-[#8F9E4F] text-white font-medium hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Please wait…" : SUBMIT_LABEL[mode]}
        </button>

        {mode === "login" && (
          <div className="flex justify-end">
            <Link
              href={resetHref}
              className="text-xs text-[#6F7A5A] hover:text-[#1F2A1F] transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        )}
      </form>

      {/* Нижняя ссылка-переключатель */}
      <div className="mt-6 text-center text-sm text-[#6F7A5A]">
        {mode === "login" && (
          <button
            type="button"
            onClick={() => setAuthMethod("passwordless")}
            className="text-[#8F9E4F] hover:text-[#556036] font-medium"
          >
            Continue with email code
          </button>
        )}
        {mode === "reset" && (
          <Link href={getAuthUrl(safeRedirect)} className="text-[#8F9E4F] hover:text-[#556036] font-medium">
            Back to sign in
          </Link>
        )}
      </div>
    </Card>
  );
}

// ── Вёрстка-обёртка ──

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 relative"
        style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
      >
        {children}
      </div>
    </main>
  );
}

function Header() {
  return (
    <div className="flex justify-start mb-6">
      <div className="h-10 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_maporia1.svg" alt="Maporia" className="h-8 w-auto" />
      </div>
    </div>
  );
}
