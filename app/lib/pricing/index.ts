/**
 * Pricing module — barrel export.
 *
 * Single source of truth: добавление нового плана = патч `registry.ts` + миграция БД.
 * Никаких хардкодов `STRIPE_PRICE_*` за пределами этого модуля.
 *
 * См. docs/PRICING_V2_PLAN.md § 11.1.
 */

export {
  PRICING_REGISTRY,
  PUBLIC_PLANS,
  CREATOR_PLAN_IDS,
  EXTRA_LISTING,
  ANNUAL_DISCOUNT,
  planBillingCycle,
  getPriceSpec,
  type PlanId,
  type Cycle,
  type Currency,
  type Capability,
  type PlanQuota,
  type PriceSpec,
  type PlanSpec,
  type PlanDisplay,
} from "./registry";

export {
  computeQuota,
  canCreateMultiKind,
  suggestPlanForKinds,
  planCoversKind,
  type Kind,
  type PlaceCounts,
  type QuotaDecision,
} from "./quota";

export {
  resolvePriceId,
  resolvePlanByPriceId,
  resolveExtraListingPriceId,
  isExtraListingPriceId,
  listAllStripePriceEnvs,
  PriceNotConfiguredError,
  UnsupportedPlanCycleError,
} from "./checkout";

export {
  getFeatures,
  type FeatureItem,
  type Locale,
} from "./features";

export {
  formatUSD,
  priceDisplay,
  annualDiscountLabel,
  type PriceDisplay,
} from "./format";
