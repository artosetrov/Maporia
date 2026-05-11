"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose, open]);

  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-[#C96A5B] text-white hover:bg-[#B85A4B] active:bg-[#A84F42]"
      : "bg-[#8F9E4F] text-white hover:bg-[#556036] active:bg-[#46522C]";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-6 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-[0_24px_70px_rgba(31,42,31,0.22)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              tone === "danger" ? "bg-[#C96A5B]/10 text-[#C96A5B]" : "bg-[#8F9E4F]/10 text-[#8F9E4F]"
            }`}
            aria-hidden="true"
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-[#1F2A1F]">
              {title}
            </h2>
            <p id="confirm-dialog-description" className="mt-1 text-sm leading-5 text-[#6F7A5A]">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#6F7A5A] transition hover:bg-[#FAFAF7] disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-11 rounded-xl border border-[#ECEEE4] bg-white px-4 text-sm font-medium text-[#1F2A1F] transition hover:bg-[#FAFAF7] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`h-11 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
