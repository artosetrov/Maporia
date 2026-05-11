"use client";

import { X } from "lucide-react";

type TransientNoticeProps = {
  message: string | null;
  onDismiss: () => void;
  variant?: "error" | "success";
};

const VARIANT_CLASS: Record<NonNullable<TransientNoticeProps["variant"]>, string> = {
  error: "bg-[#8B2E2E] text-white shadow-[0_12px_32px_rgba(139,46,46,0.22)]",
  success: "bg-[#1F2A1F] text-white shadow-[0_12px_32px_rgba(31,42,31,0.22)]",
};

export default function TransientNotice({
  message,
  onDismiss,
  variant = "error",
}: TransientNoticeProps) {
  if (!message) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[70] flex justify-center pointer-events-none"
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${VARIANT_CLASS[variant]}`}
      >
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15 active:bg-white/20"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
