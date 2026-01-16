"use client";

import { ReactNode } from "react";
import Link from "next/link";

type TopBarProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  backHref?: string;
};

export default function TopBar({ left, center, right, onBack, backHref }: TopBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-[#faf9f7]/95 backdrop-blur-sm border-b border-[#6b7d47]/10">
      <div className="mx-auto max-w-7xl px-4 pt-safe-top pt-3 pb-3">
        <div className="flex items-center gap-3">
          {/* Left */}
          <div className="flex-shrink-0">
            {backHref ? (
              <Link
                href={backHref}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            ) : onBack ? (
              <button
                onClick={onBack}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            ) : left ? (
              left
            ) : (
              <div className="w-10" />
            )}
          </div>

          {/* Center */}
          <div className="flex-1 min-w-0">{center}</div>

          {/* Right */}
          <div className="flex-shrink-0">{right}</div>
        </div>
      </div>
    </div>
  );
}
