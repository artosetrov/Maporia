"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseOtp, getAuthRedirectUrl } from "@/app/lib/supabase";
import { getSafeRedirectFrom } from "@/app/lib/authRedirect";
import Icon from "../Icon";

export type PasswordlessAuthVariant = "default" | "profile" | "saved" | "premium";

type PasswordlessAuthPanelProps = {
  redirectPath?: string;
  variant?: PasswordlessAuthVariant;
  onSuccess?: () => void;
  onUsePassword?: () => void;
  passwordHref?: string;
};

const VARIANT_SUBTITLE: Record<PasswordlessAuthVariant, string> = {
  default: "Use Google or your email to continue. If you're new, we'll create your account automatically.",
  profile: "Continue to view your profile and manage your account.",
  saved: "Continue to view your saved places.",
  premium: "Continue to unlock premium places and collections.",
};

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

type Step = "email" | "code";

function friendlyOtpError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Please try again.";
  const m = message.toLowerCase();

  if (m.includes("error sending") || m.includes("smtp") || m.includes("magic link")) {
    return "Email sign-in is temporarily unavailable. Please try Continue with Google, or come back in a few minutes.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit")) {
    return "Too many sign-in attempts. Please wait a minute and try again, or use Continue with Google.";
  }
  if (m.includes("invalid email") || m.includes("email address")) {
    return "Please enter a valid email address.";
  }
  if (m.includes("network") || m.includes("failed to fetch")) {
    return "Connection problem. Check your internet and try again.";
  }
  return message;
}

function buildCallbackPath(redirectPath?: string): string {
  const safeRedirect = getSafeRedirectFrom(redirectPath ?? null) ?? "/";
  return `/auth/callback?next=${encodeURIComponent(safeRedirect)}`;
}

export default function PasswordlessAuthPanel({
  redirectPath,
  variant = "default",
  onSuccess,
  onUsePassword,
  passwordHref,
}: PasswordlessAuthPanelProps) {
  const router = useRouter();
  const safeRedirect = getSafeRedirectFrom(redirectPath ?? null);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      onSuccess?.();
      if (safeRedirect) {
        router.push(safeRedirect);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onSuccess, router, safeRedirect]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (step !== "code") return;
    const t = window.setTimeout(() => codeInputs.current[0]?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [step]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const { error: otpError } = await supabaseOtp.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getAuthRedirectUrl(buildCallbackPath(redirectPath)),
      },
    });

    setLoading(false);
    if (otpError) {
      setError(friendlyOtpError(otpError.message));
      return;
    }

    setStep("code");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function verifyCode(joinedCode: string) {
    if (joinedCode.length !== CODE_LENGTH || verifyingRef.current) return;
    verifyingRef.current = true;
    setError(null);
    setVerifying(true);

    const { error: verifyError } = await supabaseOtp.auth.verifyOtp({
      email,
      token: joinedCode,
      type: "email",
    });

    if (!verifyError) {
      const { data: sessionData } = await supabaseOtp.auth.getSession();
      if (sessionData.session) {
        await supabase.auth.setSession({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        });
      }
    }

    setVerifying(false);
    verifyingRef.current = false;
    if (verifyError) {
      setError("Invalid or expired code. Try again.");
      setCode(Array(CODE_LENGTH).fill(""));
      window.setTimeout(() => codeInputs.current[0]?.focus(), 0);
    }
  }

  function handleCodeChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(0, 1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;

      if (digit && index < CODE_LENGTH - 1) {
        window.setTimeout(() => codeInputs.current[index + 1]?.focus(), 0);
      }

      const joined = next.join("");
      if (joined.length === CODE_LENGTH && next.every((d) => d !== "")) {
        window.setTimeout(() => verifyCode(joined), 0);
      }
      return next;
    });
  }

  function handleCodeKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      e.preventDefault();
      codeInputs.current[index - 1]?.focus();
      setCode((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      codeInputs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      codeInputs.current[index + 1]?.focus();
    }
  }

  function handleCodePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();

    const next = Array(CODE_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setCode(next);
    codeInputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();

    if (pasted.length === CODE_LENGTH) {
      window.setTimeout(() => verifyCode(pasted), 0);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setGoogleLoading(true);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(buildCallbackPath(redirectPath)),
      },
    });

    setGoogleLoading(false);
    if (oauthError) {
      setError(
        oauthError.message.includes("provider is not enabled") ||
          oauthError.message.includes("Unsupported provider")
          ? "Google authentication is not enabled. Please contact support."
          : oauthError.message
      );
    }
  }

  function backToEmail() {
    setStep("email");
    setCode(Array(CODE_LENGTH).fill(""));
    setError(null);
  }

  if (step === "code") {
    return (
      <>
        <button
          type="button"
          onClick={backToEmail}
          className="inline-flex items-center gap-1 text-sm text-[#A8B096] hover:text-[#556036] mb-4 transition-colors"
        >
          <Icon name="chevron-down" size={16} className="rotate-90" />
          Change email
        </button>

        <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">Check your inbox</h2>
        <p className="text-[#6F7A5A] text-sm mb-6">
          Enter the 6-digit code we sent to <strong className="text-[#1F2A1F]">{email}</strong>.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#C96A5B]/10 border border-[#C96A5B]/30 text-[#C96A5B] text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-6 gap-1.5 sm:gap-2 mb-6">
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <input
              key={i}
              ref={(el) => { codeInputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={code[i]}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              onPaste={i === 0 ? handleCodePaste : undefined}
              disabled={verifying}
              aria-label={`Digit ${i + 1}`}
              className="h-12 min-w-0 rounded-xl border border-[#ECEEE4] bg-white text-center text-xl font-semibold text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:border-transparent disabled:opacity-50 sm:h-14 sm:text-2xl"
            />
          ))}
        </div>

        <div className="text-center">
          {resendCooldown > 0 ? (
            <p className="text-sm text-[#A8B096]">Resend in {resendCooldown}s</p>
          ) : (
            <button
              type="button"
              onClick={() => requestCode()}
              disabled={loading}
              className="text-sm font-medium text-[#8F9E4F] hover:text-[#556036] disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending..." : "Resend code"}
            </button>
          )}
        </div>

        {verifying && <p className="text-xs text-[#A8B096] text-center mt-4">Verifying...</p>}
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-[#1F2A1F] mb-2">Log in or sign up</h2>
      <p className="text-[#6F7A5A] text-sm mb-6">{VARIANT_SUBTITLE[variant]}</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#C96A5B]/10 border border-[#C96A5B]/30 text-[#C96A5B] text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={googleLoading || loading}
        className="w-full py-3 px-4 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-semibold text-sm hover:bg-[#FAFAF7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
      >
        {googleLoading ? (
          "Connecting..."
        ) : (
          <>
            <GoogleLogo />
            Continue with Google
          </>
        )}
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#ECEEE4]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-[#A8B096]">or</span>
        </div>
      </div>

      <form onSubmit={requestCode} className="space-y-3">
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-[#1F2A1F] mb-2">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading || googleLoading}
            className="w-full px-4 py-3 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] placeholder-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:border-transparent disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading || !email}
          className="w-full py-3 px-4 rounded-xl bg-[#8F9E4F] text-white font-semibold text-sm hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Sending code..." : "Continue"}
        </button>
      </form>

      <p className="text-xs text-[#A8B096] text-center mt-4">
        We'll email you a 6-digit code. No password needed.
      </p>

      {(onUsePassword || passwordHref) && (
        <div className="mt-5 text-center">
          {onUsePassword ? (
            <button
              type="button"
              onClick={onUsePassword}
              className="text-sm font-medium text-[#6F7A5A] hover:text-[#1F2A1F] transition-colors"
            >
              Continue with password
            </button>
          ) : (
            <a
              href={passwordHref}
              className="text-sm font-medium text-[#6F7A5A] hover:text-[#1F2A1F] transition-colors"
            >
              Continue with password
            </a>
          )}
        </div>
      )}
    </>
  );
}

function GoogleLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
