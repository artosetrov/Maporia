"use client";

import { useState, useRef } from "react";
import { useAuthRedirect } from "../hooks/useAuthRedirect";

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
  /** @deprecated Always renders as button now (opens modal). Kept for backward compat. */
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
  appearance = "primary",
  className,
  children,
  trigger: triggerProp,
}: AuthCTAProps) {
  const { redirectToAuth } = useAuthRedirect();
  const [toast, setToast] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = children ?? LABELS[variant];
  const trigger = triggerProp ?? (variant === "unlock" ? "auth_cta_unlock" : "auth_cta_sign_in");

  const handleClick = () => {
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
  };

  const baseClass =
    "flex items-center justify-center gap-2 text-sm font-medium transition-all rounded-xl";
  const buttonPrimary =
    "h-11 px-5 bg-[#8F9E4F] text-white hover:brightness-110 active:brightness-90 disabled:opacity-50";
  const buttonSecondary =
    "h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] text-[#1F2A1F] disabled:opacity-50";
  const buttonClass = appearance === "secondary" ? buttonSecondary : buttonPrimary;

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
