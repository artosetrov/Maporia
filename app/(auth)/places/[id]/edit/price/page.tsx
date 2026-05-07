"use client";

/**
 * /places/[id]/edit/price — редактор цены для service / experience.
 *
 * Поля: price_amount (numeric), price_currency (USD/EUR/RUB/GBP),
 * price_unit (fixed/from/per_hour/per_person/per_day/per_session).
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

type PlacePriceRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "created_by" | "kind" | "price_amount" | "price_currency" | "price_unit"
>;

const CURRENCIES = ["USD", "EUR", "RUB", "GBP"] as const;
type Currency = (typeof CURRENCIES)[number];

const PRICE_UNITS = [
  { value: "fixed",       label: "Fixed price",  hint: "Just one number, no suffix" },
  { value: "from",        label: "Starts from",  hint: "Indicates a minimum / from-price" },
  { value: "per_hour",    label: "Per hour",     hint: "Charged hourly (massage, lessons)" },
  { value: "per_person",  label: "Per person",   hint: "Per attendee (group tours)" },
  { value: "per_day",     label: "Per day",      hint: "Daily rate (rentals, retreats)" },
  { value: "per_session", label: "Per session",  hint: "Per visit / session" },
] as const;
type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

type PageProps = { params: Promise<{ id: string }> };

export default function PriceEditorPage(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [unit, setUnit] = useState<PriceUnit>("fixed");

  const [originalAmount, setOriginalAmount] = useState<string>("");
  const [originalCurrency, setOriginalCurrency] = useState<Currency>("USD");
  const [originalUnit, setOriginalUnit] = useState<PriceUnit>("fixed");

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, kind, price_amount, price_currency, price_unit")
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

      setAmount(initAmount);
      setCurrency(initCurrency);
      setUnit(initUnit);

      setOriginalAmount(initAmount);
      setOriginalCurrency(initCurrency);
      setOriginalUnit(initUnit);

      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const parsedAmount = amount.trim() === "" ? null : Number(amount);
  const isAmountValid =
    amount.trim() === "" ||
    (parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount >= 0 && parsedAmount < 1_000_000);

  const hasChanges =
    amount.trim() !== originalAmount.trim() ||
    currency !== originalCurrency ||
    unit !== originalUnit;
  const canSave = hasChanges && isAmountValid && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const payload: {
      price_amount: number | null;
      price_currency: string | null;
      price_unit: string | null;
    } = {
      price_amount: parsedAmount,
      price_currency: parsedAmount === null ? null : currency,
      price_unit: parsedAmount === null ? null : unit,
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
    window.location.href = `/places/${placeId}/edit`;
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
                  ? "Leave empty for «By request» — Maporia will hide the price"
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
