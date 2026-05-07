"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, getAuthRedirectUrl } from "@/app/lib/supabase";
import {
  signUp,
  signInWithPassword,
  requestPasswordReset,
  updatePassword,
  resendConfirmation,
  sendMagicLink,
  type MappedAuthError,
} from "@/app/lib/auth";
import { getSafeRedirectFrom, getSignupUrl, getAuthUrl } from "@/app/lib/authRedirect";
import Icon from "../Icon";
import PasswordField from "./PasswordField";

export type AuthMode = "login" | "signup" | "reset" | "updatePassword";

type AuthFormProps = {
  mode: AuthMode;
  /** Куда вернуть юзера после успешного входа/подтверждения. Из ?from=. */
  redirectAfter?: string;
};

const TITLE: Record<AuthMode, string> = {
  login: "Welcome back",
  signup: "Create your account",
  reset: "Reset your password",
  updatePassword: "Set a new password",
};

const SUBTITLE: Record<AuthMode, string> = {
  login: "Sign in to save hidden places and explore local gems",
  signup: "Save places you love. Discover hidden gems.",
  reset: "Enter your email and we'll send you a reset link.",
  updatePassword: "Choose a new password for your account.",
};

const SUBMIT_LABEL: Record<AuthMode, string> = {
  login: "Sign in",
  signup: "Create account",
  reset: "Send reset link",
  updatePassword: "Update password",
};

const RESEND_COOLDOWN_SEC = 60;

export default function AuthForm({ mode, redirectAfter = "/" }: AuthFormProps) {
  const router = useRouter();
  const safeRedirect = getSafeRedirectFrom(redirectAfter) ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [error, setError] = useState<MappedAuthError | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  /** "Письмо отправлено" — для signup, reset и magic link. */
  const [sentKind, setSentKind] = useState<"signup" | "reset" | "magic" | null>(null);
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

  // Cooldown timer для "Resend confirmation".
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // login/signup: после успеха onAuthStateChange сетит сессию — редиректим.
  useEffect(() => {
    if (mode === "reset" || mode === "updatePassword") return;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !sentKind) {
        router.replace(safeRedirect);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [mode, router, safeRedirect, sentKind]);

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

    if (mode === "signup") {
      if (password.length < 8) {
        setLoading(false);
        setError({ code: "weak_password", message: "Use at least 8 characters." });
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        setLoading(false);
        setError({ code: "weak_password", message: "Passwords don't match." });
        return;
      }
      const result = await signUp({ email, password, redirectAfterConfirm: safeRedirect });
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.needsEmailConfirmation) {
        setSentKind("signup");
      } else {
        router.replace(safeRedirect);
      }
      return;
    }

    if (mode === "reset") {
      const result = await requestPasswordReset({ email });
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

  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(`/auth/callback?next=${encodeURIComponent(safeRedirect)}`),
      },
    });
    if (oauthError) {
      setGoogleLoading(false);
      setError({
        code: "unknown",
        message:
          oauthError.message.includes("provider is not enabled") ||
          oauthError.message.includes("Unsupported provider")
            ? "Google authentication is not enabled. Please contact support."
            : oauthError.message,
      });
    }
    // При успехе браузер уйдёт на Google — loading не сбрасываем.
  }

  async function onMagicLink() {
    if (!email) {
      setError({ code: "invalid_email", message: "Enter your email first." });
      return;
    }
    setError(null);
    setMagicLoading(true);
    const result = await sendMagicLink({ email, redirectAfterClick: safeRedirect });
    setMagicLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentKind("magic");
  }

  async function onResendConfirmation() {
    if (!email || resendCooldown > 0) return;
    setError(null);
    const result = await resendConfirmation({ email, redirectAfterConfirm: safeRedirect });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SEC);
  }

  // ── Состояние "письмо отправлено" — общий экран ──
  if (sentKind) {
    const subject =
      sentKind === "signup"
        ? "Confirm your email"
        : sentKind === "reset"
        ? "Check your inbox"
        : "Magic link sent";
    const body =
      sentKind === "signup"
        ? "We sent a confirmation link. Click it to activate your account."
        : sentKind === "reset"
        ? "Click the reset link in your email to choose a new password."
        : "Click the link in your email to sign in.";
    return (
      <Card>
        <Header />
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#ECEEE4] flex items-center justify-center mb-4">
            <Icon name="mail" size={32} className="text-[#8F9E4F]" />
          </div>
          <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">{subject}</h2>
          <p className="text-sm text-[#6F7A5A]">
            We sent it to <strong className="text-[#1F2A1F]">{email}</strong>.
          </p>
          <p className="text-sm text-[#A8B096] mt-2">{body}</p>
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
          href="/auth/reset"
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

        {(mode === "login" || mode === "signup" || mode === "updatePassword") && (
          <PasswordField
            value={password}
            onChange={setPassword}
            label={mode === "updatePassword" ? "New password" : "Password"}
            placeholder={mode === "login" ? "Your password" : "At least 8 characters"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "login" ? undefined : 8}
            hint={mode === "signup" || mode === "updatePassword" ? "8+ characters" : undefined}
            disabled={loading}
          />
        )}

        {(mode === "signup" || mode === "updatePassword") && (
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
            {error.code === "email_not_confirmed" && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={onResendConfirmation}
                  disabled={resendCooldown > 0}
                  className="text-[#8F9E4F] hover:text-[#556036] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend confirmation email"}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full h-11 rounded-xl bg-[#8F9E4F] text-white font-medium hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Please wait…" : SUBMIT_LABEL[mode]}
        </button>

        {mode === "login" && (
          <div className="flex justify-end">
            <Link
              href="/auth/reset"
              className="text-xs text-[#6F7A5A] hover:text-[#1F2A1F] transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        )}
      </form>

      {/* Альтернативные методы — только для login и signup */}
      {(mode === "login" || mode === "signup") && (
        <>
          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-[#ECEEE4]" />
            <span className="px-3 text-xs text-[#A8B096]">or</span>
            <div className="flex-1 border-t border-[#ECEEE4]" />
          </div>

          <button
            type="button"
            onClick={onGoogle}
            disabled={loading || googleLoading}
            className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-medium hover:bg-[#FAFAF7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {googleLoading ? (
              "Connecting…"
            ) : (
              <>
                <GoogleLogo />
                Continue with Google
              </>
            )}
          </button>

          {mode === "login" && (
            <button
              type="button"
              onClick={onMagicLink}
              disabled={magicLoading || !email}
              className="mt-3 w-full h-11 rounded-xl border border-transparent bg-transparent text-[#6F7A5A] font-medium hover:text-[#1F2A1F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {magicLoading ? "Sending…" : "Send magic link instead"}
            </button>
          )}
        </>
      )}

      {/* Нижняя ссылка-переключатель */}
      <div className="mt-6 text-center text-sm text-[#6F7A5A]">
        {mode === "login" && (
          <>
            New here?{" "}
            <Link href={getSignupUrl(safeRedirect)} className="text-[#8F9E4F] hover:text-[#556036] font-medium">
              Create account
            </Link>
          </>
        )}
        {mode === "signup" && (
          <>
            Already have an account?{" "}
            <Link href={getAuthUrl(safeRedirect)} className="text-[#8F9E4F] hover:text-[#556036] font-medium">
              Sign in
            </Link>
          </>
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

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g fill="none" fillRule="evenodd">
        <path
          d="M17.64 9.2045c0-.6371-.0573-1.2516-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7955 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6149z"
          fill="#4285F4"
        />
        <path
          d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.482 18 9 18z"
          fill="#34A853"
        />
        <path
          d="M3.9636 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3482 6.1732 0 7.5477 0 9s.3482 2.8268.9573 4.0418L3.9636 10.71z"
          fill="#FBBC05"
        />
        <path
          d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3459l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.482 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6714 5.1627 6.6556 3.5795 9 3.5795z"
          fill="#EA4335"
        />
      </g>
    </svg>
  );
}
