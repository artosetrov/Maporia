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
- Authority: гибрид **A + C** (см. § 4):
  - **Same-owner** (юзер X владеет И parent И child) → link активируется сразу (`status='active'`).
  - **Cross-owner** (юзер X владеет только child, parent чужой) → link создаётся в `status='pending'`, parent owner одобряет/отклоняет.

**Не-цели:**

- НЕ заменять `secondary_kinds` — он остаётся для лёгкого 1:1 кейса (фотограф со студией = одна карточка с двумя kind'ами).
- НЕ менять `places.kind` enum — link это связь, не kind.
- НЕ менять pricing model: каждая карточка = отдельный slot в квоте.
- НЕ открывать полностью линковку чужих карточек без approval (вариант B отклонён) — нужна явная авторизация parent owner'а.

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
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'rejected')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,        -- when parent owner approved (or rejected_at-style timestamp)
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (parent_place_id, child_place_id, relation),
  CHECK (parent_place_id <> child_place_id)
);

CREATE INDEX place_links_parent_idx ON public.place_links (parent_place_id);
CREATE INDEX place_links_child_idx  ON public.place_links (child_place_id);
CREATE INDEX place_links_pending_idx
  ON public.place_links (parent_place_id) WHERE status = 'pending';
```

**Status semantics:**

- `active` — link виден на host-page и backlink. Default для same-owner; устанавливается parent owner'ом для cross-owner.
- `pending` — child уже создал запрос, ждёт одобрения parent owner'а. На host-page **не виден**, но parent owner видит в своём inbox'е (`/places/[id]/edit/links`).
- `rejected` — parent owner отклонил. Не виден ни на host-page, ни в backlink. Child owner может попробовать снова (старая запись остаётся для аудита; UNIQUE сработает — нужно сначала DELETE rejected, потом INSERT).

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

### RLS (гибрид A + C)

```sql
ALTER TABLE public.place_links ENABLE ROW LEVEL SECURITY;

-- ── SELECT ──
-- Public видит только active links (host-page).
-- Parent owner видит ВСЕ свои pending/rejected (для approval inbox).
-- Child owner видит свои pending/rejected (узнать статус заявки).
CREATE POLICY "place_links_select" ON public.place_links
  FOR SELECT USING (
    status = 'active'
    OR auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
    OR auth.uid() = (SELECT created_by FROM public.places WHERE id = child_place_id)
  );

-- ── INSERT ──
-- Юзер всегда должен владеть child (нельзя за чужой experience прицепить).
-- Если он также владеет parent → разрешаем status='active'.
-- Если он владеет только child → разрешаем status='pending', никаких других статусов.
CREATE POLICY "place_links_insert" ON public.place_links
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT created_by FROM public.places WHERE id = child_place_id)
    AND
    (
      -- Same-owner branch: владелец обоих → status может быть только 'active'
      (
        auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
        AND status = 'active'
      )
      OR
      -- Cross-owner branch: владелец только child → status должен быть 'pending'
      (
        auth.uid() <> (SELECT created_by FROM public.places WHERE id = parent_place_id)
        AND status = 'pending'
      )
    )
  );

-- ── UPDATE ──
-- Parent owner может менять status (approve/reject) и sort_order.
-- Child owner — только если он же parent owner (same-owner случай).
CREATE POLICY "place_links_update" ON public.place_links
  FOR UPDATE USING (
    auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
  );

-- ── DELETE ──
-- Любая сторона может разорвать связь.
CREATE POLICY "place_links_delete" ON public.place_links
  FOR DELETE USING (
    auth.uid() = (SELECT created_by FROM public.places WHERE id = parent_place_id)
    OR
    auth.uid() = (SELECT created_by FROM public.places WHERE id = child_place_id)
  );

-- Admin: bypass через service_role (отдельной policy не нужно).
```

**Trigger для `approved_at` timestamp:**

```sql
CREATE OR REPLACE FUNCTION public.touch_place_link_approved_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('active', 'rejected') THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER place_links_touch_approved_at
  BEFORE UPDATE ON public.place_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_place_link_approved_at();
```

**Инварианты:**

- Cross-owner юзер не может создать `status='active'` напрямую — RLS отрежет (CHECK clause).
- Cross-owner юзер не может «упасть» в active через UPDATE — UPDATE доступен только parent owner'у.
- Parent owner НЕ может INSERT за чужой child (нельзя притянуть чужой experience к своей ферме без согласия child owner'а).

---

## 3. TS layer

### Типы (`app/types.ts` или `app/types/supabase.ts`)

```ts
export type PlaceLinkRelation = "happens_at";
export type PlaceLinkStatus = "active" | "pending" | "rejected";

export type PlaceLink = {
  id: string;
  parent_place_id: string;
  child_place_id: string;
  relation: PlaceLinkRelation;
  status: PlaceLinkStatus;
  sort_order: number;
  created_at: string;
  approved_at: string | null;
  created_by: string | null;
};
```

### Lib (`app/lib/placeLinks.ts`)

```ts
// Public host-page: только status='active' (RLS обеспечивает).
export async function getChildrenOfLocation(parentId: string): Promise<PlaceListItem[]>;

// Public backlink: только status='active'.
export async function getParentsOfChild(childId: string): Promise<PlaceListItem[]>;

// INSERT — самый важный helper, выбирает правильный status.
// Если каллер владелец обоих places → status='active'; иначе → status='pending'.
// RLS-policy всё равно отрежет любой невалидный INSERT, но клиентская логика
// нужна для понятного UX («This link is pending farm owner approval»).
export async function createLink(args: {
  parentId: string;
  childId: string;
  relation?: PlaceLinkRelation;
}): Promise<PlaceLink>;

// Approval flow — только для parent owner'а.
export async function approveLink(linkId: string): Promise<PlaceLink>;
export async function rejectLink(linkId: string): Promise<PlaceLink>;

// Inbox для parent owner: список pending requests на его location'ы.
export async function getPendingRequestsForOwner(): Promise<PlaceLink[]>;

// DELETE — любая из сторон может разорвать.
export async function removeLink(linkId: string): Promise<void>;
```

Все функции — pure async wrappers вокруг supabase-js. Без cache layer.

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
  └─ [Search locations...]   (autocomplete по ВСЕМ публичным locations)
     ├─ My Vrijhof Farm       (own)        → INSERT status='active'
     ├─ Some Other Farm       (cross)      → INSERT status='pending', шапка «awaiting approval»
     └─ + Create new location              → inline mini-form
```

- Autocomplete: ВСЕ публичные location-карточки. Бейдж «Yours» на собственных.
- При сохранении формы — INSERT в `place_links`. Status выбирает `createLink()` (см. § 5).
- Если link cross-owner — UI показывает «Pending approval from <farm owner>».

### 4.4 `/places/[id]/edit` — Manage links

Новая секция «Linked places» в edit-хабе:
- Для **location-карточки**:
  - Approval inbox: pending requests от чужих creator'ов («[Photographer X] wants to host here. [Approve] [Reject]»).
  - Active children: список own + approved cross. С remove.
  - Add: autocomplete по своим service/experience-карточкам — INSERT status='active'.
- Для **experience/service-карточки**:
  - Active parents: список локаций где этот experience hosted.
  - Pending requests: «Awaiting approval from <farm owner>».
  - Add: autocomplete по public locations (см. § 4.3).
  - Remove: любая сторона.

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
| Φ1 | Migration `place_links` (table + status + RLS hybrid A+C + constraint trigger + indexes) | `supabase/migrations/...` (через MCP) | M |
| Φ2 | RLS smoke-tests: same-owner active, cross-owner pending, RLS блокирует прямой active от cross | mcp_supabase | S |
| Φ3 | Types + `app/lib/placeLinks.ts` (read + createLink + approve/reject + getPendingRequestsForOwner) | `app/types.ts`, `app/lib/placeLinks.ts` | M |
| Φ4 | `LocationChildrenSection` (только status='active') | `app/id/[id]/_views/LocationChildrenSection.tsx`, `app/id/[id]/page.tsx` | M |
| Φ5 | `ParentLocationCard` (только status='active') | `app/id/[id]/_views/ParentLocationCard.tsx`, `OfferPlaceView.tsx` | M |
| Φ6 | `/add` link selector — autocomplete по public locations + auto-status | `app/(auth)/add/page.tsx`, `app/(auth)/places/[id]/edit/details/page.tsx` | L |
| Φ7 | `/places/[id]/edit/links` — секция с approval inbox + add/remove | `app/(auth)/places/[id]/edit/links/page.tsx` (новый) | L |
| Φ8 | (Опционально) Notifications для parent owner о новых pending requests | TBD: email/in-app | M |
| Φ9 | Update memory (`maporia_place_kinds`, `maporia_supabase`) + as-built journal | memory | S |

**Total:** ~4-5 рабочих дней. Φ1-Φ5 — host-page работает (даже без cross-owner UX). Φ6-Φ7 — full self-serve including approval flow.

---

## 7. Rollback стратегия

- Миграция additive: новая таблица + триггер. Откат — `DROP TABLE place_links CASCADE`.
- UI-компоненты под feature-flag `NEXT_PUBLIC_PLACE_LINKS_ENABLED` — если что-то ломается, можно отключить без redeploy.
- Существующие места с `secondary_kinds` не трогаем — обратная совместимость гарантирована.

---

## 8. Открытые вопросы

1. **~~Multi-tenant ownership~~** — РЕШЕНО (2026-05-08): hybrid A+C. Same-owner = `active`, cross-owner = `pending` → approval. Parent owner approve/reject в `/places/[id]/edit/links`.
2. **~~«Pre-existing» locations~~** — РЕШЕНО: в C-flow юзер может прицепиться к ЛЮБОЙ публичной локации, parent owner решает.
3. **Approval notifications.** Как parent owner узнаёт о новом pending request? Опции:
   - In-app badge на /profile (кол-во pending). Дёшево, работает.
   - Email на parent's auth email через Resend / Supabase Auth. Дороже инфраструктурно.
   - Realtime push (Supabase Realtime channel). Real-time UX, но overkill для v1.
   - **Φ8 — рекомендую in-app badge для v1**, email/realtime отложить.
4. **Auto-reject after timeout.** Если parent owner не ответил 30 дней — auto-reject и уведомить child? Φ8 потом.
5. **Public listing of cross-owner approvals.** Когда parent одобрил cross-experience, child появляется на host-page parent'а. Должна ли это быть отдельная секция «Verified partners» vs «Own offerings»? UX-разделение помогает доверию (Airbnb так делает). В v1 — единый список, со временем разделим.
6. **Sort order.** В v1 — `created_at` ASC. Drag-and-drop позже.
7. **Search/filter integration.** Должен ли pin на /map для location показывать count «5 experiences here» бейдж? Φ10+, требует JOIN в feed-query.
8. **Storage RLS.** Cross-owner случай: фото child'а загружено под child owner'ом. Storage RLS остаётся owner-bound, ничего не меняем.
9. **Rate-limit на pending requests.** Чтобы spammer не зафлудил parent inbox. Идея: max 5 pending per user → parent. Защита от abuse. Φ8.

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

### 2026-05-08 — Φ0 done (plan written, revised to A+C hybrid)

- Этот документ создан. Решения:
  - RLS гибрид **A + C** (после refinement Артёма): same-owner → `active` сразу; cross-owner → `pending`, требует approval parent owner'ом.
  - Status enum: `active | pending | rejected`. Public видит только `active`.
  - INSERT-policy с двумя ветками: same-owner может INSERT только `active`; cross-owner может INSERT только `pending`. Cross-owner не может «обойти» через UPDATE — UPDATE доступен только parent owner'у.
  - Trigger `touch_place_link_approved_at` ставит timestamp при переходе из `pending`.
  - `secondary_kinds` сохраняется для лёгкого 1:1 кейса; `place_links` — для M:N + cross-owner.
  - Pricing не меняется; каждая карточка = отдельный slot.
- Открытые вопросы (§ 8) — все 9 пунктов, главные о notifications и rate-limiting (Φ8).

### 2026-05-08 — Φ1+Φ2 done (DB)

- Миграция `place_links_table_with_approval_flow` применена на прод. Таблица создана; RLS policies (4 шт.: select, insert, update, delete) с двухветочной INSERT-логикой; constraint trigger `enforce_place_link_kinds`; trigger `touch_place_link_approved_at`; индексы parent_idx, child_idx, partial pending_idx.
- Smoke-тесты (8/8 прошли через DO+rollback): location→service link OK, location→exp OK, exp→svc rejected (parent must be location), self-link rejected, status transition (pending→active sets approved_at), pending→rejected sets approved_at, UNIQUE blocks duplicates, ON DELETE CASCADE works.
- Verification: 0 links, 294 places (без изменений). Прод чист.

### 2026-05-08 — Φ3 done (TS lib)

- `app/lib/placeLinks.ts` создан: типы `PlaceLink`, `PlaceLinkStatus`, `PlaceLinkRelation`. Функции `getChildrenOfLocation`, `getParentsOfChild`, `createLink` (auto-detect status), `approveLink`, `rejectLink`, `getPendingRequestsForOwner`, `getPendingRequestsCount` (для badge), `removeLink`.
- `createLink` сначала резолвит ownership через SELECT, и затем INSERT с auto-resolved status. RLS делает финальную проверку. Cross-owner → `pending`.
- В `app/types/supabase.ts` добавлен Database['public']['Tables']['place_links'] (Row/Insert/Update) + `stripe_webhook_events`. supabase-js видит таблицу типизированно.

### 2026-05-08 — Φ4 done (LocationChildrenSection)

- `app/id/[id]/_views/LocationChildrenSection.tsx` создан. Горизонтальный скролл карточек children, заголовок «Experiences & services here» + counter. Скрывается при children=0.
- Интегрирован в `app/id/[id]/page.tsx` после legacy location-view (renders only when `place.kind === "location"`).

### 2026-05-08 — Φ5 done (ParentLocationCard)

- `app/id/[id]/_views/ParentLocationCard.tsx` создан. Single-parent → большая карточка «📍 At <farm>» со ссылкой. Multi-parent (тур) → горизонтальный список pill'ов «Stops on this tour».
- Интегрирован в `app/id/[id]/_views/OfferPlaceView.tsx` над описанием.

### 2026-05-08 — Φ7 done (manage links UI)

- `app/(auth)/places/[id]/edit/links/page.tsx` создан. Группирует links по статусу:
  - **Approval inbox** (только для location owner) — pending requests с кнопками [Approve] / [Reject] (амбер-фон).
  - **Pending outgoing** (только для child owner) — «Awaiting approval from <farm owner>» + Cancel.
  - **Active** — own/approved cross с Remove.
  - **Rejected** — opacity-70 архив с Delete-кнопкой.
- 403-page если юзер не владелец/не админ.
- TODO: add-from-here UI (autocomplete) — отдельная задача (Φ6 / Task #20). Сейчас юзер видит хинт «add via offering's edit page or create new one».

**TS + ESLint зелёные.**
