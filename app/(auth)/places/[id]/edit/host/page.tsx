"use client";

/**
 * /places/[id]/edit/host — host info для service / experience.
 *
 * Поля:
 *  - host_qualification (text, ≤80 chars) — короткая самопрезентация типа
 *    «PADI Instructor», «Certified Massage Therapist».
 *  - service_mode (radio из 4) — где оказывается услуга:
 *    at_provider / at_client / online / flexible.
 *
 * Для location редактор недоступен (редирект). У location нет «host'а»
 * как такового — там автор просто составил карточку места на карте.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";

type PlaceHostRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "created_by" | "kind" | "host_qualification" | "service_mode"
>;

type ServiceMode = "at_provider" | "at_client" | "online" | "flexible";

const SERVICE_MODE_OPTIONS: { value: ServiceMode; label: string; hint: string }[] = [
  { value: "at_provider", label: "At my place",   hint: "Customers come to your studio / location." },
  { value: "at_client",   label: "At their place", hint: "You travel to the customer." },
  { value: "online",      label: "Online",         hint: "Conducted remotely (video / chat)." },
  { value: "flexible",    label: "Flexible",       hint: "Both options possible — agree per booking." },
];

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

type PageProps = { params: Promise<{ id: string }> };

export default function HostEditorPage(props: PageProps) {
  return (
    <ErrorBoundary>
      <HostEditorPageContent {...props} />
    </ErrorBoundary>
  );
}

function HostEditorPageContent(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qualification, setQualification] = useState<string>("");
  const [mode, setMode] = useState<ServiceMode | "">("");

  const [originalQualification, setOriginalQualification] = useState<string>("");
  const [originalMode, setOriginalMode] = useState<ServiceMode | "">("");

  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, kind, host_qualification, service_mode")
        .eq("id", placeId)
        .single();

      const data = rawData as PlaceHostRow | null;
      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const isOwner = data.created_by === user.id;
      if (!isOwner && !isUserAdmin(access)) {
        router.push(`/id/${placeId}`);
        return;
      }

      // Locations — нет host info
      if (data.kind === "location") {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const q = data.host_qualification || "";
      const m: ServiceMode | "" = (data.service_mode as ServiceMode | null) || "";
      setQualification(q);
      setMode(m);
      setOriginalQualification(q);
      setOriginalMode(m);
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  const trimmed = qualification.trim();
  const isQualValid = trimmed.length === 0 || trimmed.length <= 80;
  const hasChanges = trimmed !== originalQualification.trim() || mode !== originalMode;
  const canSave = hasChanges && isQualValid && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const payload: {
      host_qualification: string | null;
      service_mode: ServiceMode | null;
    } = {
      host_qualification: trimmed.length > 0 ? trimmed : null,
      service_mode: mode === "" ? null : mode,
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
      console.error("Update host error:", updateError);
      setError(updateError.message || "Failed to save host info");
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
              Host info
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
          {/* Qualification */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Your qualification <span className="text-[#A8B096] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={qualification}
              onChange={(e) => {
                setQualification(e.target.value);
                setError(null);
              }}
              placeholder="PADI Instructor · Certified Massage Therapist · 10+ years chef"
              maxLength={100}
              className={cx(
                "w-full rounded-xl border px-4 py-4 text-base text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition",
                isQualValid
                  ? "border-[#ECEEE4] bg-[#FAFAF7] focus:bg-white focus:border-[#8F9E4F]"
                  : "border-[#C96A5B]/50 bg-[#C96A5B]/10 focus:bg-white focus:border-[#C96A5B]"
              )}
            />
            <div className="mt-2 flex items-center justify-between">
              <p className={cx("text-xs", isQualValid ? "text-[#6F7A5A]" : "text-[#C96A5B]")}>
                {isQualValid
                  ? "One-line bio shown under your name. Trust signal for buyers."
                  : "Keep it under 80 characters"}
              </p>
              <span className="text-xs text-[#6F7A5A]">{trimmed.length}/80</span>
            </div>
          </div>

          {/* Service mode */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Where do you provide it?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SERVICE_MODE_OPTIONS.map((opt) => {
                const active = mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(active ? "" : opt.value)}
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
              Click again to deselect — the chip won&apos;t appear on your listing.
            </p>
          </div>
        </div>
      </div>

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
