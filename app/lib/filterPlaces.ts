/**
 * Централизованная функция фильтрации мест.
 *
 * Источник правды для:
 *   - /map (основной список + getFilteredCount)
 *   - /lib/filterCounts.ts (computeFilterCounts — считает счётчики для FiltersModal)
 *
 * Раньше функция жила внутри `app/map/page.tsx` и дублировалась логикой
 * на других страницах. Вынесена 2026-05-07 в рамках Спринт 1 (см.
 * `docs/FILTERS_IMPROVEMENT_PLAN.md` §3.4).
 *
 * Логика фильтрации по `kind` использует ТОЛЬКО primary kind (без
 * secondary_kinds). Это согласуется со счётчиками `StatsBanner` и
 * серверным `.in("kind", kinds)` на /map. Если нужно когда-нибудь
 * переключиться на union(primary, secondary) — менять надо во всех
 * трёх местах разом.
 */

import { isPlacePremium } from "./access";
import { isPlaceWithinCityRadius } from "./cityRadius";
import { normalizeCity } from "../utils";
import { stripTagEmoji } from "../constants";

export type PlaceKind = 'location' | 'service' | 'experience';

/** Минимальный набор полей места, необходимый для фильтрации.
 *  Совместим и с `Place` (полный), и с `PlaceListItem` (lightweight для списков). */
export type FilterablePlace = {
  city?: string | null;
  city_name_cached?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  kind?: PlaceKind | null;
  lat?: number | null;
  lng?: number | null;
  access_level?: string | null;
  is_premium?: boolean | null;
  premium_only?: boolean | null;
  visibility?: string | null;
};

export type PlaceFilters = {
  premium?: boolean;
  /** @deprecated alias for premium — оставлен для обратной совместимости */
  premiumOnly?: boolean;
  cities?: string[];
  categories?: string[];
  tags?: string[];
  /** Фильтр по типу карточки. OR внутри группы. Undefined / [] = все типы. */
  kinds?: PlaceKind[];
  /** Pre-resolved city coordinates for radius filtering */
  cityCoordsMap?: Map<string, { lat: number | null; lng: number | null }>;
};

function normalizeCategoryMatch(value: string): string {
  return stripTagEmoji(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function filterPlaces<P extends FilterablePlace>(places: P[], filters: PlaceFilters): P[] {
  let filtered = places;
  const wantPremium = !!(filters.premium || filters.premiumOnly);

  // Premium
  if (wantPremium) {
    filtered = filtered.filter(place => isPlacePremium(place));
  }

  // Города (OR + радиус 10 миль если есть координаты)
  if (filters.cities && filters.cities.length > 0) {
    const coordsMap = filters.cityCoordsMap;
    const wantedCities = filters.cities;
    filtered = filtered.filter(place => {
      return wantedCities.some(cityName => {
        const coords = coordsMap?.get(cityName.toLowerCase().trim());
        if (coords) {
          return isPlaceWithinCityRadius(place, cityName, coords.lat, coords.lng);
        }
        const placeCity = normalizeCity(place.city || place.city_name_cached);
        return normalizeCity(cityName) === placeCity;
      });
    });
  }

  // Категории — OR
  if (filters.categories && filters.categories.length > 0) {
    const wantedCats = filters.categories.map(normalizeCategoryMatch);
    filtered = filtered.filter(place => {
      if (!place.categories || place.categories.length === 0) return false;
      const placeCategories = place.categories.map(normalizeCategoryMatch);
      return wantedCats.some(cat => placeCategories.includes(cat));
    });
  }

  // Kind — OR. Place без kind считаем 'location' (legacy).
  if (filters.kinds && filters.kinds.length > 0) {
    const kindsSet = new Set(filters.kinds);
    filtered = filtered.filter(place => {
      const k = (place.kind ?? 'location') as PlaceKind;
      return kindsSet.has(k);
    });
  }

  // Теги — OR
  if (filters.tags && filters.tags.length > 0) {
    const wantedTags = filters.tags.map(normalizeCategoryMatch);
    filtered = filtered.filter(place => {
      if (!place.tags || place.tags.length === 0) return false;
      const placeTags = place.tags.map(normalizeCategoryMatch);
      return wantedTags.some(tag => placeTags.includes(tag));
    });
  }

  return filtered;
}
