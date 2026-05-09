/**
 * Минимальная i18n-инфраструктура для Maporia.
 *
 * **Цель сейчас:** заложить точку расширения, чтобы UI-строки на /pricing,
 * BecomeProviderModal, PaywallModal не были хардкоженными внутри JSX.
 *
 * **Цель НЕ сейчас:** реальный multi-locale (ru/es/de). Когда понадобится —
 * подключаем `next-intl` или native middleware с `accept-language`, не меняя
 * сигнатуру `t()`.
 *
 * См. docs/PRICING_V2_PLAN.md § 11.4.
 *
 * Использование:
 *   import { t } from '@/app/lib/i18n';
 *   t('pricing.toggle.monthly');     // 'Monthly'
 *   t('pricing.save_percent', { p: 20 });  // 'Save 20%'
 */

import { logger } from "@/app/lib/logger";

export type Locale = "en";

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Сейчас работаем только с en. Структура strings организована по namespace'ам:
 * `pricing.*`, `paywall.*`, `become_provider.*`, etc. — чтобы легко делегировать
 * в раздельные JSON-файлы при росте.
 */
const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    "pricing.title": "Maporia plans",
    "pricing.toggle.monthly": "Monthly",
    "pricing.toggle.yearly": "Yearly",
    "pricing.toggle.save_percent": "Save {p}%",
    "pricing.cta.buy": "Buy",
    "pricing.cta.subscribe": "Subscribe",
    "pricing.cta.current": "Current plan",
    "pricing.cta.locked": "Locked",
    "pricing.cta.loading": "Loading…",
    "pricing.addon.title": "Hit the limit? Buy more slots",
    "pricing.tax_note":
      "Prices exclude taxes. Maporia is a directory — we don't process payments between buyers and providers; deals happen directly.",

    "paywall.title": "Upgrade to publish",
    "paywall.suggested_plan": "Suggested plan: {plan} from {price}",

    "become_provider.title": "What would you like to host?",
    "become_provider.subtitle": "Pick one or more types",
    "become_provider.continue": "Continue",
    "become_provider.continue_n": "Continue → {n} type{s}",
    "become_provider.fallback_hint":
      "Pricing depends on the types you pick and is shown on the final step. Filling out the form is free.",
    "become_provider.suggested_hint":
      "Suggested plan: {plan} from {price}. You'll see Monthly/Yearly options after you fill the form.",
    "become_provider.covered": "Covered",
  },
};

/**
 * Простой строковый интерполятор `{key}` → значение из params.
 * Не делает плюрализацию — для будущего нужен будет ICU-плагин.
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = params[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

/**
 * Получить строку по ключу. Если ключ не найден — возвращает сам ключ
 * (видно в UI как сигнал отсутствующего перевода).
 *
 * Локаль пока всегда DEFAULT_LOCALE. Когда подключим locale-detection — сюда
 * добавится аргумент `locale` или контекст из next-intl.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const locale = DEFAULT_LOCALE;
  const template = STRINGS[locale]?.[key];
  if (!template) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn(`[i18n] Missing key: ${key}`);
    }
    return key;
  }
  return interpolate(template, params);
}

/**
 * Список доступных локалей. Сейчас один; добавление новой = новый ключ в STRINGS.
 */
export function availableLocales(): readonly Locale[] {
  return Object.keys(STRINGS) as Locale[];
}

/**
 * Hook-style helper для React-компонентов. Возвращает связанную `t` функцию.
 * Когда подключим next-intl — заменим тело на `useTranslations()`, остальной
 * код продолжит работать.
 */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  return t;
}
