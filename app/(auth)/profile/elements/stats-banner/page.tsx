"use client";

/**
 * /profile/elements/stats-banner — админский редактор баннера статистики
 * на главной. Параллелит структуру `/profile/elements/tags` (header + back +
 * проверка isAdmin → редирект на /profile).
 *
 * Сохраняет конфиг в app_settings(id='stats_banner') через
 * /api/admin/stats-banner-settings (service role).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import { useUserAccessContext } from "../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../lib/access";
import Icon from "../../../../components/Icon";
import {
  DEFAULT_STATS_BANNER_SETTINGS,
  type StatsBannerSettings,
  type StatsMetricKey,
} from "../../../../hooks/useStatsBannerSettings";

const METRIC_KEYS: StatsMetricKey[] = ["users", "locations", "services", "experiences"];

const METRIC_META: Record<StatsMetricKey, { emoji: string; title: string; sourceHint: string }> = {
  users: {
    emoji: "👥",
    title: "Users",
    sourceHint: "Auto: count(*) of profiles",
  },
  locations: {
    emoji: "📍",
    title: "Locations",
    sourceHint: "Auto: places where kind = 'location'",
  },
  services: {
    emoji: "🛠",
    title: "Services",
    sourceHint: "Auto: places where kind = 'service'",
  },
  experiences: {
    emoji: "✨",
    title: "Experiences",
    sourceHint: "Auto: places where kind = 'experience'",
  },
};

export default function StatsBannerSettingsPage() {
  const router = useRouter();
  const { loading: accessLoading, access } = useUserAccessContext();
  const isAdmin = isUserAdmin(access);

  const [settings, setSettings] = useState<StatsBannerSettings>(DEFAULT_STATS_BANNER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Локальные поля для manual ввода (строкой), чтобы пользователь мог
  // временно очистить input без лишних reset до 0.
  const [manualDrafts, setManualDrafts] = useState<Record<StatsMetricKey, string>>({
    users: "",
    locations: "",
    services: "",
    experiences: "",
  });

  // Загрузка настроек
  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin) {
      router.replace("/profile");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/admin/stats-banner-settings", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load settings");
        }
        const data = (await res.json()) as { settings?: StatsBannerSettings };
        if (cancelled) return;
        const s = data.settings ?? DEFAULT_STATS_BANNER_SETTINGS;
        setSettings(s);
        setManualDrafts({
          users: s.metrics.users.manual?.toString() ?? "",
          locations: s.metrics.locations.manual?.toString() ?? "",
          services: s.metrics.services.manual?.toString() ?? "",
          experiences: s.metrics.experiences.manual?.toString() ?? "",
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load settings";
        console.error("[StatsBannerSettings] load error:", err);
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessLoading, isAdmin, router]);

  const dirtyHash = useMemo(() => JSON.stringify(settings), [settings]);

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSavedAt(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        return;
      }
      // Перед сохранением — синхронизируем manual-черновики в settings.
      const synced: StatsBannerSettings = {
        enabled: settings.enabled,
        metrics: {
          users: { ...settings.metrics.users, manual: parseManual(manualDrafts.users, settings.metrics.users.manual) },
          locations: { ...settings.metrics.locations, manual: parseManual(manualDrafts.locations, settings.metrics.locations.manual) },
          services: { ...settings.metrics.services, manual: parseManual(manualDrafts.services, settings.metrics.services.manual) },
          experiences: { ...settings.metrics.experiences, manual: parseManual(manualDrafts.experiences, settings.metrics.experiences.manual) },
        },
      };
      setSettings(synced);
      const res = await fetch("/api/admin/stats-banner-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ settings: synced }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const out = (await res.json()) as { settings?: StatsBannerSettings };
      if (out.settings) {
        setSettings(out.settings);
        setManualDrafts({
          users: out.settings.metrics.users.manual?.toString() ?? "",
          locations: out.settings.metrics.locations.manual?.toString() ?? "",
          services: out.settings.metrics.services.manual?.toString() ?? "",
          experiences: out.settings.metrics.experiences.manual?.toString() ?? "",
        });
      }
      setSavedAt(Date.now());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      console.error("[StatsBannerSettings] save error:", err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  function parseManual(draft: string, fallback: number | null): number | null {
    const trimmed = draft.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.floor(n));
  }

  function setMetricEnabled(key: StatsMetricKey, enabled: boolean) {
    setSettings((s) => ({
      ...s,
      metrics: { ...s.metrics, [key]: { ...s.metrics[key], enabled } },
    }));
  }

  function setMetricMode(key: StatsMetricKey, mode: "auto" | "manual") {
    setSettings((s) => ({
      ...s,
      metrics: {
        ...s.metrics,
        [key]: {
          ...s.metrics[key],
          // Manual: если черновика нет — стартуем с 0; админ дальше отредактирует.
          manual: mode === "auto" ? null : (parseManual(manualDrafts[key], 0) ?? 0),
        },
      },
    }));
    if (mode === "manual" && manualDrafts[key].trim() === "") {
      setManualDrafts((d) => ({ ...d, [key]: "0" }));
    }
  }

  function setMetricLabel(key: StatsMetricKey, label: string) {
    setSettings((s) => ({
      ...s,
      metrics: { ...s.metrics, [key]: { ...s.metrics[key], label } },
    }));
  }

  // ───────────────────────── render ─────────────────────────

  if (accessLoading || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24 flex flex-col">
      {/* Desktop Header */}
      <div className="hidden lg:block sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/profile?section=elements"
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition flex items-center justify-center"
              aria-label="Back to Elements"
            >
              <Icon name="back" size={20} />
            </Link>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Stats Banner</h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-[#ECEEE4]">
        <div className="px-4 pt-safe-top pt-4 pb-4 flex items-center justify-between h-[64px]">
          <Link
            href="/profile?section=elements"
            className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Back to Elements"
          >
            <Icon name="back" size={20} className="text-[#1F2A1F]" />
          </Link>
          <h1 className="font-semibold text-[#1F2A1F] leading-none" style={{ fontSize: "20px" }}>
            Stats Banner
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 pt-[80px] lg:pt-6">
        <p className="text-sm text-[#6F7A5A] mb-6">
          Live counters shown on the homepage. Each metric can run on Auto (live count from DB) or Manual (a fixed number you set).
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[#6F7A5A]">Loading…</div>
        ) : (
          <div className="space-y-6">
            {/* Master toggle */}
            <section className="rounded-2xl border border-[#ECEEE4] bg-white p-5">
              <label className="flex items-start gap-4 cursor-pointer select-none">
                <Toggle
                  checked={settings.enabled}
                  onChange={(checked) => setSettings((s) => ({ ...s, enabled: checked }))}
                />
                <div className="flex-1">
                  <div className="font-semibold text-[#1F2A1F]">Show banner on homepage</div>
                  <div className="text-sm text-[#6F7A5A] mt-0.5">
                    When off, the entire stats strip is hidden site-wide.
                  </div>
                </div>
              </label>
            </section>

            {/* Per-metric controls */}
            <section className="space-y-3">
              <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F]">Metrics</h2>
              {METRIC_KEYS.map((key) => {
                const m = settings.metrics[key];
                const meta = METRIC_META[key];
                const mode: "auto" | "manual" = m.manual === null ? "auto" : "manual";
                return (
                  <div
                    key={key}
                    className={`rounded-2xl border bg-white p-5 transition ${m.enabled ? "border-[#ECEEE4]" : "border-[#ECEEE4] opacity-70"}`}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-2xl" aria-hidden>{meta.emoji}</div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#1F2A1F]">{meta.title}</div>
                          <div className="text-xs text-[#6F7A5A] truncate">{meta.sourceHint}</div>
                        </div>
                      </div>
                      <Toggle
                        checked={m.enabled}
                        onChange={(checked) => setMetricEnabled(key, checked)}
                        ariaLabel={`Toggle ${meta.title}`}
                      />
                    </div>

                    {/* Body — disabled when metric is hidden */}
                    <div className={`mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 ${m.enabled ? "" : "pointer-events-none opacity-60"}`}>
                      {/* Mode picker */}
                      <div>
                        <label className="block text-xs uppercase tracking-wide text-[#6F7A5A] mb-1.5">Source</label>
                        <div className="inline-flex rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] p-0.5">
                          <button
                            type="button"
                            onClick={() => setMetricMode(key, "auto")}
                            className={`px-3 h-9 text-sm rounded-md transition ${mode === "auto" ? "bg-white text-[#1F2A1F] shadow-sm" : "text-[#6F7A5A] hover:text-[#1F2A1F]"}`}
                          >
                            Auto
                          </button>
                          <button
                            type="button"
                            onClick={() => setMetricMode(key, "manual")}
                            className={`px-3 h-9 text-sm rounded-md transition ${mode === "manual" ? "bg-white text-[#1F2A1F] shadow-sm" : "text-[#6F7A5A] hover:text-[#1F2A1F]"}`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>

                      {/* Manual value */}
                      <div>
                        <label className="block text-xs uppercase tracking-wide text-[#6F7A5A] mb-1.5">
                          Value {mode === "auto" && <span className="lowercase">(live)</span>}
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          disabled={mode === "auto"}
                          value={mode === "auto" ? "" : manualDrafts[key]}
                          placeholder={mode === "auto" ? "Live from DB" : "1234"}
                          onChange={(e) => setManualDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          className="w-full h-9 px-3 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] placeholder:text-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]/40 disabled:bg-[#FAFAF7] disabled:text-[#A8B096]"
                        />
                      </div>

                      {/* Label */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs uppercase tracking-wide text-[#6F7A5A] mb-1.5">Caption</label>
                        <input
                          type="text"
                          maxLength={40}
                          value={m.label}
                          onChange={(e) => setMetricLabel(key, e.target.value)}
                          className="w-full h-9 px-3 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] placeholder:text-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]/40"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Save bar */}
            <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-4 pb-4 bg-gradient-to-t from-[#FAFAF7] via-[#FAFAF7]/95 to-transparent">
              <div className="flex items-center justify-end gap-3">
                {savedAt && Date.now() - savedAt < 4000 && (
                  <span className="text-sm text-[#556036]">Saved ✓</span>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  data-dirty={dirtyHash.length}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────── Toggle ───────────────────────────

function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 ${checked ? "bg-[#8F9E4F]" : "bg-[#ECEEE4]"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${checked ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
