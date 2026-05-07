"use client";

/**
 * /places/[id]/edit/schedule — расписание + длительность для service / experience.
 *
 * Schedule сохраняется в places.schedule (jsonb) в трёх формах:
 *   { type: "weekly", days: ["mon","tue"], from: "10:00", to: "18:00" }
 *   { type: "dates",  dates: ["2026-06-01","2026-06-08"] }
 *   { type: "on_request" }
 *
 * Длительность — отдельная колонка `duration_minutes` (int).
 *
 * Locations не имеют расписания → редирект в edit-хаб.
 */

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";

type PlaceScheduleRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "created_by" | "kind" | "schedule" | "duration_minutes"
>;

type ScheduleType = "weekly" | "dates" | "on_request";

type ScheduleWeekly = {
  type: "weekly";
  days: string[];
  from?: string;
  to?: string;
};
type ScheduleDates = { type: "dates"; dates: string[] };
type ScheduleOnRequest = { type: "on_request" };
type Schedule = ScheduleWeekly | ScheduleDates | ScheduleOnRequest | null;

const DAYS: { value: string; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function parseSchedule(raw: unknown): Schedule {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.type === "weekly") {
    const days = Array.isArray(s.days) ? (s.days.filter((x) => typeof x === "string") as string[]) : [];
    const from = typeof s.from === "string" ? s.from : undefined;
    const to = typeof s.to === "string" ? s.to : undefined;
    return { type: "weekly", days, from, to };
  }
  if (s.type === "dates") {
    const dates = Array.isArray(s.dates) ? (s.dates.filter((x) => typeof x === "string") as string[]) : [];
    return { type: "dates", dates };
  }
  if (s.type === "on_request") return { type: "on_request" };
  return null;
}

type PageProps = { params: Promise<{ id: string }> };

export default function ScheduleEditorPage(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<ScheduleType>("on_request");
  // Weekly:
  const [days, setDays] = useState<string[]>([]);
  const [fromTime, setFromTime] = useState<string>("");
  const [toTime, setToTime] = useState<string>("");
  // Dates:
  const [dates, setDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState<string>("");
  // Duration
  const [durationHours, setDurationHours] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");

  // Track original to compute hasChanges
  const [originalJson, setOriginalJson] = useState<string>("");
  const [originalDuration, setOriginalDuration] = useState<string>("");

  // Load place
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, kind, schedule, duration_minutes")
        .eq("id", placeId)
        .single();

      const data = rawData as PlaceScheduleRow | null;
      if (placeError || !data) {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const isOwner = data.created_by === user.id;
      if (!isOwner && !isUserAdmin(access)) {
        router.push(`/id/${placeId}`);
        return;
      }

      if (data.kind === "location") {
        router.push(`/places/${placeId}/edit`);
        return;
      }

      const parsed = parseSchedule(data.schedule);
      if (parsed?.type === "weekly") {
        setType("weekly");
        setDays(parsed.days);
        setFromTime(parsed.from || "");
        setToTime(parsed.to || "");
      } else if (parsed?.type === "dates") {
        setType("dates");
        setDates(parsed.dates);
      } else if (parsed?.type === "on_request") {
        setType("on_request");
      } else {
        setType("on_request");
      }

      const dm = data.duration_minutes;
      if (dm && dm > 0) {
        setDurationHours(String(Math.floor(dm / 60)));
        setDurationMinutes(String(dm % 60));
      }

      setOriginalJson(JSON.stringify(parsed));
      setOriginalDuration(dm != null ? String(dm) : "");
      setLoading(false);
    })();
  }, [placeId, user, router, access, accessLoading]);

  // Build schedule payload from local state
  const schedulePayload = useMemo<Schedule>(() => {
    if (type === "on_request") return { type: "on_request" };
    if (type === "weekly") {
      const out: ScheduleWeekly = { type: "weekly", days };
      if (fromTime) out.from = fromTime;
      if (toTime) out.to = toTime;
      return out;
    }
    return { type: "dates", dates };
  }, [type, days, fromTime, toTime, dates]);

  const totalDurationMinutes = useMemo(() => {
    const h = Math.max(0, parseInt(durationHours || "0", 10) || 0);
    const m = Math.max(0, parseInt(durationMinutes || "0", 10) || 0);
    const total = h * 60 + m;
    return total > 0 ? total : null;
  }, [durationHours, durationMinutes]);

  // Validation
  const isWeeklyValid = type !== "weekly" || days.length > 0;
  const isDatesValid = type !== "dates" || dates.length > 0;
  const isFormValid = isWeeklyValid && isDatesValid;

  const hasChanges =
    JSON.stringify(schedulePayload) !== originalJson ||
    String(totalDurationMinutes ?? "") !== originalDuration;

  const canSave = hasChanges && isFormValid && !saving;

  function toggleDay(d: string) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function addDate() {
    if (!isValidDate(newDate)) {
      setError("Invalid date format");
      return;
    }
    if (dates.includes(newDate)) {
      setError("Date already added");
      return;
    }
    setDates((prev) => [...prev, newDate].sort());
    setNewDate("");
    setError(null);
  }

  function removeDate(d: string) {
    setDates((prev) => prev.filter((x) => x !== d));
  }

  async function handleSave() {
    if (!canSave || !user || !placeId) return;
    setSaving(true);
    setError(null);

    const payload = {
      schedule: schedulePayload,
      duration_minutes: totalDurationMinutes,
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
      console.error("Update schedule error:", updateError);
      setError(updateError.message || "Failed to save schedule");
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
              Schedule
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
          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Availability
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { v: "weekly",     label: "Recurring", hint: "Same hours every week" },
                  { v: "dates",      label: "Dates",     hint: "Specific dates only" },
                  { v: "on_request", label: "By request", hint: "Buyer asks for a time" },
                ] as const
              ).map((opt) => {
                const active = type === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setType(opt.v)}
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
          </div>

          {/* Weekly editor */}
          {type === "weekly" && (
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 space-y-4">
              <div>
                <div className="text-sm font-medium text-[#1F2A1F] mb-2">Days</div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const active = days.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={cx(
                          "rounded-full border px-4 py-2 text-sm font-medium transition",
                          active
                            ? "border-[#8F9E4F] bg-[#8F9E4F] text-white"
                            : "border-[#ECEEE4] bg-white text-[#1F2A1F] hover:bg-[#FAFAF7]"
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                {!isWeeklyValid && (
                  <div className="mt-2 text-xs text-[#C96A5B]">Pick at least one day</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6F7A5A] mb-1">From</label>
                  <input
                    type="time"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] outline-none focus:bg-white focus:border-[#8F9E4F]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6F7A5A] mb-1">To</label>
                  <input
                    type="time"
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                    className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] outline-none focus:bg-white focus:border-[#8F9E4F]"
                  />
                </div>
              </div>
              <p className="text-xs text-[#6F7A5A]">
                Times are optional — leave empty if you operate flexibly within those days.
              </p>
            </div>
          )}

          {/* Dates editor */}
          {type === "dates" && (
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 space-y-4">
              <div>
                <div className="text-sm font-medium text-[#1F2A1F] mb-2">Available dates</div>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="flex-1 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] outline-none focus:bg-white focus:border-[#8F9E4F]"
                  />
                  <button
                    type="button"
                    onClick={addDate}
                    disabled={!newDate}
                    className={cx(
                      "rounded-xl px-4 py-3 text-sm font-medium transition",
                      newDate
                        ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                        : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                    )}
                  >
                    Add
                  </button>
                </div>
                {dates.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dates.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-2 rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-3 py-1.5 text-sm text-[#1F2A1F]"
                      >
                        {d}
                        <button
                          type="button"
                          onClick={() => removeDate(d)}
                          className="text-[#6F7A5A] hover:text-[#C96A5B]"
                          aria-label={`Remove ${d}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#6F7A5A]">Add at least one date</p>
                )}
              </div>
            </div>
          )}

          {/* On request — explanation only */}
          {type === "on_request" && (
            <div className="rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-5">
              <p className="text-sm text-[#3F4A35]">
                Buyers will see «By request» on your card. They&apos;ll reach out via your contact
                button to agree on a time.
              </p>
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-[#1F2A1F] mb-2">
              Duration <span className="text-[#A8B096] font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Hours</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="1"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] outline-none focus:bg-white focus:border-[#8F9E4F]"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="5"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] px-4 py-3 text-[#1F2A1F] outline-none focus:bg-white focus:border-[#8F9E4F]"
                  placeholder="0"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-[#6F7A5A]">
              Especially important for experiences (tours, classes). Leave empty if not applicable.
            </p>
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
