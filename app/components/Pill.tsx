"use client";

import { ReactNode } from "react";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

type PillProps = {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  variant?: "filter" | "tab" | "chip";
};

export default function Pill({ active = false, onClick, children, variant = "filter" }: PillProps) {
  const baseStyles = "rounded-full text-xs font-medium transition";
  
  if (variant === "tab") {
    return (
      <button
        onClick={onClick}
        className={cx(
          baseStyles,
          "px-4 py-2 flex-1 border",
          active
            ? "bg-[#6b7d47] text-white border-[#6b7d47]"
            : "bg-[#f5f4f2] text-[#6b7d47]/60 border-[#6b7d47]/20 hover:bg-[#6b7d47]/10"
        )}
      >
        {children}
      </button>
    );
  }

  if (variant === "chip") {
    return (
      <span
        className={cx(
          baseStyles,
          "px-3 py-1 border border-[#6b7d47]/20 text-[#6b7d47] bg-[#f5f4f2]"
        )}
      >
        {children}
      </span>
    );
  }

  // Default: filter
  return (
    <button
      onClick={onClick}
      className={cx(
        baseStyles,
        "px-3 py-1.5 border",
        active
          ? "bg-[#6b7d47] text-white border-[#6b7d47]"
          : "bg-white border-[#6b7d47]/20 text-[#2d2d2d] hover:bg-[#f5f4f2]"
      )}
    >
      {children}
    </button>
  );
}
