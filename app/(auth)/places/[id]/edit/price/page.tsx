"use client";

/**
 * /places/[id]/edit/price — редактор цены для service / experience.
 *
 * Поля: price_amount (numeric), price_currency (USD/EUR/RUB/GBP),
 * price_unit (fixed/from/per_hour/per_person/per_day/per_month/per_session),
 * price_options (jsonb array for additional packages).
 *
 * Для location редактор недоступен (редирект в edit-хаб) — у локаций нет
 * единой цены, они либо «бесплатные» (парк, спот), либо «зависит» (бар).
 */

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";

type PlacePriceRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "created_by" | "kind" | "price_amount" | "price_currency" | "price_unit" | "price_options"
>;
type PriceOptionRow = NonNullable<Database["public"]["Tables"]["places"]["Row"]["price_options"]>[number];

type ErrorLike = {
  code?: string;
  message?: string;
};

type PlacePriceLoadResult = {
  data: PlacePriceRow | null;
  error: unknown | null;
  supportsPriceOptions: boolean;
};

function isMissingPriceOptionsColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as ErrorLike;
  return (
    err.code === "42703" &&
    (err.message?.includes("places.price_options") === true ||
      err.message?.includes("price_options") === true)
  );
}

async function loadPlacePrice(placeId: string): Promise<PlacePriceLoadResult> {
  const primary = (await supabase
    .from("places")
    .select("created_by, kind, price_amount, price_currency, price_unit, price_options")
    .eq("id", placeId)
    .single()) as { data: PlacePriceRow | null; error: unknown | null };

  if (!primary.error) {
    return {
      data: primary.data as PlacePriceRow,
      error: null,
      supportsPriceOptions: true,
    };
  }

  if (!isMissingPriceOptionsColumn(primary.error)) {
    return { data: null, error: primary.error, supportsPriceOptions: true };
  }

  const fallback = (await supabase
    .from("places")
    .select("created_by, kind, price_amount, price_currency, price_unit")
    .eq("id", placeId)
    .single()) as {
      data: Omit<PlacePriceRow, "price_options"> | null;
      error: unknown | null;
    };

  if (fallback.error || !fallback.data) {
    return {
      data: null,
      error: fallback.error ?? primary.error,
      supportsPriceOptions: false,
    };
  }

  return {
    data: { ...fallback.data, price_options: null },
    error: null,
    supportsPriceOptions: false,
  };
}

const CURRENCIES = ["USD", "EUR", "RUB", "GBP"] as const;
type Currency = (typeof CURRENCIES)[number];

const PRICE_UNITS = [
  { value: "fixed",       label: "Fixed price",  hint: "Just one number, no suffix" },
  { value: "from",        label: "Starts from",  hint: "Indicates a minimum / from-price" },
  { value: "per_hour",    label: "Per hour",     hint: "Charged hourly (massage, lessons)" },
  { value: "per_person",  label: "Per person",   hint: "Per attendee (group tours)" },
  { value: "per_day",     label: "Per day",      hint: "Daily rate (rentals, retreats)" },
  { value: "per_month",   label: "Per month",    hint: "Monthly rate (clubs, memberships)" },
  { value: "per_session", label: "Per session",  hint: "Per visit / session" },
] as const;
type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

type PriceOptionDraft = {
  id: string;
  groupLabel: string;
  label: string;
  amount: string;
  compareAtAmount: string;
  currency: Currency;
  unit: PriceUnit;
  durationMinutes: string;
  badge: string;
  isFeatured: boolean;
  note: string;
  /** Включает «цена по запросу» — числовая цена не используется. */
  onRequest: boolean;
  /** Текст-замена для «цена по запросу» (если пусто — fallback «Contact for price»). */
  requestText: string;
};

const DEFAULT_REQUEST_TEXT = "Contact for price";

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
  GBP: "£",
};

const PRICE_UNIT_SUFFIX: Record<PriceUnit, string> = {
  fixed: "",
  from: "from",
  per_hour: "/ hr",
  per_person: "/ person",
  per_day: "/ day",
  per_month: "/ month",
  per_session: "/ session",
};

type PriceOptionValidation = {
  amountValid: boolean;
  compareAtAmountValid: boolean;
  durationValid: boolean;
  valid: boolean;
};

function formatMoney(amount: number | string | null | undefined, currency: Currency | string | null | undefined): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const parsed = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(parsed)) return null;
  const cur = ((currency || "USD").toUpperCase() as Currency);
  const symbol = CURRENCY_SYMBOLS[cur] ?? "";
  const formatted = parsed % 1 === 0 ? Math.round(parsed).toString() : parsed.toFixed(2);
  return symbol ? `${symbol}${formatted}` : `${formatted} ${cur}`;
}

function formatPriceWithUnit(
  amount: number | string | null | undefined,
  currency: Currency | string | null | undefined,
  unit: PriceUnit | string | null | undefined
): string | null {
  const money = formatMoney(amount, currency);
  if (!money) return null;
  const priceUnit = unit as PriceUnit | null | undefined;
  const suffix = priceUnit ? PRICE_UNIT_SUFFIX[priceUnit] ?? "" : "";
  if (priceUnit === "from") return `from ${money}`;
  return suffix ? `${money} ${suffix}` : money;
}

function getPriceUnitLabel(unit: PriceUnit | string | null | undefined): string {
  return PRICE_UNITS.find((item) => item.value === unit)?.label ?? "Fixed price";
}

function getOptionValidation(option: PriceOptionDraft): PriceOptionValidation {
  const parsedAmount = option.amount.trim() === "" ? null : Number(option.amount);
  const parsedCompareAtAmount =
    option.compareAtAmount.trim() === "" ? null : Number(option.compareAtAmount);
  const parsedDuration =
    option.durationMinutes.trim() === "" ? null : Number(option.durationMinutes);

  // В режиме on-request числовая цена не нужна — опция всегда валидна по amount.
  const amountValid =
    option.onRequest ||
    (parsedAmount !== null &&
      Number.isFinite(parsedAmount) &&
      parsedAmount >= 0 &&
      parsedAmount < 1_000_000);
  const compareAtAmountValid =
    parsedCompareAtAmount === null ||
    (Number.isFinite(parsedCompareAtAmount) &&
      parsedCompareAtAmount >= 0 &&
      parsedCompareAtAmount < 1_000_000);
  const durationValid =
    parsedDuration === null ||
    (Number.isFinite(parsedDuration) && parsedDuration > 0 && parsedDuration <= 24 * 60);

  return {
    amountValid,
    compareAtAmountValid,
    durationValid,
    valid: amountValid && compareAtAmountValid && durationValid,
  };
}

function getOptionTitle(option: PriceOptionDraft, index: number): string {
  return option.groupLabel.trim() || option.label.trim() || `Option ${index + 1}`;
}

function getOptionSubtitle(option: PriceOptionDraft): string {
  const parts = [
    option.label.trim(),
    option.onRequest ? "On request" : getPriceUnitLabel(option.unit),
    option.durationMinutes.trim() ? `${option.durationMinutes.trim()} min` : "",
    option.note.trim(),
  ].filter(Boolean);
  return parts.join(" · ") || "Fill in amount and details";
}

function getOptionHeadlinePrice(option: PriceOptionDraft): string | null {
  if (option.onRequest) {
    const custom = option.requestText.trim();
    return custom || DEFAULT_REQUEST_TEXT;
  }
  return formatPriceWithUnit(option.amount, option.currency, option.unit);
}

function getRailLabel(option: PriceOptionDraft, index: number): string {
  const title = getOptionTitle(option, index).replace("Monthly Membership", "Monthly");
  const price = option.onRequest
    ? (option.requestText.trim() || DEFAULT_REQUEST_TEXT)
    : formatMoney(option.amount, option.currency) ?? "empty";
  return `${title} · ${price}`;
}

function newPriceOptionDraft(preset?: Partial<Omit<PriceOptionDraft, "id">>): PriceOptionDraft {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    groupLabel: preset?.groupLabel ?? "",
    label: preset?.label ?? "",
    amount: preset?.amount ?? "",
    compareAtAmount: preset?.compareAtAmount ?? "",
    currency: preset?.currency ?? "USD",
    unit: preset?.unit ?? "fixed",
    durationMinutes: preset?.durationMinutes ?? "",
    badge: preset?.badge ?? "",
    isFeatured: preset?.isFeatured ?? false,
    note: preset?.note ?? "",
    onRequest: preset?.onRequest ?? false,
    requestText: preset?.requestText ?? "",
  };
}

function stringifyNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function parsePriceOptions(raw: unknown): PriceOptionDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PriceOptionDraft | null => {
      if (!item || typeof item !== "object") return null;
      const value = item as Partial<PriceOptionRow>;
      const currency = (CURRENCIES as readonly string[]).includes(value.currency || "")
        ? (value.currency as Currency)
        : "USD";
      const unit = PRICE_UNITS.some((u) => u.value === value.unit)
        ? (value.unit as PriceUnit)
        : "fixed";
      const amount = typeof value.amount === "number" && Number.isFinite(value.amount)
        ? String(value.amount)
        : "";
      return {
        id: typeof value.id === "string" && value.id.length > 0 ? value.id : newPriceOptionDraft().id,
        groupLabel: typeof value.group_label === "string" ? value.group_label : "",
        label: typeof value.label === "string" ? value.label : "",
        amount,
        compareAtAmount: stringifyNumber(value.compare_at_amount),
        currency,
        unit,
        durationMinutes: stringifyNumber(value.duration_minutes),
        badge: typeof value.badge === "string" ? value.badge : "",
        isFeatured: value.is_featured === true,
        note: typeof value.note === "string" ? value.note : "",
        onRequest: value.on_request === true,
        requestText: typeof value.request_text === "string" ? value.request_text : "",
      };
    })
    .filter((item): item is PriceOptionDraft => Boolean(item));
}

function normalizePriceOptions(options: PriceOptionDraft[]): PriceOptionRow[] {
  return options.flatMap((option, index): PriceOptionRow[] => {
    const parsed = Number(option.amount);
    const hasValidAmount =
      Number.isFinite(parsed) && parsed >= 0 && parsed < 1_000_000;

    // Пропускаем опции без цены и без on_request — это «пустая» карточка.
    if (!option.onRequest && !hasValidAmount) return [];

    const compareAtAmount = option.compareAtAmount.trim() === ""
      ? null
      : Number(option.compareAtAmount);
    const durationMinutes = option.durationMinutes.trim() === ""
      ? null
      : Number(option.durationMinutes);
    return [{
      id: option.id,
      group_label: option.groupLabel.trim() || null,
      label: option.label.trim() || null,
      amount: option.onRequest ? null : parsed,
      compare_at_amount:
        compareAtAmount !== null && Number.isFinite(compareAtAmount) && compareAtAmount >= 0
          ? compareAtAmount
          : null,
      currency: option.currency,
      unit: option.unit,
      duration_minutes:
        durationMinutes !== null && Number.isFinite(durationMinutes) && durationMinutes > 0
          ? Math.round(durationMinutes)
          : null,
      badge: option.badge.trim() || null,
      is_featured: option.isFeatured,
      note: option.note.trim() || null,
      sort_order: index,
      on_request: option.onRequest || null,
      request_text: option.onRequest ? (option.requestText.trim() || null) : null,
    }];
  });
}

type PageProps = { params: Promise<{ id: string }> };

export default function PriceEditorPage(props: PageProps) {
  return (
    <ErrorBoundary>
      <PriceEditorPageContent {...props} />
    </ErrorBoundary>
  );
}

function PriceEditorPageContent(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [unit, setUnit] = useState<PriceUnit>("fixed");
  const [priceOptions, setPriceOptions] = useState<PriceOptionDraft[]>([]);
  const [openOptionId, setOpenOptionId] = useState<string | null>(null);
  const [supportsPriceOptions, setSupportsPriceOptions] = useState(true);

  const [originalAmount, setOriginalAmount] = useState<string>("");
  const [originalCurrency, setOriginalCurrency] = useState<Currency>("USD");
  const [originalUnit, setOriginalUnit] = useState<PriceUnit>("fixed");
  const [originalOptionsJson, setOriginalOptionsJson] = useState<string>("[]");

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError, supportsPriceOptions } =
        await loadPlacePrice(placeId);
      setSupportsPriceOptions(supportsPriceOptions);

      const data = rawData as PlacePriceRow | null;
      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      // Ownership / admin
      const isOwner = data.created_by === user.id;
      if (!isOwner && !isUserAdmin(access)) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Locations — нет редактора цены
      if (data.kind === "location") {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const initAmount = data.price_amount != null ? String(data.price_amount) : "";
      const initCurrency: Currency =
        (CURRENCIES as readonly string[]).includes(data.price_currency || "USD")
          ? (data.price_currency as Currency)
          : "USD";
      const initUnit: PriceUnit = (data.price_unit as PriceUnit) || "fixed";
      const initOptions = parsePriceOptions(data.price_options);
      const initOptionsJson = JSON.stringify(normalizePriceOptions(initOptions));

      setAmount(initAmount);
      setCurrency(initCurrency);
      setUnit(initUnit);
      setPriceOptions(initOptions);
      setOpenOptionId(null);

      setOriginalAmount(initAmount);
      setOriginalCurrency(initCurrency);
      setOriginalUnit(initUnit);
      setOriginalOptionsJson(initOptionsJson);

      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const parsedAmount = amount.trim() === "" ? null : Number(amount);
  const isAmountValid =
    amount.trim() === "" ||
    (parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount >= 0 && parsedAmount < 1_000_000);
  const normalizedOptions = normalizePriceOptions(priceOptions);
  const optionsJson = JSON.stringify(normalizedOptions);
  const areOptionsValid = priceOptions.every((option) => getOptionValidation(option).valid);

  const hasChanges =
    amount.trim() !== originalAmount.trim() ||
    currency !== originalCurrency ||
    unit !== originalUnit ||
    optionsJson !== originalOptionsJson;
  const canSave = hasChanges && isAmountValid && areOptionsValid && !saving;
  const basePriceText = formatPriceWithUnit(amount, currency, unit);
  const featuredOption = useMemo(
    () => priceOptions.find((option) => option.isFeatured) ?? priceOptions[0] ?? null,
    [priceOptions]
  );
  const previewPriceText =
    featuredOption ? formatPriceWithUnit(featuredOption.amount, featuredOption.currency, featuredOption.unit) : basePriceText;

  function updatePriceOption(id: string, patch: Partial<PriceOptionDraft>) {
    setPriceOptions((prev) => prev.map((option) => option.id === id ? { ...option, ...patch } : option));
    setError(null);
  }

  function addPriceOption() {
    const draft = newPriceOptionDraft();
    setPriceOptions((prev) => [...prev, draft]);
    setOpenOptionId(draft.id);
    setError(null);
  }

  function addTrialOption() {
    const draft = newPriceOptionDraft({
      groupLabel: "Trial Lesson",
      label: "45 minutes",
      durationMinutes: "45",
      badge: "New student promo",
      unit: "fixed",
    });
    setPriceOptions((prev) => [...prev, draft]);
    setOpenOptionId(draft.id);
    setError(null);
  }

  function addMembershipOption() {
    const draft = newPriceOptionDraft({
      groupLabel: "Monthly Membership",
      label: "45 min / week",
      badge: "Most popular",
      unit: "per_month",
      isFeatured: true,
    });
    setPriceOptions((prev) => [...prev, draft]);
    setOpenOptionId(draft.id);
    setError(null);
  }

  function removePriceOption(id: string) {
    setPriceOptions((prev) => prev.filter((option) => option.id !== id));
    setOpenOptionId((current) => current === id ? null : current);
    setError(null);
  }

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    if (!supportsPriceOptions && normalizedOptions.length > 0) {
      setSaving(false);
      setError("Pricing menu needs the places.price_options database column. Apply scripts/sql/fix-place-editor-admin-and-price-options.sql first.");
      return;
    }

    const payload: {
      price_amount: number | null;
      price_currency: string | null;
      price_unit: string | null;
      price_options?: PriceOptionRow[] | null;
    } = {
      price_amount: parsedAmount,
      price_currency: parsedAmount === null ? null : currency,
      price_unit: parsedAmount === null ? null : unit,
    };
    if (supportsPriceOptions) {
      payload.price_options = normalizedOptions.length > 0 ? normalizedOptions : null;
    }

    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update(payload)
      .eq("id", placeId);

    if (!isUserAdmin(access)) {
      updateQuery.eq("created_by", user.id);
    }

    const { error: updateError } = await updateQuery.select();
    setSaving(false);

    if (updateError) {
      console.error("Update price error:", updateError);
      setError(updateError.message || "Failed to save price");
      return;
    }

    if (navigator.vibrate) navigator.vibrate(10);
    router.push(`/places/${placeId}/edit`);
  }

  function handleCancel() {
    router.push(`/places/${placeId}/edit`);
  }

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            <div className="h-6 w-32 bg-[#ECEEE4] rounded animate-pulse" />
            <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <div className="sticky top-0 z-30 border-b border-[#ECEEE4] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            <button
              onClick={handleCancel}
              className="rounded-lg p-2 -ml-2 text-[#1F2A1F] transition hover:bg-[#FAFAF7]"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1 className="font-fraunces text-2xl font-semibold text-[#1F2A1F]">
              Price
            </h1>
            <div className="hidden w-9 items-center justify-end text-[#6F7A5A] lg:flex">
              <Icon name="eye" size={18} />
            </div>
            <div className="w-9 lg:hidden" />
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-6 pb-28 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:py-8">
        <div className="min-w-0 space-y-7">
          {error && (
            <div className="rounded-lg border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
              {error}
            </div>
          )}

          {!supportsPriceOptions && (
            <div className="rounded-lg border border-[#D6B25E]/40 bg-[#D6B25E]/10 p-3 text-sm text-[#6F5A23]">
              Pricing menu needs the places.price_options database column before menu prices can be saved.
            </div>
          )}

          <section className="space-y-4">
            <div>
              <h2 className="font-fraunces text-3xl font-semibold leading-tight text-[#1F2A1F]">
                Main price
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6F7A5A]">
                Keep this as the headline price, or leave it empty when the offer is by request.
              </p>
            </div>

            <div className="rounded-lg border border-[#ECEEE4] bg-white p-4 shadow-sm">
              <label className="block text-sm font-semibold text-[#1F2A1F]" htmlFor="price-amount">
                Amount
              </label>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_128px]">
                <input
                  id="price-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                  placeholder="0.00"
                  className={cx(
                    "min-h-12 w-full min-w-0 rounded-lg border px-4 text-xl font-semibold text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition",
                    isAmountValid
                      ? "border-[#ECEEE4] bg-[#FAFAF7] focus:border-[#8F9E4F] focus:bg-white"
                      : "border-[#C96A5B]/50 bg-[#C96A5B]/10 focus:border-[#C96A5B] focus:bg-white"
                  )}
                  autoFocus
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  disabled={parsedAmount === null}
                  className={cx(
                    "min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-4 text-base font-semibold text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white",
                    parsedAmount === null && "cursor-not-allowed opacity-50"
                  )}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <p className={cx("mt-2 text-xs", isAmountValid ? "text-[#6F7A5A]" : "text-[#C96A5B]")}>
                {!isAmountValid
                  ? "Enter a non-negative number under 1,000,000"
                  : parsedAmount === null
                    ? "Buyers will see Price on request until you enter an amount."
                    : "Shown on the offer card and listing page."}
              </p>
            </div>

            <div className="rounded-lg border border-[#ECEEE4] bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-[#1F2A1F]">
                How is this charged?
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {PRICE_UNITS.map((u) => {
                  const active = unit === u.value;
                  return (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => setUnit(u.value)}
                      disabled={parsedAmount === null}
                      className={cx(
                        "min-h-[64px] rounded-lg border px-3 py-3 text-left transition",
                        parsedAmount === null && "cursor-not-allowed opacity-50",
                        active
                          ? "border-[#8F9E4F] bg-[#8F9E4F]/10"
                          : "border-[#ECEEE4] bg-white hover:bg-[#FAFAF7]"
                      )}
                    >
                      <div className="text-sm font-semibold text-[#1F2A1F]">{u.label}</div>
                      <div className="mt-0.5 text-xs leading-snug text-[#6F7A5A]">{u.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-fraunces text-3xl font-semibold leading-tight text-[#1F2A1F]">
                  Pricing menu
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6F7A5A]">
                  Add packages, trial lessons, memberships, discounts, and highlighted options.
                </p>
              </div>
            </div>

            <div className="sticky top-16 z-20 -mx-4 border-y border-[#ECEEE4]/70 bg-[#FAFAF7]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                  <button
                    type="button"
                    onClick={addPriceOption}
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[#8F9E4F] bg-white px-3 text-sm font-semibold text-[#1F2A1F] transition hover:bg-[#F4F7EA]"
                  >
                    <Icon name="add" size={14} />
                    Price
                  </button>
                  <button
                    type="button"
                    onClick={addTrialOption}
                    className="min-h-10 rounded-lg border border-[#ECEEE4] bg-white px-3 text-sm font-semibold text-[#1F2A1F] transition hover:bg-[#F4F7EA]"
                  >
                    Trial
                  </button>
                  <button
                    type="button"
                    onClick={addMembershipOption}
                    className="min-h-10 rounded-lg border border-[#ECEEE4] bg-white px-3 text-sm font-semibold text-[#1F2A1F] transition hover:bg-[#F4F7EA]"
                  >
                    Membership
                  </button>
                </div>
                {priceOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenOptionId(null)}
                    className="min-h-10 rounded-lg border border-[#ECEEE4] bg-white px-3 text-sm font-semibold text-[#1F2A1F] transition hover:bg-[#F4F7EA]"
                  >
                    Collapse all
                  </button>
                )}
              </div>
            </div>

            {priceOptions.length > 0 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto border-b border-[#ECEEE4] px-4 pb-3 sm:hidden">
                {priceOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setOpenOptionId(option.id)}
                    className={cx(
                      "shrink-0 rounded-full border px-3 py-2 text-xs font-semibold",
                      openOptionId === option.id
                        ? "border-[#8F9E4F] bg-[#8F9E4F]/10 text-[#1F2A1F]"
                        : "border-[#ECEEE4] bg-white text-[#1F2A1F]"
                    )}
                  >
                    {getRailLabel(option, index)}
                  </button>
                ))}
              </div>
            )}

            {priceOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#DADDD0] bg-white p-5 text-sm text-[#6F7A5A]">
                No pricing menu yet.
              </div>
            ) : (
              <div className="space-y-3">
                {priceOptions.map((option, index) => {
                  const validation = getOptionValidation(option);
                  const isOpen = openOptionId === option.id;
                  const title = getOptionTitle(option, index);
                  const subtitle = getOptionSubtitle(option);
                  const optionPriceText = getOptionHeadlinePrice(option);
                  const compareAtText = option.onRequest
                    ? null
                    : formatMoney(option.compareAtAmount, option.currency);

                  return (
                    <article
                      key={option.id}
                      className={cx(
                        "overflow-hidden rounded-lg border bg-white shadow-sm transition",
                        !validation.valid && "border-[#C96A5B]/50",
                        validation.valid && option.isFeatured && "border-[#8F9E4F] shadow-[0_0_0_3px_rgba(143,158,79,0.08)]",
                        validation.valid && !option.isFeatured && "border-[#ECEEE4]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenOptionId(isOpen ? null : option.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-4 text-left transition hover:bg-[#FAFAF7]"
                        aria-expanded={isOpen}
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid h-7 w-5 shrink-0 place-items-center text-[#A8B096]">
                              <Icon name="more-vertical" size={16} />
                            </span>
                            <span className="truncate text-base font-semibold text-[#1F2A1F]">
                              {title}
                            </span>
                          </div>
                          <div className="mt-1 truncate pl-7 text-xs text-[#6F7A5A]">
                            {subtitle}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 pl-7 max-sm:hidden">
                            {option.isFeatured && (
                              <span className="rounded-full bg-[#8F9E4F]/10 px-2 py-1 text-[11px] font-semibold text-[#556036]">
                                Highlighted
                              </span>
                            )}
                            {option.badge.trim() && (
                              <span className="rounded-full bg-[#D6B25E]/25 px-2 py-1 text-[11px] font-semibold text-[#6F5A23]">
                                {option.badge.trim()}
                              </span>
                            )}
                            {!validation.valid && (
                              <span className="rounded-full bg-[#C96A5B]/10 px-2 py-1 text-[11px] font-semibold text-[#C96A5B]">
                                Needs amount
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className={cx(
                              option.onRequest
                                ? "text-sm font-semibold italic text-[#556036]"
                                : "font-fraunces text-xl font-semibold leading-none text-[#1F2A1F]"
                            )}
                          >
                            {optionPriceText ?? "Empty"}
                          </div>
                          {compareAtText && (
                            <div className="mt-1 text-xs text-[#6F7A5A]">
                              old {compareAtText}
                            </div>
                          )}
                        </div>
                        <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FAFAF7] text-[#6F7A5A] sm:flex">
                          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={16} />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-[#ECEEE4] px-4 py-4">
                          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[#1F2A1F]">
                                Price on request
                              </div>
                              <div className="text-xs leading-snug text-[#6F7A5A]">
                                Hide the number for this option — buyers will see custom text or “Contact for price”.
                              </div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={option.onRequest}
                              onClick={() =>
                                updatePriceOption(option.id, { onRequest: !option.onRequest })
                              }
                              className={cx(
                                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition",
                                option.onRequest
                                  ? "border-[#8F9E4F] bg-[#8F9E4F]"
                                  : "border-[#DADDD0] bg-white"
                              )}
                            >
                              <span
                                className={cx(
                                  "inline-block h-5 w-5 rounded-full bg-white shadow transition",
                                  option.onRequest ? "translate-x-6" : "translate-x-1"
                                )}
                              />
                              <span className="sr-only">Toggle price on request</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Group</span>
                              <input
                                value={option.groupLabel}
                                onChange={(e) => updatePriceOption(option.id, { groupLabel: e.target.value })}
                                placeholder="Trial Lesson"
                                className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Label</span>
                              <input
                                value={option.label}
                                onChange={(e) => updatePriceOption(option.id, { label: e.target.value })}
                                placeholder="45 minutes"
                                className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                              />
                            </label>
                            {option.onRequest ? (
                              <label className="block sm:col-span-2">
                                <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">
                                  Display text
                                </span>
                                <input
                                  value={option.requestText}
                                  onChange={(e) => updatePriceOption(option.id, { requestText: e.target.value })}
                                  placeholder={DEFAULT_REQUEST_TEXT}
                                  className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                                />
                                <span className="mt-1 block text-xs text-[#6F7A5A]">
                                  Leave empty to show “{DEFAULT_REQUEST_TEXT}”.
                                </span>
                              </label>
                            ) : (
                              <>
                                <label className="block">
                                  <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Amount</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    value={option.amount}
                                    onChange={(e) => updatePriceOption(option.id, { amount: e.target.value })}
                                    placeholder="300"
                                    className={cx(
                                      "min-h-12 w-full rounded-lg border bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white",
                                      validation.amountValid
                                        ? "border-[#ECEEE4] focus:border-[#8F9E4F]"
                                        : "border-[#C96A5B]/50 focus:border-[#C96A5B]"
                                    )}
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Old price</span>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    value={option.compareAtAmount}
                                    onChange={(e) => updatePriceOption(option.id, { compareAtAmount: e.target.value })}
                                    placeholder="75"
                                    className={cx(
                                      "min-h-12 w-full rounded-lg border bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white",
                                      validation.compareAtAmountValid
                                        ? "border-[#ECEEE4] focus:border-[#8F9E4F]"
                                        : "border-[#C96A5B]/50 focus:border-[#C96A5B]"
                                    )}
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Currency</span>
                                  <select
                                    value={option.currency}
                                    onChange={(e) => updatePriceOption(option.id, { currency: e.target.value as Currency })}
                                    className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                                  >
                                    {CURRENCIES.map((c) => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Charged</span>
                                  <select
                                    value={option.unit}
                                    onChange={(e) => updatePriceOption(option.id, { unit: e.target.value as PriceUnit })}
                                    className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                                  >
                                    {PRICE_UNITS.map((u) => (
                                      <option key={u.value} value={u.value}>{u.label}</option>
                                    ))}
                                  </select>
                                </label>
                              </>
                            )}
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Duration</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max={24 * 60}
                                value={option.durationMinutes}
                                onChange={(e) => updatePriceOption(option.id, { durationMinutes: e.target.value })}
                                placeholder="45"
                                className={cx(
                                  "min-h-12 w-full rounded-lg border bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white",
                                  validation.durationValid
                                    ? "border-[#ECEEE4] focus:border-[#8F9E4F]"
                                    : "border-[#C96A5B]/50 focus:border-[#C96A5B]"
                                )}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Badge</span>
                              <input
                                value={option.badge}
                                onChange={(e) => updatePriceOption(option.id, { badge: e.target.value })}
                                placeholder="Save 20%"
                                className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                              />
                            </label>
                            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm font-medium text-[#1F2A1F] sm:col-span-2">
                              <input
                                type="checkbox"
                                checked={option.isFeatured}
                                onChange={(e) => updatePriceOption(option.id, { isFeatured: e.target.checked })}
                                className="h-4 w-4 accent-[#8F9E4F]"
                              />
                              Highlight this option
                            </label>
                            <label className="block sm:col-span-2">
                              <span className="mb-1 block text-xs font-semibold text-[#1F2A1F]">Note</span>
                              <input
                                value={option.note}
                                onChange={(e) => updatePriceOption(option.id, { note: e.target.value })}
                                placeholder="For monthly members, includes private events"
                                className="min-h-12 w-full rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] px-3 text-sm text-[#1F2A1F] outline-none transition focus:border-[#8F9E4F] focus:bg-white"
                              />
                            </label>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => removePriceOption(option.id)}
                              className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[#C96A5B] transition hover:bg-[#C96A5B]/10"
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenOptionId(null)}
                              className="min-h-11 rounded-lg border border-[#ECEEE4] bg-white px-3 text-sm font-semibold text-[#1F2A1F] transition hover:bg-[#FAFAF7]"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="sticky top-24 hidden space-y-3 lg:block">
          <div className="rounded-lg border border-[#ECEEE4] bg-white p-4 shadow-sm">
            <h2 className="font-fraunces text-2xl font-semibold text-[#1F2A1F]">Buyer preview</h2>
            <div className="mt-3 rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] p-4">
              {previewPriceText ? (
                <div className="font-fraunces text-3xl font-semibold text-[#1F2A1F]">
                  {previewPriceText}
                </div>
              ) : (
                <div className="rounded-lg border border-[#ECEEE4] bg-white px-3 py-2 text-sm font-medium text-[#6F7A5A]">
                  Price on request
                </div>
              )}
              {featuredOption && (
                <div className="mt-2 text-sm font-medium text-[#6F7A5A]">
                  {getOptionTitle(featuredOption, priceOptions.indexOf(featuredOption))}
                </div>
              )}
              {priceOptions.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-[#ECEEE4] pt-3">
                  {priceOptions.slice(0, 4).map((option, index) => (
                    <div key={option.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-[#1F2A1F]">
                        {getOptionTitle(option, index)}
                      </span>
                      <span className="shrink-0 font-semibold text-[#1F2A1F]">
                        {formatPriceWithUnit(option.amount, option.currency, option.unit) ?? "Empty"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-30 border-t border-[#ECEEE4] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-center text-xs text-[#6F7A5A] lg:text-left">
            {priceOptions.length} {priceOptions.length === 1 ? "menu price" : "menu prices"}
            {priceOptions.some((option) => option.isFeatured) ? " · highlighted option" : ""}
            {hasChanges ? " · unsaved changes" : ""}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:min-w-[320px]">
            <button
              onClick={handleCancel}
              className="min-h-12 rounded-lg border border-[#ECEEE4] bg-white px-4 text-sm font-semibold text-[#1F2A1F] transition hover:bg-[#FAFAF7] lg:flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cx(
                "min-h-12 rounded-lg px-4 text-sm font-semibold transition lg:flex-1",
                canSave
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "cursor-not-allowed bg-[#DADDD0] text-[#6F7A5A]"
              )}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
