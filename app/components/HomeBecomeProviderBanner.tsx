"use client";

import { useState } from "react";
import nextDynamic from "next/dynamic";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import { CREATOR_PLANS } from "../lib/access";

// BecomeProviderModal also lives in TopBar; loading it lazily here means
// the banner adds 0 KB to the initial home bundle — it only fetches when
// the user clicks. The TopBar's own copy stays untouched.
const BecomeProviderModal = nextDynamic(
  () => import("./BecomeProviderModal"),
  { ssr: false }
);

/**
 * HomeBecomeProviderBanner (v2) — soft CTA banner placed below the hero
 * inviting visitors to publish their place / service / experience.
 *
 * Visibility rule: hidden for users who are ALREADY on a creator plan
 * (we know they're a provider; the banner would be visual noise). Shown
 * to guests, standard users, and premium_viewer (read-only premium).
 *
 * Click contract: opens the existing BecomeProviderModal — same modal
 * the TopBar uses. We render an independent instance here; React only
 * mounts the modal subtree when isOpen=true, so there's no duplicate DOM
 * sitting in the page when the banner is dormant.
 *
 * Cross-link: docs/HOME_REDESIGN_V2_INTEGRATION.md (Phase H).
 */
export default function HomeBecomeProviderBanner() {
  const { access } = useUserAccessContext();
  const [open, setOpen] = useState(false);

  // Hide for existing providers — they don't need an upsell.
  // CREATOR_PLANS includes creator_service / creator_experience / creator_all.
  const isAlreadyProvider = (CREATOR_PLANS as readonly string[]).includes(access.plan);
  if (isAlreadyProvider) return null;

  return (
    <>
      <div
        className="mx-auto max-w-[1200px] mt-6 mb-2 px-4 sm:px-6"
        role="region"
        aria-label="Become a provider"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 bg-[#eef0e0] border border-[#d6dabd] rounded-2xl px-5 py-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={[
              "h-10 px-4 rounded-full whitespace-nowrap",
              "bg-[#16190f] text-white text-[14px] font-semibold",
              "inline-flex items-center gap-2 self-start sm:self-auto",
              "transition-colors hover:bg-[#3a3f2c]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8F9E4F] focus-visible:ring-offset-1",
            ].join(" ")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Become a provider
            <span
              aria-hidden
              className="text-[10px] font-bold tracking-[0.04em] bg-[#d34736] text-white px-1.5 py-0.5 rounded-md ml-1"
            >
              NEW
            </span>
          </button>
          <div className="text-[14px] text-[#4a4f3d] leading-relaxed">
            Know a hidden gem, run mobile massages, lead photo walks down
            A1A?{" "}
            <b className="text-[#16190f]">List your spot in 2 minutes</b>
            {" "}— payments go directly between you and your guest.
          </div>
        </div>
      </div>

      <BecomeProviderModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
