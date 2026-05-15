"use client";

import { createPortal } from "react-dom";
import { getSafeRedirectFrom } from "../lib/authRedirect";
import Icon from "./Icon";
import PasswordlessAuthPanel, { type PasswordlessAuthVariant } from "./auth/PasswordlessAuthPanel";

export type AuthModalVariant = PasswordlessAuthVariant;

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  redirectPath?: string;
  variant?: AuthModalVariant;
};

function buildPasswordHref(redirectPath?: string): string {
  const safeRedirect = getSafeRedirectFrom(redirectPath ?? null);
  const search = new URLSearchParams({ method: "password" });
  if (safeRedirect) search.set("from", safeRedirect);
  return `/login?${search.toString()}`;
}

/**
 * Modal shell for the shared passwordless auth flow.
 */
export default function AuthModal({ isOpen, onClose, redirectPath, variant = "default" }: AuthModalProps) {
  if (!isOpen) return null;

  const modalEl = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" aria-modal="true" role="dialog">
      <div
        className="w-full max-w-md rounded-3xl bg-white border border-[#ECEEE4] p-8 relative"
        style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full flex items-center justify-center text-[#A8B096] hover:bg-[#FAFAF7] hover:text-[#8F9E4F] transition-colors"
          aria-label="Close"
        >
          <Icon name="close" size={20} />
        </button>

        <div className="flex justify-start mb-6">
          <div className="h-10 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_maporia1.svg" alt="Maporia" className="h-8 w-auto" />
          </div>
        </div>

        <PasswordlessAuthPanel
          redirectPath={redirectPath}
          variant={variant}
          onSuccess={onClose}
          passwordHref={buildPasswordHref(redirectPath)}
        />
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalEl, document.body) : null;
}
