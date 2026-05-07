"use client";

/**
 * StatsBannerView — чистый презентационный layer для StatsBanner.
 *
 * Рендерит «Maporia Premium» вариант (тёплый бежевый фон + янтарный glow +
 * мягкий shimmer + золотистая рамка + gradient text на цифрах).
 *
 * Используется в двух местах:
 *  1. `app/components/StatsBanner.tsx` — оборачивает live-данными Supabase и
 *     настройками `app_settings(id='stats_banner')`.
 *  2. `app/(auth)/profile/elements/stats-banner/page.tsx` — Live preview в
 *     админке: те же стили, но числа подставляются из черновика редактора
 *     (auto → текущий live count, manual → то, что админ только что ввёл).
 *
 * Сам view ничего не знает ни про Supabase, ни про настройки — ему дают
 * готовые ячейки. Это единственный источник правды по визуалу баннера —
 * любые правки стиля делать ЗДЕСЬ, чтобы /admin и `/` всегда совпадали.
 *
 * Анимация shimmer и поддержка `prefers-reduced-motion` — в `app/globals.css`
 * (.stats-banner-shimmer / @keyframes stats-shimmer).
 */

export type StatsBannerItem = {
  /** Уникальный ключ для React-key. */
  key: string;
  /** Эмодзи слева от числа. */
  emoji: string;
  /**
   * Само число. `null` означает «нет данных» — будет показан em-dash.
   * Если поднят `loading`, то значение игнорируется и рисуется skeleton.
   */
  value: number | null;
  /** Подпись под числом (uppercase, tracking). */
  label: string;
  /** true — вместо числа показать skeleton (auto-метрика ещё грузится). */
  loading?: boolean;
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/**
 * Tailwind grid-cols-* должен быть статичной строкой, иначе JIT не сгенерит
 * класс. Поэтому жёсткий мап числа метрик в литерал.
 */
const GRID_COLS_SM: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export default function StatsBannerView({
  items,
  className = "",
  ariaLabel = "Maporia by the numbers",
}: {
  items: StatsBannerItem[];
  className?: string;
  ariaLabel?: string;
}) {
  if (items.length === 0) return null;

  const cols = Math.min(items.length, 4) as 1 | 2 | 3 | 4;
  // Mobile: 1 колонка для одной метрики, иначе 2x2 (или 2x1).
  const mobileGrid = items.length === 1 ? "grid-cols-1" : "grid-cols-2";

  // Стилевые токены Premium-варианта. Длинные radial-gradient'ы держим в
  // const'ах, чтобы не плодить классы и не парсить их Tailwind JIT'ом.
  const sectionBackground = `
    radial-gradient(60% 140% at 100% 50%, rgba(214, 178, 94, 0.18), transparent 60%),
    radial-gradient(70% 140% at 0% 50%, rgba(143, 158, 79, 0.10), transparent 60%),
    linear-gradient(180deg, #FBFAF3 0%, #F2EFE2 100%)
  `;
  const numberGradient = "linear-gradient(180deg, #2A341F 0%, #6B5A22 100%)";
  const dividerGradient =
    "linear-gradient(to bottom, transparent, rgba(180,150,90,0.32), transparent)";

  return (
    <section
      aria-label={ariaLabel}
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: sectionBackground,
        border: "1px solid rgba(180, 150, 90, 0.18)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.85), 0 24px 50px -28px rgba(60, 50, 20, 0.25)",
      }}
    >
      {/* Мягкий тёплый shimmer-overlay поверх фона. pointer-events-none, чтобы
          не мешать кликам, и aria-hidden — это чисто декоративный слой. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 stats-banner-shimmer"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(214,178,94,0.10) 50%, transparent 100%)",
        }}
      />

      <ul className={`relative grid ${mobileGrid} ${GRID_COLS_SM[cols]}`}>
        {items.map((item, idx) => {
          const mobileRowBorder =
            items.length > 2 && idx >= 2
              ? "border-t border-[rgba(180,150,90,0.20)] sm:border-t-0"
              : "";
          return (
            <li
              key={item.key}
              className={`relative flex flex-col items-center justify-center text-center px-3 py-4 sm:py-5 ${mobileRowBorder}`}
            >
              {/* Вертикальный градиентный разделитель между ячейками на sm+.
                  Затухает сверху и снизу — это и есть «премиальное» ощущение
                  вместо плоского divide-x. */}
              {idx > 0 && (
                <span
                  aria-hidden
                  className="hidden sm:block absolute left-0 top-[22%] bottom-[22%] w-px"
                  style={{ background: dividerGradient }}
                />
              )}

              <div className="flex items-baseline gap-2">
                <span aria-hidden className="text-xl sm:text-2xl leading-none">
                  {item.emoji}
                </span>
                <span className="font-fraunces text-[26px] sm:text-3xl font-semibold tabular-nums leading-none text-[#1F2A1F]">
                  {item.loading ? (
                    <span className="inline-block w-14 h-6 sm:h-7 bg-[#ECEEE4] rounded animate-pulse align-middle" />
                  ) : item.value === null ? (
                    <span className="text-[#A8B096]">—</span>
                  ) : (
                    <span
                      className="bg-clip-text text-transparent"
                      style={{ backgroundImage: numberGradient }}
                    >
                      {fmt(item.value)}
                    </span>
                  )}
                </span>
              </div>
              <span className="mt-1.5 text-[11px] sm:text-[12px] font-medium text-[#6F7A5A] uppercase tracking-[0.08em]">
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
