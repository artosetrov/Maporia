"use client";

import Link from "next/link";

type UpgradeCTAProps = {
  variant?: "button" | "link";
  className?: string;
  onClick?: () => void;
};

/**
 * Call-to-action component for upgrading to Premium
 */
export default function UpgradeCTA({ variant = "button", className = "", onClick }: UpgradeCTAProps) {
  const baseClasses = variant === "button" 
    ? "px-6 py-3 rounded-xl bg-gradient-to-r from-[#D6B25E] to-[#C96A5B] text-white font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]"
    : "text-[#8F9E4F] font-semibold text-sm hover:text-[#556036] underline";

  if (onClick) {
    return (
      <button onClick={onClick} className={`${baseClasses} ${className}`}>
        {variant === "button" ? "Go Premium" : "Upgrade to Premium"}
      </button>
    );
  }

  return (
    <Link href="/premium" className={`${baseClasses} ${className}`}>
      {variant === "button" ? "Go Premium" : "Upgrade to Premium"}
    </Link>
  );
}
