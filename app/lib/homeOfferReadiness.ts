import type { HomeKind } from "../types/home";
import { sanitizePostgrestValue } from "../utils";

/**
 * Home services/experiences should count real offer listings, not plain
 * Google-imported place cards that were accidentally classified as offers.
 */
export const HOME_OFFER_READY_OR_FILTER = `schedule.not.is.${sanitizePostgrestValue("null")},service_mode.not.is.${sanitizePostgrestValue("null")}`;

export function applyHomeOfferReadyFilter<T extends { or: (filter: string) => T }>(
  query: T,
): T {
  return query.or(HOME_OFFER_READY_OR_FILTER);
}

type HomeOfferReadinessFields = {
  kind?: HomeKind | null;
  schedule?: unknown | null;
  service_mode?: string | null;
};

export function isHomeOfferReady(place: HomeOfferReadinessFields): boolean {
  if (place.kind !== "service" && place.kind !== "experience") return true;
  return place.schedule != null || Boolean(place.service_mode);
}
