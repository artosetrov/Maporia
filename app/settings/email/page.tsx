"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, getAuthRedirectUrl } from "../../lib/supabase";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import Icon from "../../components/Icon";
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

type Step = "form" | "pending" | "success" | "callback";

function normalizeEmailError(msg: string): string {
  if (!msg) return "Something went wrong.";
  const lower = msg.toLowerCase();
  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("already in use")
  )
    return "This email is already in use.";
  if (
    lower.includes("invalid") ||
    lower.includes("expired") ||
    lower.includes("token")
  )
    return "Invalid or expired link. Please request a new confirmation.";
  return msg;
}

function SettingsEmailContent() {
  const searchParams = useSearchParams();
  const { replaceToAuth } = useAuthRedirect();
  // 2026-05-10: useAuthRedirect возвращает свежую ссылку на каждый render —
  // прямое использование в useEffect deps вызывает re-render loop
  // (см. feedback_useauthredirect_deps). Кэшируем в ref, синкаем
  // через эффект (React 19 запрещает писать в .current во время render).
  const replaceToAuthRef = useRef(replaceToAuth);
  useEffect(() => {
    replaceToAuthRef.current = replaceToAuth;
  });

  const [step, setStep] = useState<Step>("form");
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [callbackHandled, setCallbackHandled] = useState(false);

  // Ensure user is signed in and load current email (skip if we're handling email-change callback from URL)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (callbackHandled) {
      return;
    }
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const typeParam = params.get("type");
    const code = params.get("code");
    const isEmailChangeCallback =
      hash ||
      (tokenHash && typeParam === "email_change") ||
      (code != null && code !== "");
    if (isEmailChangeCallback) {
      return;
    }

    let mounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        replaceToAuthRef.current();
        return;
      }
      if (mounted) {
        setCurrentEmail(user.email ?? null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [callbackHandled]);

  // Handle email-change callback: PKCE code, hash fragment, or token_hash in query
  const handleCallback = useCallback(async () => {
    if (callbackHandled) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    );
    const tokenHash = params.get("token_hash");
    const typeParam = params.get("type");
    const code = params.get("code");

    // PKCE: ?code=... — exchange code for session (must be same browser where user requested change)
    if (code != null && code !== "") {
      setCallbackHandled(true);
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/settings/email");
      }
      if (exchangeError) {
        const msg = exchangeError.message || "";
        if (msg.includes("code verifier") || msg.includes("non-empty")) {
          setCallbackError(
            "Please open this link in the same browser where you requested the email change."
          );
        } else {
          setCallbackError(normalizeEmailError(exchangeError.message));
        }
        setCurrentEmail("");
        setStep("form");
        return;
      }
      const user = data?.user;
      if (user?.email) {
        setCurrentEmail(user.email);
        setPendingEmail(null);
      }
      setStep("success");
      return;
    }

    // Hash fragment (magic link style) – let Supabase read URL and set session before we clean it
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const type = hashParams.get("type");
      const err = hashParams.get("error");
      if (err) {
        setCallbackError(normalizeEmailError(err));
        setStep("form");
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/settings/email");
        }
        setCallbackHandled(true);
        return;
      }
      if ((accessToken || type === "email_change") && typeof window !== "undefined") {
        setCallbackHandled(true);
        // Let Supabase process the hash and set the session (do NOT clean URL before this)
        try {
          await supabase.auth.initialize();
        } catch {
          // ignore
        }
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/settings/email");
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) {
          setCurrentEmail(user.email);
          setPendingEmail(null);
        }
        setStep("success");
        return;
      }
    }

    // Query params: token_hash + type=email_change (server redirect)
    if (tokenHash && typeParam === "email_change") {
      setCallbackHandled(true);
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email_change",
      });
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/settings/email");
      }
      if (verifyError) {
        setCallbackError(normalizeEmailError(verifyError.message));
        setStep("form");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setCurrentEmail(user.email);
        setPendingEmail(null);
      }
      setStep("success");
    }
  }, [callbackHandled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const typeParam = params.get("type");
    const code = params.get("code");
    const hasCallback =
      hash ||
      (tokenHash && typeParam === "email_change") ||
      (code != null && code !== "");
    if (hasCallback) {
      setStep("callback");
      handleCallback();
    }
  }, [searchParams, handleCallback]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setError("Enter a new email address.");
      return;
    }
    if (email === currentEmail) {
      setError("New email is the same as your current email.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: getAuthRedirectUrl("/settings/email") }
    );
    setLoading(false);
    if (updateError) {
      setError(normalizeEmailError(updateError.message));
      return;
    }
    setPendingEmail(email);
    setNewEmail("");
    setStep("pending");
  }

  if (currentEmail === null && step === "form") {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] p-6 animate-pulse">
          <div className="h-6 w-32 bg-[#ECEEE4] rounded mb-4" />
          <div className="h-10 w-full bg-[#ECEEE4] rounded" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24">
      <div className="max-w-md mx-auto px-4 pt-safe-top pt-6 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/profile/edit"
            className="w-10 h-10 rounded-full bg-white border border-[#ECEEE4] flex items-center justify-center text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            aria-label="Back"
          >
            <Icon name="back" size={20} />
          </Link>
          <h1 className="font-fraunces text-xl font-semibold text-[#1F2A1F]">
            Change email
          </h1>
        </div>

        {callbackError && (
          <div className="mb-4 p-4 rounded-xl bg-[#FDF2F0] border border-[#F5C6CB] text-sm text-[#C96A5B]">
            {callbackError}
          </div>
        )}

        {step === "callback" && (
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 text-center">
            <p className="text-[#6F7A5A]">Confirming your new email…</p>
          </div>
        )}

        {step === "success" && (
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-4">
            <div className="text-center text-[#8F9E4F] font-medium">
              Email updated successfully
            </div>
            <p className="text-sm text-[#6F7A5A] text-center">
              Your account email is now <strong className="text-[#1F2A1F]">{currentEmail}</strong>.
            </p>
            <Link
              href="/profile/edit"
              className="block w-full rounded-xl bg-[#8F9E4F] text-white py-3 text-center text-sm font-medium hover:bg-[#556036] transition"
            >
              Back to profile
            </Link>
          </div>
        )}

        {step === "pending" && (
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-4">
            <div className="rounded-xl bg-[#F5F6F0] border border-[#ECEEE4] px-4 py-3">
              <p className="text-xs font-medium text-[#6F7A5A] uppercase tracking-wide mb-1">
                Pending verification
              </p>
              <p className="text-sm text-[#1F2A1F]">
                We sent a confirmation link to <strong>{pendingEmail}</strong>.
              </p>
            </div>
            <p className="text-sm text-[#6F7A5A]">
              Click the link in that email to complete the change. Your current email remains active until you confirm.
            </p>
            <button
              type="button"
              onClick={() => setStep("form")}
              className="w-full rounded-xl border border-[#ECEEE4] bg-white py-3 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            >
              Use a different email
            </button>
            <Link
              href="/profile/edit"
              className="block w-full rounded-xl bg-[#8F9E4F] text-white py-3 text-center text-sm font-medium hover:bg-[#556036] transition"
            >
              Back to profile
            </Link>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#6F7A5A] mb-1">
                  Current email
                </label>
                <p className="text-[#1F2A1F] truncate">
                  {currentEmail || "Not set"}
                </p>
              </div>
              <div>
                <label htmlFor="new-email" className="block text-xs font-medium text-[#6F7A5A] mb-1">
                  New email
                </label>
                <input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E5E8DB] bg-white px-4 text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] transition"
                  disabled={loading}
                />
              </div>
              {error && (
                <p className="text-sm text-[#C96A5B]">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !newEmail.trim()}
                className="w-full h-11 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending…" : "Send confirmation link"}
              </button>
            </div>
            <Link
              href="/profile/edit"
              className="block text-center text-sm text-[#6F7A5A] hover:text-[#8F9E4F]"
            >
              Cancel
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

export default function SettingsEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-6">
          <div className="w-full h-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] p-6 animate-pulse">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded mb-4" />
            <div className="h-10 w-full bg-[#ECEEE4] rounded" />
          </div>
        </main>
      }
    >
      <SectionErrorBoundary>
        <SettingsEmailContent />
      </SectionErrorBoundary>
    </Suspense>
  );
}
