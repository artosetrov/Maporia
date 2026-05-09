/**
 * ENV validation для Stripe + pricing v2.
 *
 * Стратегия (см. docs/PRICING_V2_PLAN.md § 11.3):
 *   - `validatePricingEnv()` без аргументов — soft-проверка: только core (STRIPE_SECRET_KEY,
 *     STRIPE_WEBHOOK_SECRET) обязательны. pricing-v2 SKU optional во время rollout.
 *   - `validatePricingEnv({ strict: true })` — hard-проверка: ВСЕ ENV из registry
 *     обязательны. Включается после Φ4 (provisioning) и Φ12 (regression test).
 *
 * Поведение при ошибке: throw EnvValidationError с понятным сообщением.
 *
 * Где звать:
 *   - В роутах /api/stripe/* — soft, чтобы старые SKU работали даже если v2 не залит.
 *   - В `scripts/stripe/provision-prices.ts` — strict перед запуском.
 *   - В CI / build-time — strict, после Φ4.
 */

import { listAllStripePriceEnvs } from "./pricing/checkout";

export class EnvValidationError extends Error {
  constructor(
    public readonly missing: readonly string[],
    public readonly invalid: readonly { name: string; reason: string }[],
  ) {
    const lines = [
      `ENV validation failed:`,
      missing.length > 0 ? `  Missing (${missing.length}): ${missing.join(", ")}` : null,
      invalid.length > 0
        ? `  Invalid (${invalid.length}): ${invalid.map((i) => `${i.name} — ${i.reason}`).join("; ")}`
        : null,
    ].filter(Boolean);
    super(lines.join("\n"));
    this.name = "EnvValidationError";
  }
}

export type EnvValidationOptions = {
  /**
   * strict=true: все pricing v2 SKU обязательны.
   * strict=false (default): только core Stripe ENV. pricing v2 — optional.
   */
  strict?: boolean;
};

/**
 * Валидирует ENV. Кидает `EnvValidationError`, если что-то не так.
 * Не возвращает значения — `process.env.X` читать как обычно после успешной проверки.
 */
export function validatePricingEnv(opts: EnvValidationOptions = {}): void {
  const missing: string[] = [];
  const invalid: { name: string; reason: string }[] = [];

  // Core — всегда обязательно
  const core = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;
  for (const key of core) {
    if (!process.env[key]) missing.push(key);
  }

  // Pricing v2 SKU — optional/strict в зависимости от mode
  for (const key of listAllStripePriceEnvs()) {
    const val = process.env[key];
    if (!val || val.length === 0) {
      if (opts.strict) missing.push(key);
      continue;
    }
    if (!val.startsWith("price_")) {
      invalid.push({ name: key, reason: `must start with "price_" (got "${val.slice(0, 12)}…")` });
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    throw new EnvValidationError(missing, invalid);
  }
}

/**
 * Возвращает список pricing-ENV, которых сейчас нет в окружении.
 * Используется UI на /pricing — показать "this plan is temporarily unavailable",
 * вместо упавшего checkout.
 */
export function getMissingPricingEnvs(): string[] {
  return listAllStripePriceEnvs().filter((k) => !process.env[k]);
}

/**
 * Безопасный getter ENV — кидает понятную ошибку, если переменная пустая.
 * Использовать в боевом коде вместо `process.env.X!`.
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new EnvValidationError([name], []);
  }
  return v;
}
