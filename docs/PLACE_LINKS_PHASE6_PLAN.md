# PLACE_LINKS_PHASE6_PLAN.md — Add-flow для place_links

Дата: 2026-05-10
Скоуп: довести Φ6 (см. `docs/PLACE_LINKS_PLAN.md § 4.4`) — UI для **добавления** линков, помимо имеющегося просмотра + approval/remove.

Предыдущие фазы: модель данных (`place_links`), `createLink`/`approveLink`/`removeLink` в `app/lib/placeLinks.ts`, страницы `LocationChildrenSection` и `ParentLocationCard`, страница `/places/[id]/edit/links` с просмотром.

---

## 0. Цели и не-цели

**Цели:**

- На `/places/[id]/edit/links` дать прицепить existing experience/service к локации (и наоборот) через автокомплит.
- Кнопка «Create new …» в той же панели — ведёт в `/add?kind=service&parentId=…`, после save автоматически создаёт link.
- Точки входа:
  1. `/places/[id]/edit/links` — главная (visible owner'у).
  2. Host-page `/id/<location_id>` — кнопка для owner'а локации рядом с `LocationChildrenSection`.
  3. Страница experience/service `/id/<child_id>` — кнопка для owner'а сервиса/экспириенса в области, где может появиться `ParentLocationCard`.
- Same-owner → link сразу `active`. Cross-owner → `pending` (RLS уже делает, в UI просто показываем результат).

**Не-цели:**

- Не пересматриваем модель данных и RLS. Бэкенд уже всё умеет.
- Не делаем bulk-link (link сразу нескольких карточек в одну сессию).
- Не делаем drag-and-drop сортировку active-линков (есть `sort_order`, но это в следующую фазу).
- Не трогаем cross-owner аппрувал — он уже работает на `edit/links`.

---

## 1. Точки входа и поведение

### 1.1. `/places/[id]/edit/links` (главная)

- В шапке (над «Approval requests» и «Hosted here») рендерим `<AddPlaceLinkPanel placeId={placeId} kind={place.kind} onLinked={refetch} />`.
- Панель сама знает, какие kinds искать:
  - parent = location → ищет `kind in ('service','experience')` среди ВСЕХ public/own карточек (cross-owner допускается).
  - child = service/experience → ищет `kind = 'location'`.
- Если у юзера в принципе нет подходящих карточек → панель сразу показывает только «Create new …».

### 1.2. Host-page (`/id/<location_id>` для kind='location')

- В `LocationChildrenSection` (legacy view рендерит её отдельно) — если `canEdit`, в header'е секции добавляем `+ Add` link на `/places/<location_id>/edit/links`. Если children пусто и `canEdit` — компонент НЕ скрываем полностью, а показываем mini-CTA «Host experiences or services here — add one».

### 1.3. Child-page (`/id/<child_id>` для kind='service'|'experience')

- В `OfferPlaceView` под `ParentLocationCard` (или вместо него, если parents нет) — для owner'а кнопка «📍 Link this to a location» → `/places/<child_id>/edit/links`.

---

## 2. Новые файлы

```
app/lib/placeLinks.ts                       # +searchLinkCandidates
app/components/AddPlaceLinkPanel.tsx        # новый компонент
docs/PLACE_LINKS_PHASE6_PLAN.md             # этот файл
```

## 3. Изменённые файлы

```
app/(auth)/places/[id]/edit/links/page.tsx  # AddPlaceLinkPanel в шапке, убираем placeholder-хинт
app/(auth)/add/page.tsx                     # ?parentId= support, createLink после insert
app/id/[id]/_views/LocationChildrenSection.tsx
                                            # принимает isOwner, рендерит "+ Add" CTA
app/id/[id]/page.tsx                        # пробрасывает canEdit в LocationChildrenSection
app/id/[id]/_views/OfferPlaceView.tsx       # "Link this to a location" CTA для owner'а
```

---

## 4. Backend / data layer

### 4.1. `searchLinkCandidates`

```ts
type SearchArgs = {
  query: string;                                 // ≥2 символа, иначе пусто
  kinds: PlaceKind[];                            // что ищем
  excludePlaceId: string;                        // self
  excludeIds?: string[];                         // уже линкованные/pending
  limit?: number;                                // default 8
};
```

- ILIKE по `title` и `city`. Сортировка: own-первыми (created_by = me), потом по recency.
- RLS отдаст только public + own. Этого достаточно — приватные чужие карточки не должны быть линкуемы.
- Возвращает `PlaceListItem[]`.

### 4.2. `/add?parentId=<id>`

- В `createAndRedirect` после успешного INSERT — если есть `presetParentId`, вызываем `createLink({parentId, childId: newId})`.
- Если линк упал (parent удалён/RLS) — НЕ ломаем создание; показываем banner в редакторе или в логах. Карточка создана, link можно повторить вручную.
- `returnTo` для Cancel: если есть parentId, дефолт `/places/<parentId>/edit/links` вместо `/profile`.

---

## 5. UX-детали и edge-кейсы

- **Запрет линка на самого себя** (parent == child) — searchLinkCandidates исключает по `excludePlaceId`.
- **Дубль** — если link уже есть (active/pending/rejected), createLink упадёт по unique constraint. Ловим и показываем «Already linked» или «Pending — see below».
- **kind должен матчиться** — компонент сам ограничивает kinds; на бэке RLS дополнительно проверит.
- **Pending feedback** — после createLink, если status='pending', показываем тост «Request sent. The owner will be notified.».
- **Self-link для cross-owner experience-to-location, когда owner локации = я** — same-owner branch, link сразу active. Никаких approval.
- **Удалена parent-карточка между search и click** — ловим ошибку createLink, рефетчим список.

---

## 6. Чего не делаем (но запомнить на будущее)

- Notifications для parent owner'а о новых pending requests (сейчас они увидят их только при заходе на `/edit/links` или /profile badge).
- Drag-and-drop сортировка children.
- Bulk-link (несколько за раз).
- Расширение фильтров `/map` `/` на `or("kind.eq.X,secondary_kinds.cs.{X}")` — отдельная задача (Phase 3 из BECOME_PROVIDER_PLAN).
- Email/push при approve/reject — только UI-обновление.

---

## 7. Test plan

- Same-owner: создаю location, потом link через панель — active сразу. Проверить host-page рендерит секцию.
- Cross-owner: на чужой location линкую свой service — pending. Заходим под parent owner'ом на /edit/links — approval inbox, Approve → active.
- Create-new flow: на host-page нажимаю «Add experience here» → /edit/links → Create new experience → /add?kind=experience&parentId=… → save → редирект в edit карточки + link создан.
- Дубль: пытаюсь залинковать уже линкованную карточку — UI блокирует или показывает «Already linked».
- Self: своя карточка не появляется в результатах поиска.
