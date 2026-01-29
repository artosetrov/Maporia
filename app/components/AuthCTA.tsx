"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import { trackAuthRedirect } from "../lib/analytics";

const TOAST_DURATION_MS = 1200;

type AuthCTAVariant = "sign-in" | "unlock";

const LABELS: Record<AuthCTAVariant, string> = {
  "sign-in": "Sign in",
  unlock: "Unlock",
};

const TOAST_MESSAGES: Record<AuthCTAVariant, string> = {
  "sign-in": "You need to sign in to do this",
  unlock: "Unlock to continue",
};

type AuthCTAProps = {
  variant?: AuthCTAVariant;
  /** Show short message before redirect (no toast lib needed) */
  showToastBeforeRedirect?: boolean;
  /** Render as link (e.g. TopBar) or button */
  as?: "button" | "link";
  /** Button style: primary (green) or secondary (outline) */
  appearance?: "primary" | "secondary";
  className?: string;
  children?: React.ReactNode;
  /** Analytics trigger; default derived from variant */
  trigger?: string;
};

export default function AuthCTA({
  variant = "sign-in",
  showToastBeforeRedirect = true,
  as = "button",
  appearance = "primary",
  className,
  children,
  trigger: triggerProp,
}: AuthCTAProps) {
  const { authUrl, redirectToAuth } = useAuthRedirect();
  const [toast, setToast] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = children ?? LABELS[variant];
  const trigger = triggerProp ?? (variant === "unlock" ? "auth_cta_unlock" : "auth_cta_sign_in");

  function handleClick(e: React.MouseEvent) {
    if (as === "link") {
      trackAuthRedirect(trigger);
      return;
    }
    e.preventDefault();
    if (timeoutRef.current) return;
    if (showToastBeforeRedirect) {
      setToast(true);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setToast(false);
        redirectToAuth(trigger);
      }, TOAST_DURATION_MS);
    } else {
      redirectToAuth(trigger);
    }
  }

  const baseClass =
    "flex items-center justify-center gap-2 text-sm font-medium transition-all rounded-xl";
  const buttonPrimary =
    "h-11 px-5 bg-[#8F9E4F] text-white hover:brightness-110 active:brightness-90 disabled:opacity-50";
  const buttonSecondary =
    "h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] text-[#1F2A1F] disabled:opacity-50";
  const buttonClass = appearance === "secondary" ? buttonSecondary : buttonPrimary;
  const linkClass =
    "px-5 py-2.5 h-11 bg-[#8F9E4F] text-white hover:brightness-110 active:brightness-90";

  if (as === "link") {
    return (
      <Link
        href={authUrl}
        onClick={handleClick}
        className={`${baseClass} ${linkClass} ${className ?? ""}`.trim()}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-[#1F2A1F] text-white text-xs whitespace-nowrap z-10"
          role="status"
        >
          {TOAST_MESSAGES[variant]}
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={toast}
        className={`${baseClass} ${buttonClass} ${className ?? ""}`.trim()}
      >
        {label}
      </button>
    </div>
  );
}
