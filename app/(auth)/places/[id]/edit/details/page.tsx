"use client";

/**
 * /places/[id]/edit/details — experience-specific детали:
 *  - min/max guests
 *  - meeting point (text)
 *  - cancellation policy (radio)
 *  - included_items[] / bring_items[] (chip-input)
 *
 * Для location/service редактор недоступен (редирект). Эти поля имеют смысл
 * только для experience: туры, мастер-классы, гастро-прогулки и т.п.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";

type PlaceDetailsRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  | "created_by"
  | "kind"
  | "max_guests"
  | "min_guests"
  | "meeting_point"
  | "cancellation_policy"
  | "included_items"
  | "bring_items"
>;

type Cancellation = "flexible" | "moderate" | "strict" | "non_refundable" | "custom";

const CANCELLATION_OPTIONS: { value: Cancellation; label: string; hint: string }[] = [
  { value: "flexible",       label: "Flexible",       hint: "Free cancellation up to 24h before." },
  { value: "moderate",       label: "Moderate",       hint: "Free up to 5 days; 50% refund within 5 days." },
  { value: "strict",         label: "Strict",         hint: "50% refund up to 7 days; nothing after." },
  { value: "non_refundable", label: "Non-refundable", hint: "No refunds after booking." },
  { value: "custom",         label: "Custom",         hint: "Describe your terms in the listing description." },
];

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

type PageProps = { params: Promise<{ id: string }> };

export default function DetailsEditorPage(props: PageProps) {
  return (
    <ErrorBoundary>
      <DetailsEditorPageContent {...props} />
    </ErrorBoundary>
  );
}

function DetailsEditorPageContent(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxGuests, setMaxGuests] = useState<string>("");
  const [minGuests, setMinGuests] = useState<string>("");
  const [meetingPoint, setMeetingPoint] = useState<string>("");
  const [cancellation, setCancellation] = useState<Cancellation | "">("");
  const [included, setIncluded] = useState<string[]>([]);
  const [bring, setBring] = useState<string[]>([]);

  const [includedDraft, setIncludedDraft] = useState("");
  const [bringDraft, setBringDraft] = useState("");

  const [original, setOriginal] = useState<string>("");

  useEffect(() => {
    if (!placeId || !user || accessLoading) return;
    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, kind, max_guests, min_guests, meeting_point, cancellation_policy, included_items, bring_items")
        .eq("id", placeId)
        .single();
      const data = rawData as PlaceDetailsRow | null;

      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const isOwner = data.created_by === user.id;
      if (!isOwner && !isUserAdmin(access)) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Эта страница имеет смысл только для experience.
      if (data.kind !== "experience") {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const inc = Array.isArray(data.included_items) ? data.included_items : [];
      const br = Array.isArray(data.bring_items) ? data.bring_items : [];
      setMaxGuests(data.max_guests != null ? String(data.max_guests) : "");
      setMinGuests(data.min_guests != null ? String(data.min_guests) : "");
      setMeetingPoint(data.meeting_point || "");
      setCancellation((data.cancellation_policy as Cancellation | null) || "");
      setIncluded(inc);
      setBring(br);

      setOriginal(
        JSON.stringify({
          max: data.max_guests ?? null,
          min: data.min_guests ?? null,
          mp: data.meeting_point ?? "",
          cp: data.cancellation_policy ?? "",
          inc,
          br,
        })
      );
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const parsedMax = maxGuests.trim() === "" ? null : parseInt(maxGuests, 10);
  const parsedMin = minGuests.trim() === "" ? null : parseInt(minGuests, 10);

  const isMaxValid = parsedMax === null || (Number.isFinite(parsedMax) && parsedMax > 0 && parsedMax < 1000);
  const isMinValid = parsedMin === null || (Number.isFinite(parsedMin) && parsedMin >= 0 && parsedMin < 1000);
  const isRangeValid = parsedMax === null || parsedMin === null || parsedMin <= parsedMax;
  const isFormValid = isMaxValid && isMinValid && isRangeValid;

  const currentSnapshot = JSON.stringify({
    max: parsedMax,
    min: parsedMin,
    mp: meetingPoint.trim(),
    cp: cancellation || "",
    inc: included,
    br: bring,
  });
  const hasChanges = currentSnapshot !== original;
  const canSave = hasChanges && isFormValid && !saving;

  function addChip(target: "inc" | "br") {
    const draft = target === "inc" ? includedDraft : bringDraft;
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (target === "inc") {
      if (!included.includes(trimmed)) setIncluded((p) => [...p, trimmed]);
      setIncludedDraft("");
    } else {
      if (!bring.includes(trimmed)) setBring((p) => [...p, trimmed]);
      setBringDraft("");
    }
  }
  function removeChip(target: "inc" | "br", value: string) {
    if (target === "inc") setIncluded((p) => p.filter((x) => x !== value));
    else setBring((p) => p.filter((x) => x !== value));
  }

  async function handleSave() {
    if (!canSave || !user || !placeId) return;
    setSaving(true);
    setError(null);

    const payload = {
      max_guests: parsedMax,
      min_guests: parsedMin,
      meeting_point: meetingPoint.trim() || null,
      cancellation_policy: cancellation || null,
      included_items: included,
      bring_items: bring,
    };

    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update(payload)
      .eq("id", placeId);
    if (!isUserAdmin(access)) updateQuery.eq("created_by", user.id);

    const { error: updateError } = await updateQuery.select();
    setSaving(false);

    if (updateError) {
      console.error("Update details error:", updateError);
      setError(updateError.message || "Failed to save details");
      return;
    }
    if (navigator.vibrate) navigator.vibrate(10);
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
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.push(`/places/${placeId}/edit`)}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1 className="font-semibold font-fraunces text-[#1F2A1F]" style={{ fontSize: "24px" }}>
              Details
            </h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Group size */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Group size <span className="text-[#A8B096] font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Min guests</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={minGuests}
                  onChange={(e) => setMinGuests(e.target.value)}
                  placeholder="1"
                  className={cx(
                    "w-full rounded-xl border px-4 py-3 text-[#1F2A1F] outline-none transition",
                    isMinValid
                      ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                      : "border-[#C96A5B]/50 bg-[#C96A5B]/10"
                  )}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Max guests</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={maxGuests}
                  onChange={(e) => setMaxGuests(e.target.value)}
                  placeholder="8"
                  className={cx(
                    "w-full rounded-xl border px-4 py-3 text-[#1F2A1F] outline-none transition",
                    isMaxValid && isRangeValid
                      ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                      : "border-[#C96A5B]/50 bg-[#C96A5B]/10"
                  )}
                />
              </div>
            </div>
            {!isRangeValid && (
              <div className="mt-1 text-xs text-[#C96A5B]">Min must be ≤ Max</div>
            )}
            <p className="mt-2 text-xs text-[#6F7A5A]">Helps buyers find experiences for the right party size.</p>
          </div>

          {/* Meeting point */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Meeting point <span className="text-[#A8B096] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              maxLength={200}
              placeholder="e.g. Marina entrance, near the blue boat rental kiosk"
              className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:bg-white focus:border-[#8F9E4F]"
            />
            <p className="mt-2 text-xs text-[#6F7A5A]">Where guests should arrive. Free text — be specific.</p>
          </div>

          {/* Cancellation policy */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Cancellation policy <span className="text-[#A8B096] font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CANCELLATION_OPTIONS.map((opt) => {
                const active = cancellation === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCancellation(active ? "" : opt.value)}
                    className={cx(
                      "text-left rounded-xl border px-4 py-3 transition",
                      active
                        ? "border-[#8F9E4F] bg-[#8F9E4F]/10"
                        : "border-[#ECEEE4] bg-white hover:bg-[#FAFAF7]"
                    )}
                  >
                    <div className="text-sm font-medium text-[#1F2A1F]">{opt.label}</div>
                    <div className="text-xs text-[#6F7A5A] mt-0.5">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[#A8B096]">
              Maporia is a directory — we don&apos;t enforce refunds. This is your stated policy for buyers.
            </p>
          </div>

          {/* Included */}
          <ChipGroup
            label="What's included"
            hint="Gear, food, drinks, transport — anything the guest gets."
            items={included}
            draft={includedDraft}
            onDraft={setIncludedDraft}
            onAdd={() => addChip("inc")}
            onRemove={(v) => removeChip("inc", v)}
            placeholder="Snorkel gear"
          />

          {/* Bring */}
          <ChipGroup
            label="What to bring"
            hint="What guests should bring with them."
            items={bring}
            draft={bringDraft}
            onDraft={setBringDraft}
            onAdd={() => addChip("br")}
            onRemove={(v) => removeChip("br", v)}
            placeholder="Swimsuit, sunscreen"
          />
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/places/${placeId}/edit`)}
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

// ─────────────────────────────────────────────────────────────────────────────

function ChipGroup({
  label,
  hint,
  items,
  draft,
  onDraft,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  hint: string;
  items: string[];
  draft: string;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1F2A1F] mb-2">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          maxLength={60}
          className="flex-1 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] outline-none focus:bg-white focus:border-[#8F9E4F]"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim()}
          className={
            "rounded-xl px-4 py-3 text-sm font-medium transition " +
            (draft.trim()
              ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
              : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed")
          }
        >
          Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((it) => (
            <span
              key={it}
              className="inline-flex items-center gap-2 rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-1.5 text-sm text-[#1F2A1F]"
            >
              {it}
              <button
                type="button"
                onClick={() => onRemove(it)}
                className="text-[#6F7A5A] hover:text-[#C96A5B]"
                aria-label={`Remove ${it}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-[#6F7A5A]">{hint}</p>
    </div>
  );
}
