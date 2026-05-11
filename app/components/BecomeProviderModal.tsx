"use client";

/**
 * BecomeProviderModal — точка входа в воронку «Стать провайдером».
 *
 * Открывается из TopBar по клику на ссылку «Стать провайдером».
 * Показывает 3 карточки kind'ов с чекбоксами (мульти-выбор), кнопка «Далее»
 * редиректит на /add?kinds=… (CSV) — там уже создаётся черновик и идёт редактор.
 *
 * Phase 1: модалка работает как entry-point. Сам wizard с превью и pricing
 * будет в Phase 3-4 (см. BECOME_PROVIDER_PLAN.md).
 *
 * Auth-flow:
 *   - Анонимный пользователь видит ссылку и может открыть модалку.
 *   - На «Далее» проверяем сессию: если её нет — открываем AuthModal с
 *     redirectPath, после логина пользователя возвращает обратно на /add?kinds=…
 *
 * Persist выбранных kind'ов: localStorage('become-provider-kinds') —
 * чтобы при логине через redirect не потерять выбор.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { PlaceKind } from "../types/supabase";
import { supabase } from "../lib/supabase";
import { usePremiumModalContext } from "../contexts/PremiumModalContext";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import {
  PRICING_REGISTRY,
  planCoversKind,
  suggestPlanForKinds,
  priceDisplay,
  type PlanId,
} from "../lib/pricing";

type KindOption = {
  kind: PlaceKind;
  emoji: string;
  title: string;
  subtitle: string;
  examples: string;
};

// Совпадает с KIND_OPTIONS на /add — единый источник правды позже вынесем в lib.
const KIND_OPTIONS: KindOption[] = [
  {
    kind: "location",
    emoji: "📍",
    title: "Location",
    subtitle: "A spot on the map — café, viewpoint, park, hidden gem.",
    examples: "Rooftop bar, secret beach, coffee shop",
  },
  {
    kind: "service",
    emoji: "🛠",
    title: "Service",
    subtitle: "Something someone does — with a price and hours.",
    examples: "Massage, photographer, surf instructor",
  },
  {
    kind: "experience",
    emoji: "✨",
    title: "Experience",
    subtitle: "An event with a schedule and duration (Airbnb-style).",
    examples: "Food tour, workshop, guided trip",
  },
];

const STORAGE_KEY = "become-provider-kinds";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BecomeProviderModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<PlaceKind>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { openAuthModal } = usePremiumModalContext();
  const { access } = useUserAccessContext();
  const currentPlan: PlanId = (access?.plan as PlanId | undefined) ?? "free";

  // Suggested plan по выбранным kind'ам — динамически. Показываем с monthly-ценой
  // в нижней подсказке. Если plan уже у юзера — не показываем upsell.
  const suggested = useMemo(() => {
    if (selected.size === 0) return null;
    const planId = suggestPlanForKinds(Array.from(selected));
    if (planId === currentPlan) return null;
    const monthly = priceDisplay(planId, "month");
    const display = PRICING_REGISTRY[planId].display;
    if (!monthly || !display) return null;
    return { planId, name: display.name, primary: monthly.primary, suffix: monthly.suffix };
  }, [selected, currentPlan]);

  // На открытии — хайдрейтим выбор из localStorage (если был сохранён до логина).
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const valid = arr.filter(
            (k): k is PlaceKind =>
              k === "location" || k === "service" || k === "experience"
          );
          setSelected(new Set(valid));
          return;
        }
      }
    } catch {
      // ignore — privacy mode etc.
    }
    setSelected(new Set());
  }, [isOpen]);

  // Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  function toggle(kind: PlaceKind) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  async function handleNext() {
    if (selected.size === 0) return;
    setSubmitting(true);

    const kindsCsv = Array.from(selected).join(",");
    const targetPath = `/add?kinds=${encodeURIComponent(kindsCsv)}`;

    // Persist выбор на случай auth-redirect'а — заберём из localStorage после логина.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selected)));
    } catch {
      // ignore
    }

    // Проверяем авторизацию.
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // Закрываем эту модалку, открываем AuthModal с возвратом в /add?kinds=…
        setSubmitting(false);
        onClose();
        openAuthModal(targetPath, "default");
        return;
      }
    } catch {
      // Если Supabase почему-то недоступен — даём попробовать перейти, /add сам редиректит на /auth.
    }

    // Авторизован — чистим storage (выбор уже использован) и идём в /add.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    onClose();
    router.push(targetPath);
  }

  if (!isOpen) return null;
  if (typeof window === "undefined") return null;

  const selectedCount = selected.size;
  const selectedTitles = KIND_OPTIONS.filter((opt) => selected.has(opt.kind)).map(
    (opt) => opt.title
  );
  const nextLabel =
    selectedCount === 0
      ? "Continue"
      : selectedCount === 1
      ? "Continue → 1 type"
      : `Continue → ${selectedCount} types`;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="become-provider-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[920px] bg-white rounded-t-3xl sm:rounded-3xl border border-[#ECEEE4] shadow-lg flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#ECEEE4] px-5 py-3.5 flex-shrink-0">
          <div className="font-fraunces font-semibold text-[17px] text-[#1F2A1F]">
            What would you like to host?
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#6F7A5A] hover:bg-[#FAFAF7] hover:text-[#1F2A1F] transition-colors"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-y-auto bg-[#FFFEFB] px-4 py-4 sm:overflow-visible sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(164,185,104,0.18),transparent_64%)]" />
          <div className="pointer-events-none absolute right-0 top-16 h-32 w-32 rounded-full bg-[#EEF2DE] blur-3xl opacity-70" />

          <div className="relative mb-4 overflow-hidden rounded-[24px] border border-[#E6EAD9] bg-[linear-gradient(135deg,rgba(250,250,247,0.98)_0%,rgba(245,248,235,0.98)_55%,rgba(255,255,255,0.98)_100%)] p-4 shadow-[0_18px_38px_rgba(31,42,31,0.07)] sm:p-5">
            <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#A4B968]/20 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-12 w-full bg-[linear-gradient(180deg,transparent_0%,rgba(164,185,104,0.06)_100%)]" />

            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[30rem]">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#DDE5C2] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#556036] shadow-[0_8px_18px_rgba(31,42,31,0.05)]">
                  <span aria-hidden className="text-[13px] leading-none">
                    ✦
                  </span>
                  Creator setup
                </span>
                <h2
                  id="become-provider-title"
                  className="mt-2.5 font-fraunces text-[24px] leading-[1.05] font-semibold text-[#1F2A1F] sm:text-[28px]"
                >
                  Pick one or more types
                </h2>
                <p className="mt-1.5 max-w-[36rem] text-[13px] leading-relaxed text-[#5E694B] sm:text-[14px]">
                  You can mix formats, like a location with a service. Pick what you
                  want to publish and Maporia will suggest the best plan after the
                  details step.
                </p>
              </div>

              <div className="min-w-[112px] rounded-2xl border border-[#E1E7CB] bg-white/90 px-3.5 py-2.5 text-left shadow-[0_14px_30px_rgba(31,42,31,0.06)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B9770]">
                  Selected
                </div>
                <div className="mt-1 text-base font-semibold text-[#1F2A1F]">
                  {selectedCount === 0 ? "0 types" : `${selectedCount} type${selectedCount > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>

            {selectedTitles.length > 0 ? (
              <div className="relative mt-3 flex flex-wrap gap-2">
                {selectedTitles.map((title) => (
                  <span
                    key={title}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#DCE4C6] bg-white/95 px-3 py-1 text-[11px] font-medium text-[#44512F] shadow-[0_8px_18px_rgba(31,42,31,0.04)]"
                  >
                    <span aria-hidden className="text-[11px]">
                      ✦
                    </span>
                    {title}
                  </span>
                ))}
              </div>
            ) : (
              <div className="relative mt-3 rounded-2xl border border-dashed border-[#DCE4C6] bg-white/65 px-4 py-2.5 text-[12px] leading-relaxed text-[#7A8660]">
                Start with the format you know best. You can combine types now and
                refine everything on the next step.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {KIND_OPTIONS.map((opt) => {
              const isSelected = selected.has(opt.kind);
              const isCovered = planCoversKind(currentPlan, opt.kind);
              return (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => toggle(opt.kind)}
                  aria-pressed={isSelected}
                  className={[
                    "group relative overflow-hidden text-left rounded-[22px] border-[1.5px] p-3.5 sm:p-4",
                    "flex min-h-[176px] sm:min-h-[168px] flex-col gap-2.5 transition duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2",
                    isSelected
                      ? "border-[#8F9E4F] bg-[linear-gradient(180deg,rgba(164,185,104,0.16)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_42px_rgba(143,158,79,0.18)]"
                      : "border-[#ECEEE4] bg-white/95 hover:-translate-y-0.5 hover:border-[#C9D6A0] hover:shadow-[0_18px_36px_rgba(31,42,31,0.08)]",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className={[
                      "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200",
                      isSelected
                        ? "bg-[#A4B968]/35 opacity-100"
                        : "bg-[#EEF2DE] opacity-80 group-hover:opacity-100",
                    ].join(" ")}
                  />

                  {/* Covered-бейдж: текущий план юзера уже покрывает этот kind */}
                  {isCovered && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-[#D5DFB3] bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#556036] shadow-[0_8px_18px_rgba(31,42,31,0.05)]">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Covered
                    </span>
                  )}
                  {/* Чекбокс — visual only; реальный state в кнопке через aria-pressed */}
                  <span
                    className={[
                      "absolute right-3 top-3 flex h-[24px] w-[24px] items-center justify-center rounded-lg border-2 transition",
                      isSelected
                        ? "border-[#8F9E4F] bg-[#8F9E4F] shadow-[0_10px_18px_rgba(143,158,79,0.28)]"
                        : "border-[#E1E6D3] bg-white",
                    ].join(" ")}
                    aria-hidden
                  >
                    {isSelected && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>

                  <div className="relative pt-3">
                    <span
                      aria-hidden
                      className={[
                        "absolute left-1 top-4 h-9 w-9 rounded-full blur-xl",
                        isSelected ? "bg-[#A4B968]/35" : "bg-[#EEF2DE]",
                      ].join(" ")}
                    />
                    <div
                      className={[
                        "relative flex h-12 w-12 items-center justify-center rounded-2xl border text-[24px] leading-none shadow-[0_12px_25px_rgba(31,42,31,0.06)]",
                        isSelected
                          ? "border-[#D7E0B8] bg-white/90"
                          : "border-[#F0F2E8] bg-[#FAFAF7]",
                      ].join(" ")}
                    >
                      {opt.emoji}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="font-fraunces text-[18px] font-semibold text-[#1F2A1F]">
                      {opt.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#5F6A4D]">
                      {opt.subtitle}
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                    {opt.examples.split(", ").slice(0, 2).map((example) => (
                      <span
                        key={`${opt.kind}-${example}`}
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                          isSelected
                            ? "bg-white/90 text-[#556036]"
                            : "bg-[#F6F8F0] text-[#869171]",
                        ].join(" ")}
                      >
                        {example}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {suggested ? (
            <div className="mt-3 overflow-hidden rounded-[22px] border border-[#DBE3C2] bg-[linear-gradient(135deg,rgba(164,185,104,0.2)_0%,rgba(255,255,255,0.98)_58%,rgba(248,250,241,0.98)_100%)] p-3.5 shadow-[0_18px_38px_rgba(31,42,31,0.07)]">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-[16px] shadow-[0_10px_24px_rgba(31,42,31,0.08)]"
                >
                  ✨
                </span>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6D794E]">
                    Best match
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#475438] sm:text-[13px]">
                    Suggested plan:{" "}
                    <strong className="text-[#1F2A1F]">{suggested.name}</strong>{" "}
                    from {suggested.primary}
                    {suggested.suffix}. You&apos;ll choose Monthly or Yearly after
                    filling the details.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-[20px] border border-[#ECEEE4] bg-white/80 px-4 py-2.5 text-[12px] leading-relaxed text-[#7E8870] shadow-[0_10px_24px_rgba(31,42,31,0.04)]">
              <span className="font-medium text-[#556036]">Heads up:</span> pricing
              depends on the formats you pick and is shown on the final step.
              Filling out the form is free.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-[#ECEEE4] bg-white flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-xl text-sm font-medium text-[#6F7A5A] hover:bg-[#FAFAF7] hover:text-[#1F2A1F] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={selectedCount === 0 || submitting}
            className={`h-11 px-5 rounded-xl text-sm font-medium transition-colors ${
              selectedCount === 0 || submitting
                ? "bg-[#DADDD0] text-[#A8B096] cursor-not-allowed"
                : "bg-[#8F9E4F] text-white hover:bg-[#556036]"
            }`}
          >
            {submitting ? "..." : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
