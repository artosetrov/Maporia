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
            ? "bg-[#8F9E4F] text-white border-[#8F9E4F]"
            : "bg-[#FAFAF7] text-[#6F7A5A] border-[#ECEEE4] hover:bg-[#ECEEE4]"
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
          "px-3 py-1 border border-[#ECEEE4] text-[#8F9E4F] bg-[#FAFAF7]"
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
          ? "bg-[#8F9E4F] text-white border-[#8F9E4F]"
          : "bg-white border-[#ECEEE4] text-[#1F2A1F] hover:bg-[#FAFAF7]"
      )}
    >
      {children}
    </button>
  );
}
