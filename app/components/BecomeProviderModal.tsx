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
        className="w-full sm:max-w-[640px] bg-white rounded-t-3xl sm:rounded-3xl border border-[#ECEEE4] shadow-lg flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECEEE4] flex-shrink-0">
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
        <div className="px-5 py-6 overflow-y-auto flex-1">
          <div className="mb-5">
            <h2
              id="become-provider-title"
              className="font-fraunces text-xl sm:text-2xl font-semibold text-[#1F2A1F] mb-1"
            >
              Pick one or more types
            </h2>
            <p className="text-sm text-[#6F7A5A]">
              You can mix types — for example, a location with a service. We&apos;ll suggest the right plan after you fill the details.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {KIND_OPTIONS.map((opt) => {
              const isSelected = selected.has(opt.kind);
              const isCovered = planCoversKind(currentPlan, opt.kind);
              return (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => toggle(opt.kind)}
                  aria-pressed={isSelected}
                  className={`relative text-left rounded-2xl border-[1.5px] p-4 sm:p-5 flex flex-col gap-2.5 min-h-[180px] transition focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2 ${
                    isSelected
                      ? "border-[#8F9E4F] bg-[#8F9E4F]/[0.06]"
                      : "border-[#ECEEE4] bg-white hover:border-[#8F9E4F]"
                  }`}
                >
                  {/* Covered-бейдж: текущий план юзера уже покрывает этот kind */}
                  {isCovered && (
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-[#A4B968]/20 text-[#556036] text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
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
                    className={`absolute top-3 right-3 w-[22px] h-[22px] rounded-md flex items-center justify-center transition border-2 ${
                      isSelected
                        ? "bg-[#8F9E4F] border-[#8F9E4F]"
                        : "bg-white border-[#ECEEE4]"
                    }`}
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

                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-[26px] leading-none ${
                      isSelected ? "bg-[#8F9E4F]/[0.12]" : "bg-[#FAFAF7]"
                    }`}
                  >
                    {opt.emoji}
                  </div>
                  <div className="font-fraunces font-semibold text-base text-[#1F2A1F]">
                    {opt.title}
                  </div>
                  <div className="text-[13px] text-[#6F7A5A] leading-snug">
                    {opt.subtitle}
                  </div>
                  <div className="text-[12px] text-[#A8B096] mt-auto">
                    e.g. {opt.examples}
                  </div>
                </button>
              );
            })}
          </div>

          {suggested ? (
            <div className="mt-4 text-[12px] bg-[#A4B968]/15 text-[#3F4A35] rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2">
              <span aria-hidden>💡</span>
              <span>
                Suggested plan:{" "}
                <strong className="text-[#1F2A1F]">{suggested.name}</strong>
                {" "}from {suggested.primary}{suggested.suffix}. You&apos;ll see
                Monthly/Yearly options after you fill the form.
              </span>
            </div>
          ) : (
            <div className="mt-4 text-[12px] text-[#A8B096] bg-[#FAFAF7] rounded-xl px-3 py-2.5 leading-relaxed">
              💡 Pricing depends on the types you pick and is shown on the final
              step. Filling out the form is free.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#ECEEE4] bg-white flex-shrink-0">
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
