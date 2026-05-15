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

import { use, useEffect, useState } from "react";
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
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
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
      };
    })
    .filter((item): item is PriceOptionDraft => Boolean(item));
}

function normalizePriceOptions(options: PriceOptionDraft[]): PriceOptionRow[] {
  return options.flatMap((option, index): PriceOptionRow[] => {
    const parsed = Number(option.amount);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1_000_000) return [];
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
      amount: parsed,
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

  const [originalAmount, setOriginalAmount] = useState<string>("");
  const [originalCurrency, setOriginalCurrency] = useState<Currency>("USD");
  const [originalUnit, setOriginalUnit] = useState<PriceUnit>("fixed");
  const [originalOptionsJson, setOriginalOptionsJson] = useState<string>("[]");

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, kind, price_amount, price_currency, price_unit, price_options")
        .eq("id", placeId)
        .single();

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
  const areOptionsValid = priceOptions.every((option) => {
    if (option.amount.trim() === "") return false;
    const parsed = Number(option.amount);
    const compareAtAmount =
      option.compareAtAmount.trim() === "" ? null : Number(option.compareAtAmount);
    const durationMinutes =
      option.durationMinutes.trim() === "" ? null : Number(option.durationMinutes);
    return (
      Number.isFinite(parsed) &&
      parsed >= 0 &&
      parsed < 1_000_000 &&
      (compareAtAmount === null ||
        (Number.isFinite(compareAtAmount) && compareAtAmount >= 0 && compareAtAmount < 1_000_000)) &&
      (durationMinutes === null ||
        (Number.isFinite(durationMinutes) && durationMinutes > 0 && durationMinutes <= 24 * 60))
    );
  });

  const hasChanges =
    amount.trim() !== originalAmount.trim() ||
    currency !== originalCurrency ||
    unit !== originalUnit ||
    optionsJson !== originalOptionsJson;
  const canSave = hasChanges && isAmountValid && areOptionsValid && !saving;

  function updatePriceOption(id: string, patch: Partial<PriceOptionDraft>) {
    setPriceOptions((prev) => prev.map((option) => option.id === id ? { ...option, ...patch } : option));
    setError(null);
  }

  function addPriceOption() {
    setPriceOptions((prev) => [...prev, newPriceOptionDraft()]);
    setError(null);
  }

  function addTrialOption() {
    setPriceOptions((prev) => [
      ...prev,
      newPriceOptionDraft({
        groupLabel: "Trial Lesson",
        label: "45 minutes",
        durationMinutes: "45",
        badge: "New student promo",
        unit: "fixed",
      }),
    ]);
    setError(null);
  }

  function addMembershipOption() {
    setPriceOptions((prev) => [
      ...prev,
      newPriceOptionDraft({
        groupLabel: "Monthly Membership",
        label: "45 min / week",
        badge: "Most popular",
        unit: "per_month",
        isFeatured: true,
      }),
    ]);
    setError(null);
  }

  function removePriceOption(id: string) {
    setPriceOptions((prev) => prev.filter((option) => option.id !== id));
    setError(null);
  }

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const payload: {
      price_amount: number | null;
      price_currency: string | null;
      price_unit: string | null;
      price_options: PriceOptionRow[] | null;
    } = {
      price_amount: parsedAmount,
      price_currency: parsedAmount === null ? null : currency,
      price_unit: parsedAmount === null ? null : unit,
      price_options: normalizedOptions.length > 0 ? normalizedOptions : null,
    };

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
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: "24px" }}>
              Price
            </h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Amount + currency */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Amount
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
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
                    "w-full rounded-xl border px-4 py-4 text-lg font-medium text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition",
                    isAmountValid
                      ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                      : "border-[#C96A5B]/50 bg-[#C96A5B]/10 focus:bg-white focus:border-[#C96A5B]"
                  )}
                  autoFocus
                />
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                disabled={parsedAmount === null}
                className={cx(
                  "rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-4 text-lg font-medium text-[#1F2A1F] outline-none transition",
                  "focus:bg-white focus:border-[#8F9E4F]",
                  parsedAmount === null && "opacity-50 cursor-not-allowed"
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
                  ? "Leave empty for «By request». Enter an amount to choose currency and how it is charged."
                  : "Buyers see this in the offer card and on the listing"}
            </p>
          </div>

          {/* Unit */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              How is this charged?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRICE_UNITS.map((u) => {
                const active = unit === u.value;
                return (
                  <button
                    key={u.value}
                    type="button"
                    onClick={() => setUnit(u.value)}
                    disabled={parsedAmount === null}
                    className={cx(
                      "text-left rounded-xl border px-4 py-3 transition",
                      parsedAmount === null && "opacity-50 cursor-not-allowed",
                      active
                        ? "border-[#8F9E4F] bg-[#8F9E4F]/10"
                        : "border-[#ECEEE4] bg-white hover:bg-[#FAFAF7]"
                    )}
                  >
                    <div className="text-sm font-medium text-[#1F2A1F]">{u.label}</div>
                    <div className="text-xs text-[#6F7A5A] mt-0.5">{u.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Additional options */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#1F2A1F]">Pricing menu</h2>
                <p className="mt-1 text-xs text-[#6F7A5A]">
                  Add packages, trial lessons, memberships, discounts, and highlighted options.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addPriceOption}
                  className="shrink-0 rounded-xl border border-[#8F9E4F] bg-white px-3 py-2 text-xs font-medium text-[#1F2A1F] hover:bg-[#F4F7EA] transition"
                >
                  Add price
                </button>
                <button
                  type="button"
                  onClick={addTrialOption}
                  className="shrink-0 rounded-xl border border-[#ECEEE4] bg-white px-3 py-2 text-xs font-medium text-[#1F2A1F] hover:bg-[#F4F7EA] transition"
                >
                  Trial
                </button>
                <button
                  type="button"
                  onClick={addMembershipOption}
                  className="shrink-0 rounded-xl border border-[#ECEEE4] bg-white px-3 py-2 text-xs font-medium text-[#1F2A1F] hover:bg-[#F4F7EA] transition"
                >
                  Membership
                </button>
              </div>
            </div>

            {priceOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DADDD0] bg-white p-4 text-sm text-[#6F7A5A]">
                No pricing menu yet.
              </div>
            ) : (
              <div className="space-y-3">
                {priceOptions.map((option, index) => {
                  const parsedOptionAmount = option.amount.trim() === "" ? null : Number(option.amount);
                  const optionAmountValid =
                    parsedOptionAmount !== null &&
                    Number.isFinite(parsedOptionAmount) &&
                    parsedOptionAmount >= 0 &&
                    parsedOptionAmount < 1_000_000;
                  const parsedCompareAtAmount =
                    option.compareAtAmount.trim() === "" ? null : Number(option.compareAtAmount);
                  const compareAtAmountValid =
                    parsedCompareAtAmount === null ||
                    (Number.isFinite(parsedCompareAtAmount) &&
                      parsedCompareAtAmount >= 0 &&
                      parsedCompareAtAmount < 1_000_000);
                  const parsedDuration =
                    option.durationMinutes.trim() === "" ? null : Number(option.durationMinutes);
                  const durationValid =
                    parsedDuration === null ||
                    (Number.isFinite(parsedDuration) && parsedDuration > 0 && parsedDuration <= 24 * 60);
                  return (
                    <div
                      key={option.id}
                      className={cx(
                        "rounded-xl border bg-white p-3",
                        option.isFeatured ? "border-[#8F9E4F]" : "border-[#ECEEE4]",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                          Option {index + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePriceOption(option.id)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-[#C96A5B] hover:bg-[#C96A5B]/10 transition"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Group</span>
                          <input
                            value={option.groupLabel}
                            onChange={(e) => updatePriceOption(option.id, { groupLabel: e.target.value })}
                            placeholder="Trial Lesson"
                            className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Label</span>
                          <input
                            value={option.label}
                            onChange={(e) => updatePriceOption(option.id, { label: e.target.value })}
                            placeholder="45 minutes"
                            className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Amount</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={option.amount}
                            onChange={(e) => updatePriceOption(option.id, { amount: e.target.value })}
                            placeholder="300"
                            className={cx(
                              "w-full rounded-xl border bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white",
                              optionAmountValid
                                ? "border-[#ECEEE4] focus:border-[#8F9E4F]"
                                : "border-[#C96A5B]/50 focus:border-[#C96A5B]"
                            )}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Old price</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={option.compareAtAmount}
                            onChange={(e) => updatePriceOption(option.id, { compareAtAmount: e.target.value })}
                            placeholder="75"
                            className={cx(
                              "w-full rounded-xl border bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white",
                              compareAtAmountValid
                                ? "border-[#ECEEE4] focus:border-[#8F9E4F]"
                                : "border-[#C96A5B]/50 focus:border-[#C96A5B]"
                            )}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Currency</span>
                          <select
                            value={option.currency}
                            onChange={(e) => updatePriceOption(option.id, { currency: e.target.value as Currency })}
                            className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
                          >
                            {CURRENCIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Duration</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max={24 * 60}
                            value={option.durationMinutes}
                            onChange={(e) => updatePriceOption(option.id, { durationMinutes: e.target.value })}
                            placeholder="45"
                            className={cx(
                              "w-full rounded-xl border bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white",
                              durationValid
                                ? "border-[#ECEEE4] focus:border-[#8F9E4F]"
                                : "border-[#C96A5B]/50 focus:border-[#C96A5B]"
                            )}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Charged</span>
                          <select
                            value={option.unit}
                            onChange={(e) => updatePriceOption(option.id, { unit: e.target.value as PriceUnit })}
                            className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
                          >
                            {PRICE_UNITS.map((u) => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Badge</span>
                          <input
                            value={option.badge}
                            onChange={(e) => updatePriceOption(option.id, { badge: e.target.value })}
                            placeholder="Save 20%"
                            className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
                          />
                        </label>
                      </div>
                      <label className="mt-3 flex items-center gap-2 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F]">
                        <input
                          type="checkbox"
                          checked={option.isFeatured}
                          onChange={(e) => updatePriceOption(option.id, { isFeatured: e.target.checked })}
                          className="h-4 w-4 accent-[#8F9E4F]"
                        />
                        Highlight this option
                      </label>
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-medium text-[#1F2A1F]">Note</span>
                        <input
                          value={option.note}
                          onChange={(e) => updatePriceOption(option.id, { note: e.target.value })}
                          placeholder="For monthly members, includes private events"
                          className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-3 text-sm text-[#1F2A1F] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cx(
                "flex-1 rounded-xl px-4 py-3 text-sm font-medium transition",
                canSave
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
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
