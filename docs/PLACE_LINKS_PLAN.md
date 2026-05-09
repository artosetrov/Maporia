# PLACE_LINKS_PLAN.md — Host pattern (location ↔ experience/service)

Дата: 2026-05-08
Скоуп: добавить M:N связи между places, чтобы локация (например ферма) могла быть «host'ом» для нескольких experience/service. Airbnb-style host page.

Источники правды до начала: `app/types.ts`, `app/lib/pricing/registry.ts` (для capabilities), миграции `add_place_kind_and_pricing_fields`, `add_secondary_kinds_to_places`, `pricing_v2_creator_location_and_grandfather`.

---

## 0. Цели и не-цели

**Цели:**

- Поддержать кейс «одна локация — много experience/service»: ферма с дегустацией, обедом, экскурсией.
- Поддержать кейс «один experience в нескольких локациях»: тур по 3 точкам, фотограф работает в 5 локациях.
- Host-page на `/id/<location_id>`: список всех связанных experience/service.
- Backlink на `OfferPlaceView` (страница experience/service): «📍 At Vrijhof Farm» со ссылкой и пином.
- Authority: только владелец **обоих** places может создать link (RLS вариант A — см. § 4).

**Не-цели:**

- НЕ заменять `secondary_kinds` — он остаётся для лёгкого 1:1 кейса (фотограф со студией = одна карточка с двумя kind'ами).
- НЕ менять `places.kind` enum — link это связь, не kind.
- НЕ менять pricing model: каждая карточка = отдельный slot в квоте.
- НЕ делать approval-flow / pending state в v1 (вариант C из обсуждения отклонён).
- НЕ открывать линковку чужих карточек (вариант B отклонён).

---

## 1. Когда `secondary_kinds`, а когда `place_links`

Эти два механизма **сосуществуют**.

| Сценарий | Решение | Карточек |
|---|---|---|
| Фотограф в одной студии | `secondary_kinds=['location']` | 1 |
| Surf-инструктор на одном пляже | `secondary_kinds=['location']` | 1 |
| Ферма с 4 experience (дегустация, обед, экскурсия, тур) | 1 location + 4 experience + 4 links | 5 |
| Тур по 3 локациям | 3 location + 1 experience + 3 links | 4 |
| Фотограф в 5 студиях (его и партнёрских) | 5 location + 1 service + 5 links | 6 |

**Правило выбора (для UI-подсказок):**

- Только 1 location, и она «принадлежит» одному experience (не отдельная сущность для других offerings) → `secondary_kinds`.
- Иначе (M:N, или location существует независимо как catalog entry) → отдельные карточки + `place_links`.

---

## 2. DB schema

### Таблица `place_links`

```sql
CREATE TABLE public.place_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  child_place_id  uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'happens_at'
    CHECK (relation IN ('happens_at')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parent_place_id, child_place_id, relation),
  CHECK (parent_place_id <> child_place_id)
);

CREATE INDEX place_links_parent_idx ON public.place_links (parent_place_id);
CREATE INDEX place_links_child_idx  ON public.place_links (child_place_id);
```

### Constraint trigger (validate kinds)

```sql
CREATE OR REPLACE FUNCTION public.enforce_place_link_kinds()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_parent_kind text;
  v_child_kind  text;
BEGIN
  SELECT kind INTO v_parent_kind FROM public.places WHERE id = NEW.parent_place_id;
  SELECT kind INTO v_child_kind  FROM public.places WHERE id = NEW.child_place_id;

  IF v_parent_kind IS NULL OR v_child_kind IS NULL THEN
    RAISE EXCEPTION 'place_links: parent or child place not found';
  END IF;

  IF NEW.relation = 'happens_at' THEN
    IF v_parent_kind <> 'location' THEN
      RAISE EXCEPTION 'place_links.happens_at: parent must be kind=location (got %)', v_parent_kind;
    END IF;
    IF v_child_kind NOT IN ('service', 'experience') THEN
      RAISE EXCEPTION 'place_links.happens_at: child must be service|experience (got %)', v_child_kind;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER place_links_kind_check
  BEFORE INSERT OR UPDATE ON public.place_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_place_link_kinds();
```

### RLS

```sql
ALTER TABLE public.place_links ENABLE ROW LEVEL SECURITY;

-- Public read: anyone (включая anon) — host-page доступна без авторизации.
CREATE POLICY "place_links_select_public" ON public.place_links
  FOR SELECT USING (true);

-- Insert: только если current user владеет И parent И child (вариант A — строгий).
CREATE POLICY "place_links_insert_own_both" ON public.place_links
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
    AND
    auth.uid() = (SELECT created_by FROM public.places WHERE id = child_place_id)
  );

-- Delete: то же требование (владелец обоих).
CREATE POLICY "place_links_delete_own_both" ON public.place_links
  FOR DELETE USING (
    auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
    OR
    auth.uid() = (SELECT created_by FROM public.places WHERE id = child_place_id)
  );

-- Update: только sort_order — нельзя менять parent/child (создавай новый link).
-- Делаем UPDATE доступным владельцу обоих, но в UI ограничиваем поле.
CREATE POLICY "place_links_update_own_both" ON public.place_links
  FOR UPDATE USING (
    auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
    AND
    auth.uid() = (SELECT created_by FROM public.places WHERE id = child_place_id)
  );

-- Admin: bypass через сервисный роль (отдельной policy не нужно).
```

**Важно:** policy для INSERT/UPDATE требует владения обоими. DELETE — достаточно одного из двух (если фотограф продал студию ферме, любая сторона может разорвать связь). Можно ужесточить если нужно.

---

## 3. TS layer

### Типы (`app/types.ts` или `app/types/supabase.ts`)

```ts
export type PlaceLinkRelation = "happens_at";

export type PlaceLink = {
  id: string;
  parent_place_id: string;
  child_place_id: string;
  relation: PlaceLinkRelation;
  sort_order: number;
  created_at: string;
  created_by: string | null;
};
```

### Lib (`app/lib/placeLinks.ts`)

```ts
// SELECT children of a location (Host page)
export async function getChildrenOfLocation(parentId: string): Promise<PlaceListItem[]>;

// SELECT parents of an experience/service (Backlink)
export async function getParentsOfChild(childId: string): Promise<PlaceListItem[]>;

// INSERT — RLS проверит ownership
export async function createLink(args: { parentId: string; childId: string; relation?: PlaceLinkRelation }): Promise<PlaceLink>;

// DELETE — RLS проверит ownership
export async function removeLink(linkId: string): Promise<void>;
```

Все функции — pure async wrappers вокруг supabase-js. Без cache layer (это придёт когда понадобится).

---

## 4. UI changes

### 4.1 `/id/[location_id]` — Host page

В `app/id/[id]/page.tsx` после kind-router'а (когда rendered location-view, legacy):

```tsx
{kind === 'location' && (
  <LocationChildrenSection parentId={place.id} />
)}
```

Компонент `LocationChildrenSection`:
- SSR-friendly: fetch'ит children через RSC или client-side.
- Скрывается если children = 0.
- Layout: горизонтальный скролл карточек (PlaceCard) с заголовком «Experiences & services here».
- Если children >= 4 — в конце «See all» -> /search?parent=<id> (отдельная page, future).

### 4.2 `OfferPlaceView` — Parent backlink

В `app/id/[id]/_views/OfferPlaceView.tsx` над описанием:

```tsx
{parents.length > 0 && (
  <ParentLocationCard parents={parents} />
)}
```

Компонент `ParentLocationCard`:
- Если parents.length = 1 → большая карточка с минимапой, именем фермы, ссылкой.
- Если parents.length > 1 → горизонтальный список (тур по нескольким точкам).

### 4.3 `/add` — Link selector при создании service/experience

В шаге edit (`/places/[id]/edit/details` или новом step) добавить опциональное поле:

```
☐ This happens at a specific location
  └─ [Search your locations...]   (autocomplete)
```

- Autocomplete: только location-карточки текущего юзера (`created_by = me AND kind='location'`).
- При сохранении формы — INSERT в `place_links`.
- Если ферма ещё не существует — link с «+ Create new location» которая открывает inline mini-form.

### 4.4 `/places/[id]/edit` — Manage links

Новая секция «Linked places» в edit-хабе:
- Для location-карточки: список children + add/remove.
- Для experience/service-карточки: список parents + add/remove.
- Add: тот же autocomplete что и в /add, но фильтрует по противоположному kind.

---

## 5. Pricing impact

**Минимальный.** Каждая карточка остаётся отдельной сущностью в квоте.

- Pro All ($34.99): 10 combined → ферма + 4 experience + 5 services = 10. Хост умещается.
- Pro Experience ($14.99): 5 experiences. Если хочешь привязать их к ферме — нужна отдельная location-карточка → нужен Pro Location ($9.99) или Pro All ($34.99).
- Pro Location ($9.99): 5 locations. Если хочешь добавить experience-offerings — нужен Pro Experience или Pro All.

**`secondary_kinds` остаётся** для случая «нет отдельной location-карточки в каталоге, просто пин на карте к моему experience». Это бесплатное дополнение для creator-планов.

**Не меняем capabilities в registry** — `place_links` это связь между существующими карточками, никаких новых capabilities не нужно.

---

## 6. Фазы реализации

| Фаза | Что | Файлы | Эффорт |
|---|---|---|---|
| Φ1 | Migration `place_links` + constraint trigger + RLS + indexes | `supabase/migrations/...` (через MCP) | M |
| Φ2 | Types + `app/lib/placeLinks.ts` (read-only функции) | `app/types.ts`, `app/lib/placeLinks.ts` | S |
| Φ3 | `LocationChildrenSection` + integration в `/id/[id]` page | `app/id/[id]/_views/LocationChildrenSection.tsx`, `app/id/[id]/page.tsx` | M |
| Φ4 | `ParentLocationCard` + integration в `OfferPlaceView` | `app/id/[id]/_views/ParentLocationCard.tsx`, `OfferPlaceView.tsx` | M |
| Φ5 | Smoke-test через прямой SQL: создать тестовый link, проверить что host-page рендерит | manual | S |
| Φ6 | `/add` link selector — autocomplete по своим locations + создание link | `app/(auth)/add/page.tsx`, `app/(auth)/places/[id]/edit/details/page.tsx` | L |
| Φ7 | `/places/[id]/edit` — секция Linked places + add/remove | `app/(auth)/places/[id]/edit/links/page.tsx` (новый) | M |
| Φ8 | RLS smoke-tests через DO-блок (создать tests user, проверить что нельзя прицепить чужой child) | mcp_supabase | S |
| Φ9 | Update memory (`maporia_place_kinds`, `maporia_supabase`) + as-built journal | memory | S |

**Total:** ~3-4 рабочих дня. Φ1-Φ4 — самое важное (host-page работает). Φ6-Φ7 — UX для self-serve линковки.

---

## 7. Rollback стратегия

- Миграция additive: новая таблица + триггер. Откат — `DROP TABLE place_links CASCADE`.
- UI-компоненты под feature-flag `NEXT_PUBLIC_PLACE_LINKS_ENABLED` — если что-то ломается, можно отключить без redeploy.
- Существующие места с `secondary_kinds` не трогаем — обратная совместимость гарантирована.

---

## 8. Открытые вопросы

1. **Multi-tenant ownership.** Что если ферма принадлежит юзеру A, а experience — юзеру B (например, фермер сдаёт пространство стороннему гиду)? RLS вариант A это запрещает. Варианты:
   - Co-ownership table `place_owners(place_id, user_id, role)` — большая работа.
   - Approval flow (пометить «pending» при INSERT, parent owner подтверждает).
   - В v1 говорим: если шаринг между ownerами нужен — оба заводят аккаунт под одним юзером, или admin делает manual link.
2. **«Pre-existing» locations.** Что если юзер хочет привязать experience к публичной локации (созданной другим юзером)? RLS A блокирует. В v1 — нет возможности. В v2 можно добавить flag `places.allows_external_offerings: bool` (owner sets it on his location), и тогда другие могут link'аться без approval.
3. **Sort order.** Как parent owner управляет порядком children на host-page? UI drag-and-drop или просто `created_at`-based? В v1 — `created_at`, drag-and-drop потом.
4. **Search/filter integration.** Должен ли pin на /map для location показывать count «5 experiences here» бейдж? Это требует JOIN'а в feed-query — можно сделать в Φ10+.
5. **Storage RLS.** Если parent owner = X, child owner = X (RLS A), то фото child'a загружаются под X — текущий storage RLS должен работать. Перепроверить.

---

## 9. Definition of Done

- [ ] Миграция `place_links` применена, smoke-тесты прошли.
- [ ] RLS-тесты: владелец обоих может INSERT, владелец одного — нет, anon — нет.
- [ ] `LocationChildrenSection` рендерит children на /id/<location>.
- [ ] `ParentLocationCard` рендерит parents на OfferPlaceView.
- [ ] `/add` для service/experience имеет рабочий link selector с autocomplete.
- [ ] `/places/[id]/edit` имеет секцию manage links.
- [ ] Smoke-тест: один юзер создаёт ферму + 3 experience + 3 link'а; на /id/<farm> видны 3 карточки; на /id/<exp> видна ферма.
- [ ] Memory обновлена.

---

## 10. As-built journal

(Заполняется по мере реализации фаз)

### 2026-05-08 — Φ0 done (plan written)

- Этот документ создан. Решения:
  - RLS вариант A (только владелец обоих).
  - `secondary_kinds` сохраняется для лёгкого 1:1 кейса; `place_links` — для M:N.
  - Pricing не меняется; каждая карточка = отдельный slot.
- Открытые вопросы (§ 8) — для будущих сессий.
