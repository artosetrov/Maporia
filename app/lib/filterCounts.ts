/**
 * Клиентский reduce всех счётчиков для FiltersModal.
 *
 * Booking/Airbnb pattern:
 *   - Счётчик опции X в группе G = «сколько мест останется, если выбрать X
 *     в группе G ДОПОЛНИТЕЛЬНО к уже выбранным фильтрам в других группах».
 *   - То есть применяем все фильтры КРОМЕ собственной группы, потом для
 *     каждой опции прибавляем 1 если место удовлетворяет «opt в группе G».
 *
 * Это даёт юзеру ясный сигнал: «выбор X дополнительно сузит до N» —
 * 0 значит «комбинация невозможна», что мы и используем для disabled-стейта.
 *
 * Total — обычный filterPlaces со всеми текущими фильтрами.
 *
 * Сложность: O(places × (kinds + categories + tags)). При 1K мест и
 * 30 категорий + 30 тегов — ~60K итераций, доли миллисекунды.
 */

import { filterPlaces, type PlaceFilters, type PlaceKind, type FilterablePlace } from "./filterPlaces";

export type FilterCounts = {
  total: number;
  kinds: Record<PlaceKind, number>;
  categories: Record<string, number>;
  tags: Record<string, number>;
};

export type CountInputs = {
  /** Текущий черновик фильтров из FiltersModal. */
  filters: PlaceFilters;
  /** Все возможные категории, для которых нужно посчитать count (показываем 0 для нерелевантных). */
  allCategories: readonly string[];
  /** Все теги, для которых нужно посчитать count. */
  allTags: readonly string[];
};

/**
 * Удаляет из `filters` указанную группу, возвращает новый объект.
 */
function withoutGroup(filters: PlaceFilters, group: 'kinds' | 'categories' | 'tags'): PlaceFilters {
  const next = { ...filters };
  next[group] = undefined;
  return next;
}

export function computeFilterCounts<P extends FilterablePlace>(
  places: P[],
  { filters, allCategories, allTags }: CountInputs,
): FilterCounts {
  // Total — все фильтры применяются.
  const total = filterPlaces(places, filters).length;

  // KIND counts: применяем premium + cities + categories + tags. Пропускаем kinds.
  const kindBase = filterPlaces(places, withoutGroup(filters, 'kinds'));
  const kinds: Record<PlaceKind, number> = { location: 0, service: 0, experience: 0 };
  for (const p of kindBase) {
    const k = (p.kind ?? 'location') as PlaceKind;
    if (k in kinds) kinds[k]++;
  }

  // CATEGORY counts: применяем premium + cities + kinds + tags. Пропускаем categories.
  const categoryBase = filterPlaces(places, withoutGroup(filters, 'categories'));
  const categories: Record<string, number> = {};
  for (const cat of allCategories) categories[cat] = 0;
  for (const p of categoryBase) {
    if (!p.categories) continue;
    for (const cat of p.categories) {
      if (cat in categories) categories[cat]++;
    }
  }

  // TAG counts: применяем premium + cities + kinds + categories. Пропускаем tags.
  const tagBase = filterPlaces(places, withoutGroup(filters, 'tags'));
  const tags: Record<string, number> = {};
  for (const tag of allTags) tags[tag] = 0;
  for (const p of tagBase) {
    if (!p.tags) continue;
    for (const tag of p.tags) {
      if (tag in tags) tags[tag]++;
    }
  }

  return { total, kinds, categories, tags };
}
