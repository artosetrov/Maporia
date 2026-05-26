"use client";

/**
 * /add — выбор типа создаваемой карточки.
 *
 * Раньше эта страница автоматически создавала пустой `place` и редиректила
 * в редактор. Теперь у нас три типа: Locations / Services / Experiences,
 * поэтому сначала нужно спросить пользователя, ЧТО он создаёт.
 *
 * Поведение:
 *  - Без `?kind=` — показываем экран выбора с тремя карточками.
 *  - С `?kind=location|service|experience` — мгновенно создаём пустую запись
 *    нужного типа (фоллбэк для прямых ссылок и для UX «уже выбрал»).
 *  - `returnTo` пробрасывается в редактор, чтобы Cancel вернул туда же.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import type { Database, PlaceKind } from "../../types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { useUserAccessContext } from "../../contexts/UserAccessContext";
// useAuthRedirect больше не используется — RequireAuth в (auth)/layout.tsx
// гарантирует user. См. feedback_useauthredirect_deps.
import { canUserAddPlace, canUserCreate, canUserCreateMulti, checkQuota } from "../../lib/access";
import type { QuotaCheck } from "../../lib/access";
import { EXTRA_LISTING, PLAN_CONFIG, formatPrice, suggestPlanForKind } from "../../lib/plans";
import { createLink } from "../../lib/placeLinks";
import {
  isOrphanAddDraftCandidate,
  orphanAddDraftCutoff,
  ORPHAN_ADD_DRAFT_CLEANUP_LIMIT,
  ORPHAN_ADD_DRAFT_SELECT,
  type OrphanAddDraftCandidate,
} from "../../lib/placeDrafts";
import Icon, { type IconName } from "../../components/Icon";
import ImpersonationDisclaimer from "../../components/ImpersonationDisclaimer";
import { useImpersonationStatus } from "../../hooks/useImpersonationStatus";
import { sanitizePostgrestValue } from "../../utils";
import { PageSkeleton } from "../../components/Skeleton";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import CreatorPremiumGate from "../../components/CreatorPremiumGate";

type PlacesRow = Database["public"]["Tables"]["places"]["Row"];
type PlaceIdResult = { data: Pick<PlacesRow, "id"> | null; error: PostgrestError | null };

type KindOption = {
  kind: PlaceKind;
  icon: IconName;
  title: string;
  subtitle: string;
  examples: string;
};

const KIND_OPTIONS: KindOption[] = [
  {
    kind: "location",
    icon: "location",
    title: "Location",
    subtitle: "A spot on the map — café, viewpoint, park, hidden gem.",
    examples: "Rooftop bar, secret beach, coffee shop",
  },
  {
    kind: "service",
    icon: "wrench",
    title: "Service",
    subtitle: "Something someone does — with a price and hours.",
    examples: "Massage, photographer, surf instructor",
  },
  {
    kind: "experience",
    icon: "sparkles",
    title: "Experience",
    subtitle: "An event with a schedule and duration (Airbnb-style).",
    examples: "Food tour, workshop, guided trip",
  },
];

function isValidKind(value: string | null): value is PlaceKind {
  return value === "location" || value === "service" || value === "experience";
}

function getKindIcon(kind: PlaceKind): IconName {
  if (kind === "service") return "wrench";
  if (kind === "experience") return "sparkles";
  return "location";
}

function placeContainsKindFilter(kind: "service" | "experience"): string {
  const safeKind = sanitizePostgrestValue(kind);
  return `kind.eq.${safeKind},secondary_kinds.cs.{${safeKind}}`;
}

/**
 * Парсим CSV-список kind'ов из query (`?kinds=service,location`).
 * Дропаем невалидные значения, дедуплицируем, сохраняем порядок появления.
 * Пустая строка / только мусор → пустой массив.
 */
function parseKindsCsv(raw: string | null): PlaceKind[] {
  if (!raw) return [];
  const seen = new Set<PlaceKind>();
  const out: PlaceKind[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (isValidKind(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Из набора выбранных kind'ов выбираем primary для записи в `place.kind`.
 * Приоритет: service > experience > location — потому что:
 *   - kind-router на /id/[id]/page.tsx рендерит OfferPlaceView для service/experience
 *     и legacy view для location. Если карточка содержит и service, и location,
 *     юзеру важнее увидеть service-страницу с ценой.
 *   - У service/experience есть price/schedule fields, у location — нет.
 *
 * Возвращает primary + остальные как secondary_kinds.
 */
function splitPrimaryAndSecondary(kinds: PlaceKind[]): {
  primary: PlaceKind;
  secondary: PlaceKind[];
} {
  if (kinds.length === 0) {
    return { primary: "location", secondary: [] };
  }
  const priority: PlaceKind[] = ["service", "experience", "location"];
  const primary = priority.find((k) => kinds.includes(k)) ?? kinds[0];
  const secondary = kinds.filter((k) => k !== primary);
  return { primary, secondary };
}

export default function AddPlacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: accessLoading, user, access } = useUserAccessContext();
  const impersonation = useImpersonationStatus();
  const isImpersonating = !!impersonation?.active;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Если пользователь нажал на тип без нужного тарифа — показываем модалку. */
  const [paywallKind, setPaywallKind] = useState<PlaceKind | null>(null);
  /** Если тариф позволяет, но достигнут лимит — модалка «докупить или upgrade». */
  const [limitState, setLimitState] = useState<{
    kind: PlaceKind;
    quota: QuotaCheck;
  } | null>(null);
  const [buyingAddon, setBuyingAddon] = useState(false);
  const cleanupStartedRef = useRef(false);

  /**
   * `?linkTo=<placeId>` — после создания авто-создаём place_link к этому place.
   * Направление parent/child вычисляется по kind'ам (см. createAndRedirect).
   * См. docs/PLACE_LINKS_PHASE6_PLAN.md § 4.2.
   */
  const presetLinkTo = useMemo(() => {
    const v = searchParams.get("linkTo");
    return v && v.trim().length > 0 ? v : null;
  }, [searchParams]);
  const returnTo = useMemo(() => {
    const explicit = searchParams.get("returnTo");
    if (explicit) return explicit;
    // Если зашли через linkTo — Cancel и пост-save должны возвращать в edit/links
    // карточки, к которой мы линкуемся.
    if (presetLinkTo) return `/places/${presetLinkTo}/edit/links`;
    return "/profile";
  }, [searchParams, presetLinkTo]);
  const presetKindParam = searchParams.get("kind");
  const presetKindsParam = searchParams.get("kinds");
  const presetKind: PlaceKind | null = isValidKind(presetKindParam) ? presetKindParam : null;
  /**
   * Мульти-kind из BecomeProviderModal (?kinds=service,location).
   * Если ни kinds, ни kind не задан — массив пустой, рисуется выбор-визард.
   */
  const presetKinds: PlaceKind[] = useMemo(() => {
    const fromCsv = parseKindsCsv(presetKindsParam);
    if (fromCsv.length > 0) return fromCsv;
    return presetKind ? [presetKind] : [];
  }, [presetKindsParam, presetKind]);

  const canAdd = canUserAddPlace(access);

  async function cleanupOwnOrphanDrafts(): Promise<number> {
    if (!user) return 0;

    const { data, error: loadError } = await supabase
      .from("places")
      .select(ORPHAN_ADD_DRAFT_SELECT)
      .eq("created_by", user.id)
      .eq("title", "")
      .eq("is_hidden", true)
      .lt("created_at", orphanAddDraftCutoff())
      .limit(ORPHAN_ADD_DRAFT_CLEANUP_LIMIT);

    if (loadError) {
      console.warn("[add] orphan draft cleanup load failed:", loadError.message);
      return 0;
    }

    const draftIds = ((data ?? []) as OrphanAddDraftCandidate[])
      .filter(isOrphanAddDraftCandidate)
      .map((place) => place.id);
    if (draftIds.length === 0) return 0;

    const [
      linksAsParent,
      linksAsChild,
      photosResult,
      commentsResult,
      reactionsResult,
      placesResult,
    ] = await Promise.all([
      supabase.from("place_links").delete().in("parent_place_id", draftIds),
      supabase.from("place_links").delete().in("child_place_id", draftIds),
      supabase.from("place_photos").delete().in("place_id", draftIds),
      supabase.from("comments").delete().in("place_id", draftIds),
      supabase.from("reactions").delete().in("place_id", draftIds),
      supabase.from("places").delete().eq("created_by", user.id).in("id", draftIds),
    ]);

    const cleanupError =
      linksAsParent.error ||
      linksAsChild.error ||
      photosResult.error ||
      commentsResult.error ||
      reactionsResult.error ||
      placesResult.error;

    if (cleanupError) {
      console.warn("[add] orphan draft cleanup failed:", cleanupError.message);
      return 0;
    }

    return draftIds.length;
  }

  // Гейт по авторизации.
  // 2026-05-10: убрали replaceToAuth() вызов + replaceToAuth из deps —
  // (auth)/layout.tsx → RequireAuth уже рендерит null до user, эта ветка
  // недостижима. replaceToAuth — fresh ref на каждый render, в deps
  // вызывал бы re-render loop (см. feedback_useauthredirect_deps).
  useEffect(() => {
    if (accessLoading) return;
    if (!user) return;
  }, [accessLoading, user]);

  useEffect(() => {
    if (accessLoading || !user || cleanupStartedRef.current) return;
    cleanupStartedRef.current = true;
    void cleanupOwnOrphanDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, user]);

  // Если пользователь пришёл с ?kind= или ?kinds=… — создаём сразу.
  useEffect(() => {
    if (accessLoading || !user || !canAdd || presetKinds.length === 0 || creating) return;
    void createAndRedirect(presetKinds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, user, canAdd, presetKinds]);

  async function createAndRedirect(kinds: PlaceKind[]) {
    if (!user) return;
    if (kinds.length === 0) return;

    const { primary, secondary } = splitPrimaryAndSecondary(kinds);

    await cleanupOwnOrphanDrafts();

    // 1) Базовое право публиковать ВСЕ выбранные kind'ы одновременно.
    if (!canUserCreateMulti(access, kinds)) {
      // Для пейволла показываем тот kind, по которому план не покрывает —
      // это даёт более точный upsell-message. Берём primary как fallback.
      const blockingKind =
        kinds.find((k) => !canUserCreate(access, k)) ?? primary;
      setPaywallKind(blockingKind);
      return;
    }

    // 2) Проверяем quota до insert, чтобы показать нормальную модалку.
    //    Location считается только по primary `kind='location'`. Service/experience
    //    считаются по primary OR secondary, потому secondary service/experience
    //    требуют direct capability и должны расходовать соответствующую квоту.
    const hasService = kinds.includes("service");
    const hasExperience = kinds.includes("experience");

    {
      const [locationCountRes, serviceCountRes, experienceCountRes, profRes] = await Promise.all([
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id)
          .eq("kind", "location"),
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id)
          .or(placeContainsKindFilter("service")),
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id)
          .or(placeContainsKindFilter("experience")),
        supabase.from("profiles").select("bonus_listing_credits").eq("id", user.id).single(),
      ]);

      const locations = locationCountRes.count ?? 0;
      const services = serviceCountRes.count ?? 0;
      const experiences = experienceCountRes.count ?? 0;
      const credits =
        ((profRes.data as { bonus_listing_credits?: number } | null)?.bonus_listing_credits) ?? 0;

      const kindsToCheck: PlaceKind[] = [primary];
      if (hasService) kindsToCheck.push("service");
      if (hasExperience) kindsToCheck.push("experience");

      for (const k of Array.from(new Set(kindsToCheck))) {
        const quota = checkQuota(access, k, services, experiences, credits, locations);
        if (!quota.allowed) {
          if (quota.reason === "no_plan") {
            setPaywallKind(k);
          } else {
            setLimitState({ kind: k, quota });
          }
          return;
        }
      }
    }

    setError(null);
    setCreating(true);

    try {
      const payload = {
        kind: primary,
        secondary_kinds: secondary,
        title: "",
        description: null,
        city: null,
        address: null,
        lat: null,
        lng: null,
        categories: null,
        link: null,
        access_level: "public",
        is_hidden: true, // черновик до заполнения обязательных полей
        created_by: user.id,
        schedule: primary === "experience" ? { type: "on_request" } : null,
      };

      const result = (await supabase
        .from("places")
        // @ts-expect-error - Supabase infers Insert as never; payload matches Database['public']['Tables']['places']['Insert']
        .insert(payload)
        .select("id")
        .single()) as PlaceIdResult;

      const placeData = result.data;
      const createError = result.error;

      if (createError) {
        console.error("Error creating place:", createError);

        // Серверный trigger enforce_place_quota мог отклонить insert.
        // Эти кейсы реалистичны при race condition (client-check прошёл,
        // но между ним и insert юзер успел создать ещё одну карточку
        // в другом окне) или если кто-то лезет в БД мимо клиента.
        // Перехватываем по PG codes и показываем нормальные модалки.
        const code = createError.code;
        const msg = createError.message || "";

        if (code === "P0001" || msg.includes("NO_PLAN")) {
          // Показываем пейволл по primary kind — он же ведущий в pricing-suggestion.
          setPaywallKind(primary);
          setCreating(false);
          return;
        }

        if (code === "P0002" || msg.includes("QUOTA_EXCEEDED")) {
          // На сервере план разрешает kind, но лимит/кредиты выбраны.
          // Подсчитаем актуальную квоту, чтобы показать корректные числа.
          const limitKind: PlaceKind = primary;
          {
            const [l, s, e, p] = await Promise.all([
              supabase.from("places").select("id", { count: "exact", head: true })
                .eq("created_by", user.id)
                .eq("kind", "location"),
              supabase.from("places").select("id", { count: "exact", head: true })
                .eq("created_by", user.id)
                .or(placeContainsKindFilter("service")),
              supabase.from("places").select("id", { count: "exact", head: true })
                .eq("created_by", user.id)
                .or(placeContainsKindFilter("experience")),
              supabase.from("profiles").select("bonus_listing_credits").eq("id", user.id).single(),
            ]);
            const refreshedQuota = checkQuota(
              access,
              limitKind,
              s.count ?? 0,
              e.count ?? 0,
              ((p.data as { bonus_listing_credits?: number } | null)?.bonus_listing_credits) ?? 0,
              l.count ?? 0
            );
            setLimitState({ kind: limitKind, quota: refreshedQuota });
          }
          setCreating(false);
          return;
        }

        const errorMessage =
          createError.message ||
          createError.code ||
          createError.details ||
          createError.hint ||
          "Failed to create place. Check console for details.";
        setError(errorMessage);
        setCreating(false);
        return;
      }

      if (!placeData?.id) {
        setError("Failed to create place. No ID returned. Check RLS policies.");
        setCreating(false);
        return;
      }

      // Авто-link, если пришли с ?linkTo=. Бэк сам решит status (same-owner=active,
      // cross-owner=pending). Ошибка линка не должна откатывать создание — карточка
      // уже есть, line можно повторить руками из /edit/links. Логируем и идём дальше.
      if (presetLinkTo) {
        try {
          const { data: target, error: targetErr } = await supabase
            .from("places")
            .select("id, kind")
            .eq("id", presetLinkTo)
            .maybeSingle();
          if (targetErr || !target) {
            console.warn(
              "[add] linkTo target not found or inaccessible:",
              presetLinkTo,
              targetErr?.message,
            );
          } else {
            // Supabase-cli generates `never` для select() из-за branded types;
            // в этой кодовой базе cast — стандартный workaround.
            const targetTyped = target as { id: string; kind: PlaceKind | null };
            const targetKind = targetTyped.kind;
            const newKind = primary;
            let linkParent: string | null = null;
            let linkChild: string | null = null;

            // location-parent + service|experience-child — единственно валидная пара.
            if (
              newKind === "location" &&
              (targetKind === "service" || targetKind === "experience")
            ) {
              linkParent = placeData.id;
              linkChild = targetTyped.id;
            } else if (
              (newKind === "service" || newKind === "experience") &&
              targetKind === "location"
            ) {
              linkParent = targetTyped.id;
              linkChild = placeData.id;
            }

            if (linkParent && linkChild) {
              try {
                await createLink({ parentId: linkParent, childId: linkChild });
              } catch (linkErr) {
                console.warn(
                  "[add] createLink failed (place created anyway):",
                  linkErr,
                );
              }
            } else {
              console.warn(
                "[add] linkTo kind mismatch — skipping auto-link",
                { newKind, targetKind },
              );
            }
          }
        } catch (e) {
          console.warn("[add] linkTo flow exception:", e);
        }
      }

      const editUrl = `/places/${placeData.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
      router.replace(editUrl);
    } catch (err) {
      console.error("Exception creating place:", err);
      setError(err instanceof Error ? err.message : "Failed to create place");
      setCreating(false);
    }
  }

  // Создание идёт — показываем спиннер
  if (creating) {
    return <PageSkeleton />;
  }

  // While access is loading
  if (accessLoading) {
    return <PageSkeleton />;
  }

  // Premium-гейт
  if (!canAdd) {
    return (
      <ErrorBoundary>
        <CreatorPremiumGate
          onPrimary={() => router.push("/pricing")}
          onSecondary={() => router.push("/")}
        />
      </ErrorBoundary>
    );
  }

  // Главный экран — три карточки
  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 sm:mb-10">
          <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] mb-2">
            What are you adding?
          </h1>
          <p className="text-sm text-[#6F7A5A]">
            Pick a listing type. Next, you&apos;ll fill in the details — photos, title, description.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => createAndRedirect([opt.kind])}
              className="group relative w-full text-left rounded-2xl border border-[#ECEEE4] bg-white p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-[#8F9E4F] transition focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2"
              aria-label={`Create ${opt.title}`}
            >
              <div className="flex items-start gap-4">
                <div
                  aria-hidden
                  className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF7] text-[#6F7A5A]"
                >
                  <Icon name={opt.icon} size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-fraunces font-semibold text-[#1F2A1F] text-lg mb-1">
                    {opt.title}
                  </div>
                  <div className="text-sm text-[#3F4A35] mb-2">{opt.subtitle}</div>
                  <div className="text-xs text-[#6F7A5A]">
                    For example: {opt.examples}
                  </div>
                </div>
                <Icon
                  name="forward"
                  size={20}
                  className="mt-1 text-[#A8B096] group-hover:text-[#8F9E4F] transition"
                />
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push(returnTo)}
            className="text-sm text-[#6F7A5A] underline hover:text-[#1F2A1F] transition"
          >
            Cancel
          </button>
        </div>
        </div>

        {/* Пейволл при выборе service/experience без подходящего тарифа */}
        {paywallKind && (
          <PaywallModal
            kind={paywallKind}
            isImpersonating={isImpersonating}
            onClose={() => setPaywallKind(null)}
            onUpgrade={() => router.push("/pricing")}
          />
        )}

        {/* Модалка достигнутого лимита */}
        {limitState && (
          <LimitReachedModal
            kind={limitState.kind}
            quota={limitState.quota}
            buying={buyingAddon}
            isImpersonating={isImpersonating}
            onClose={() => setLimitState(null)}
            onBuyAddon={async () => {
            if (isImpersonating) {
              setError("Stripe-операции отключены в режиме impersonation.");
              return;
            }
            setBuyingAddon(true);
            setError(null);
            try {
              const { data: sess } = await supabase.auth.getSession();
              const accessToken = sess.session?.access_token;
              if (!accessToken) {
                router.push(`/auth?next=${encodeURIComponent("/add")}`);
                return;
              }
              const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ access_token: accessToken, addon: "extra_listing" }),
              });
              const data = (await res.json()) as { url?: string; error?: string };
              if (!res.ok || !data.url) {
                setError(data.error || "Не удалось открыть оплату");
                setBuyingAddon(false);
                return;
              }
              window.location.href = data.url;
            } catch (err) {
              setError(err instanceof Error ? err.message : "Не удалось открыть оплату");
              setBuyingAddon(false);
            }
            }}
            onUpgrade={() => router.push("/pricing")}
          />
        )}
      </main>
    </ErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Пейволл-модалка
// ─────────────────────────────────────────────────────────────────────────────

function PaywallModal({
  kind,
  isImpersonating,
  onClose,
  onUpgrade,
}: {
  kind: PlaceKind;
  isImpersonating: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const requiredPlan = suggestPlanForKind(kind);
  const planCfg = PLAN_CONFIG[requiredPlan];

  const kindLabel =
    kind === "service" ? "a service" : kind === "experience" ? "an experience" : "a location";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6"
      >
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[#EEF0E0] text-[#556036]" aria-hidden>
          <Icon name={getKindIcon(kind)} size={24} />
        </div>
        <h2
          id="paywall-title"
          className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2"
        >
          To create {kindLabel}, you need {planCfg.display.name}
        </h2>
        <p className="text-sm text-[#3F4A35] mb-4">{planCfg.display.audience}</p>
        <ul className="space-y-2 mb-5">
          {planCfg.display.features
            .filter((f) => f.included)
            .slice(0, 4)
            .map((f) => (
              <li key={f.label} className="flex items-start gap-2 text-sm text-[#1F2A1F]">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#8F9E4F]/15 text-[#556036]">
                  <Icon name="check" size={12} />
                </span>
                {f.label}
              </li>
            ))}
        </ul>
        {isImpersonating && (
          <div className="mb-4">
            <ImpersonationDisclaimer compact />
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-[#ECEEE4] bg-white px-5 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onUpgrade}
            disabled={isImpersonating}
            title={isImpersonating ? "Покупки отключены в режиме impersonation" : undefined}
            className={cx(
              "flex-1 h-11 rounded-xl px-5 text-sm font-medium transition",
              isImpersonating
                ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                : "bg-[#8F9E4F] text-white hover:bg-[#556036]"
            )}
          >
            {isImpersonating ? "Locked" : "See plans"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Limit reached — offer add-on or upgrade
// ─────────────────────────────────────────────────────────────────────────────

function LimitReachedModal({
  kind,
  quota,
  buying,
  isImpersonating,
  onClose,
  onBuyAddon,
  onUpgrade,
}: {
  kind: PlaceKind;
  quota: QuotaCheck;
  buying: boolean;
  isImpersonating: boolean;
  onClose: () => void;
  onBuyAddon: () => void;
  onUpgrade: () => void;
}) {
  const kindLabel =
    kind === "service" ? "services" : kind === "experience" ? "experiences" : "locations";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white border border-[#ECEEE4] shadow-lg p-6"
      >
        <div className="text-3xl mb-3" aria-hidden>📦</div>
        <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F] mb-2">
          {kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1)} limit reached
        </h2>
        <p className="text-sm text-[#3F4A35] mb-1">
          You&apos;re using {quota.used} of {quota.limit ?? "∞"} listings on your current plan.
        </p>
        {quota.bonusCredits > 0 && (
          <p className="text-xs text-[#6F7A5A] mb-3">
            Including {quota.bonusCredits} extra slots you&apos;ve purchased.
          </p>
        )}
        <p className="text-sm text-[#1F2A1F] mb-4">
          Buy one more slot for <strong>{formatPrice(EXTRA_LISTING.price)}</strong> or upgrade to a bigger plan.
        </p>
        {isImpersonating && (
          <div className="mb-4">
            <ImpersonationDisclaimer compact />
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBuyAddon}
            disabled={buying || isImpersonating}
            title={isImpersonating ? "Покупки отключены в режиме impersonation" : undefined}
            className={cx(
              "flex-1 h-11 rounded-xl px-5 text-sm font-medium transition",
              isImpersonating
                ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                : "bg-[#8F9E4F] text-white hover:bg-[#556036]",
              buying && !isImpersonating && "opacity-70 cursor-wait"
            )}
          >
            {isImpersonating
              ? "Locked"
              : buying
              ? "Opening Stripe…"
              : `+1 slot for ${formatPrice(EXTRA_LISTING.price)}`}
          </button>
          <button
            type="button"
            onClick={onUpgrade}
            disabled={isImpersonating}
            title={isImpersonating ? "Покупки отключены в режиме impersonation" : undefined}
            className={cx(
              "flex-1 h-11 rounded-xl px-5 text-sm font-medium transition",
              isImpersonating
                ? "border border-[#DADDD0] bg-white text-[#A8B096] cursor-not-allowed"
                : "border border-[#1F2A1F] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]"
            )}
          >
            Switch plan
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="block mx-auto mt-3 text-xs text-[#6F7A5A] underline hover:text-[#1F2A1F]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}
