# BECOME_PROVIDER_PLAN.md — «Стать провайдером» в шапке + новый flow создания

Дата: 2026-05-07. Скоуп: вынести воронку создания карточки в шапку (как у Airbnb «Become a host»), добавить мульти-выбор kind'ов, превью и авто-подбор тарифа.

Прототип: `prototypes/become-provider/index.html` — кликабельный, на токенах из `app/globals.css`.

## Решения (которые ты подтвердил)

- **Точка входа:** ссылка «Стать провайдером» в `TopBar` рядом с поиском/иконкой меню. Видна **всем**, включая анонимов. Айрбнб-логика — максимальный реач воронки.
- **Мульти-выбор kind'ов:** в модалке чекбоксы. Одна карточка может одновременно быть локацией + сервисом + впечатлением.
- **Pricing-гейт:** **после** заполнения формы и превью, не до. Воронка: модалка → форма → превью → pricing → publish.
- **Auto-suggest тарифа** по выбранным kind'ам (1:1 с логикой `suggestPlanForKind` в `app/lib/plans.ts`):
  - Только Location → Premium $35 разово
  - Только Service → Pro Service $14.99/мес
  - Только Experience → Pro Experience $14.99/мес
  - Service + Experience (с/без Location) → Pro All-in $34.99/мес

## Открытые решения (нужны от Артёма перед стартом)

### 1. Как хранить мульти-kind в БД? — **критично, блокирует всё**

Сейчас `places.kind` — одно значение (`location | service | experience`). Кодовая база сильно завязана на это: `kind-router` на `/id/[id]/page.tsx`, фильтр `/map`, edit-страницы, RLS, индексы, триггер `enforce_place_quota`.

Варианты:

**A. `kinds text[]` вместо `kind text`** — мульти-значение как массив.
- ✅ Чистая модель, одна сущность = одна карточка.
- ⚠️ Брейкинг: каждое `eq('kind', x)` → `contains('kinds', [x])`. Все компоненты, view'ы, RLS, триггеры — переписать.
- ⚠️ Триггер квоты `enforce_place_quota` нужно переписать (считает по kind).
- 🔧 ~1 день миграция + рефактор.

**B. Hybrid: оставить `kind` как primary, добавить `secondary_kinds text[]`**
- ✅ Backward compatible. Existing queries работают. `kind-router` на `/id/[id]` рендерит view по primary.
- ✅ Pricing-логика берёт union(`{kind}` + `secondary_kinds`).
- ⚠️ Семантика «primary vs secondary» искусственная. Юзер выбрал «локация + сервис» — кто из них primary? (Логика: если есть `service` → primary=service, иначе если `experience` → experience, иначе location.)
- 🔧 ~3-4 часа миграция + точечные правки.

**C. Multi-place: создаём N связанных places**
- ✅ Без миграции схемы.
- ⚠️ Одна «бизнес-сущность» = 3 карточки в каталоге. UX правки сложен (3 формы вместо одной). Pricing считает N карточек = N квотных слотов сразу.
- 🔧 ~1.5 дня UI + linking-таблица `place_groups`.

**D. Master + sub-listings (Airbnb-style)** — отдельная таблица `place_offerings` для service/experience, привязанных к master `place` с `kind=location`.
- ✅ Самая чистая модель.
- ❌ Огромный рефакторинг. Не для этого спринта.

**Моя рекомендация:** **B (hybrid)**. Минимальный риск, обратная совместимость, можно мигрировать в (A) позже если понадобится. Pricing просто считает union.

### 2. Где жить новый wizard?

Сейчас `/add` — однополевая страница выбора kind, потом сразу редирект на `/places/[id]/edit/...` (хаб с разделами). Превью карточки в системе нет.

Варианты:

**A. Заменить `/add` целиком** — туда же открываем модалку. Если выбран один kind — старая логика (создаём draft, редирект). Если несколько — новый wizard.

**B. Новый маршрут `/become-provider`** — отдельный wizard, `/add` оставить как fallback.

**C. Модалка как UI-роут** (`PremiumModalProvider`-style глобальный state) — wizard живёт в модалке/sheet, никуда не редиректит. После публикации просто закрывается и редиректит на `/profile`.

**Моя рекомендация:** **C** для начального flow (модалка → форма-как-sheet → превью), **A** как fallback для деeplink'ов с `?kind=` и для людей, пришедших по старой ссылке.

### 3. Превью: новый view или симуляция в карточке листинга?

Превью карточки в каталоге — это `PlaceCard.tsx`. На превью нужен ровно тот же рендер, чтобы юзер увидел финальный вид.

- Используем существующий `<PlaceCard>` с feed-data из state формы (без записи в БД).
- Альтернатива: рендер карточки места (`/id/[id]`) в iframe — но это требует уже сохранённую запись.

**Рекомендация:** `<PlaceCard>` с временным объектом из формы. Никакой записи в БД до финальной публикации.

### 4. Что делать с `is_hidden=true` черновиками?

Сейчас `/add` создаёт пустой draft с `is_hidden=true` сразу при выборе kind. С новым flow draft создаётся только в момент публикации (после оплаты). Это значит:

- ✅ Меньше мусорных draft'ов в БД.
- ⚠️ Если юзер закрыл вкладку на форме — потерял всё. Решение: `localStorage` персист.

## Фазы реализации

Делаем не за раз, а по шагам. Каждая фаза независимо ship-able.

### Phase 1 — Header link + единый entry-point (~3 часа)

- В `TopBar.tsx` добавить ссылку «Стать провайдером» (desktop: между поиском и avatar; mobile: пункт в hamburger выше «Add Gem»).
- При клике открывать **глобальную модалку** (новый компонент `BecomeProviderModal` через `PremiumModalProvider` pattern).
- Модалка: 3 карточки с **чекбоксами**, мульти-выбор. Кнопка «Далее» считает выбранные.
- Если юзер не залогинен — на «Далее» открыть `AuthModal` (с redirect-обратно), затем продолжить.
- В этой фазе после клика «Далее» **редирект на старую `/add?kind=…`** с первым выбранным kind. Полная воронка ниже.

✅ После Phase 1: новый CTA доступен всем, валидируем интерес. Уже даёт прирост.

### Phase 2 — Миграция БД (hybrid) (~3-4 часа)

- Решение по варианту хранения (см. открытое решение 1) — **рекомендую B (hybrid)**.
- Миграция `add_secondary_kinds_to_places`:
  ```sql
  alter table public.places
    add column secondary_kinds text[] not null default '{}';

  -- Опциональный CHECK: secondary не пересекается с primary
  alter table public.places
    add constraint places_secondary_kinds_no_primary
    check (not (kind = any(secondary_kinds)));
  ```
- Расширить `Place` type, `Database['public']['Tables']['places']` — Row/Insert/Update.
- Обновить `enforce_place_quota` trigger: считать по union (`kind` + `unnest(secondary_kinds)`).
- Update `app/lib/access.ts`: `canUserCreate(access, kinds)` принимает массив, проверяет права на каждый.

### Phase 3 — Wizard (форма + превью) (~1-2 дня)

- Новый компонент `BecomeProviderWizard.tsx` (полноэкранный sheet).
- Шаги:
  1. Combined form — секции по выбранным kinds (location → адрес/город/категория, service → цена/единица/длительность, experience → цена/расписание/длительность). Базовые поля (название/описание/обложка) — всегда.
  2. Превью — `<PlaceCard>` рендерится с временным объектом из state. Кнопка «Опубликовать».
- `localStorage` персист state (ключ `become-provider-wizard-state`).
- Используем уже существующие input-стили из дизайн-системы.

### Phase 4 — Pricing screen + публикация (~half day)

- После «Опубликовать» — экран тарифа с авто-подобранным планом (логика из прототипа).
- Кнопка «Оплатить и опубликовать»:
  1. Открывает Stripe Checkout (`/api/stripe/checkout`) с `{plan: suggestedPlan}`.
  2. После успеха в webhook — INSERT в `places` со всеми полями + `is_hidden=false`.
  3. Редирект на `/places/[id]` (newly published).
- Если у юзера уже есть активный достаточный план — пропускаем Stripe, сразу INSERT и redirect.

### Phase 5 — Polish (~half day)

- Аналитика: events `become_provider_clicked`, `kind_selected` (с массивом), `wizard_step_completed`, `published`.
- Edit-режим: если юзер хочет добавить второй kind к существующей карточке — кнопка «Добавить тип» на `/places/[id]/edit` хабе.
- Mobile responsive проверка (sheet вместо модалки на телефоне, как в прототипе — `items-end sm:items-center`).
- A11y: фокус-trap в модалке, escape-key, aria-labels.

## Что НЕ реализуем в этом скоупе (намеренно)

- **Драфты в `is_hidden=true`** — отказываемся, переходим на «не сохранять до оплаты». Существующие draft'ы юзеров не трогаем.
- **Edit мульти-kind карточек после публикации** — добавление новых kinds к существующей карточке — Phase 5, отдельная итерация. Сейчас можно только удалить/создать заново.
- **Master + sub-listings (Airbnb-style)** — рассматривать когда понадобится более сложная иерархия.
- **3D-картинки на карточках kind'ов** (как у Airbnb) — оставляем существующие эмодзи 📍 🛠 ✨, иначе это копия Airbnb.

## Риски

- **Триггер `enforce_place_quota`**: после миграции (B) триггер должен считать по union. Существующие 292 карточки `kind=location` без `secondary_kinds` остаются валидными. Тестим smoke-сценарии: free → P0001, premium-only без service → P0001 на service, creator_all с 10 листингами → P0002.
- **Нет gating на абуз**: юзер может выбрать «локация + сервис» только чтобы получить сервис-страницу с location-полями, не платя за Pro Service. Решение: pricing-логика считает MAX-цену по выбранным kind'ам (а не AND-цены), чтобы один Pro Service покрывал и location.
- **Анонимный пользователь в воронке**: сохраняем state в `localStorage` ДО логина, после логина продолжаем wizard. Если localStorage заблокирован (privacy mode) — fallback на «сначала логин, потом форма».
- **`/add` legacy**: deeplink'и из существующих мест (например, кнопка «Add Gem» в hamburger) ведут на `/add` — оставляем работать как раньше, но показываем баннер «New: создавай мульти-карточки через "Стать провайдером"».

## Файлы (предполагаемо изменятся)

### Новые
- `app/components/BecomeProviderModal.tsx` — модалка-точка-входа.
- `app/components/BecomeProviderWizard.tsx` — sheet с формой и превью (Phase 3+).
- `app/components/BecomeProviderPricing.tsx` — экран тарифа с авто-подбором (Phase 4).
- `app/contexts/BecomeProviderContext.tsx` — глобальный state (selected kinds, form data, current step).
- `app/lib/secondary_kinds.ts` — утилита для union-логики (`getAllKinds(place): PlaceKind[]`).

### Правятся
- `app/components/TopBar.tsx` — новая ссылка.
- `app/layout.tsx` — добавить `<BecomeProviderProvider>` в дерево.
- `app/lib/plans.ts` — `suggestPlanForKinds(kinds: PlaceKind[]): PaidPlan` (мульти-версия).
- `app/lib/access.ts` — `canUserCreate(access, kinds: PlaceKind[])`.
- `app/types.ts` + `app/types/supabase.ts` — `Place.secondary_kinds`.
- `app/(auth)/add/page.tsx` — баннер про новый flow + поддержка `?kind=` остаётся.
- Миграция `add_secondary_kinds_to_places`.
- Триггер `enforce_place_quota_v2` (или alter существующий).

## Статус реализации

### ✅ Phase 1 — Header + Modal (DONE 2026-05-07)
- `app/components/BecomeProviderModal.tsx` — новый компонент, мульти-выбор через чекбоксы, Esc/click-outside, body-scroll lock, persist выбора в `localStorage` для auth-redirect.
- `app/components/TopBar.tsx` — ссылка «Become a provider» в desktop-шапке (видна всем); пункт «Become a provider» в hamburger-меню для всех, у кого нет «Add Gem» (анон / standard).
- Auth-flow: на «Continue» проверяем сессию через `supabase.auth.getSession()`. Если анон — закрываем модалку, открываем `AuthModal` с `redirectPath=/add?kinds=…`. После логина юзер вернётся в /add, который заберёт kinds из URL.
- Редирект на `/add?kinds=service,location` (CSV).

### ✅ Phase 2 — Миграция БД + типы + lib (DONE 2026-05-07)

**Миграция `add_secondary_kinds_to_places`:**
- Колонка `secondary_kinds text[] NOT NULL DEFAULT '{}'` (все 292 существующих ряда — пустые массивы, ничего не сломалось).
- CHECK `places_secondary_kinds_no_primary` — secondary не дублирует primary `kind`.
- CHECK `places_secondary_kinds_valid` — только {location, service, experience}.
- GIN-индекс `places_secondary_kinds_gin` для будущих `ANY()` фильтров.
- Триггер `enforce_place_quota()` переписан под union(kind, secondary_kinds):
  - Plan-check для каждого kind в union отдельно.
  - Quota count считает места, "содержащие" kind через primary ИЛИ secondary.
  - Combined-pool у Pro All: `COUNT(DISTINCT places)`, чтобы карточка с service+experience считалась как 1 слот, а не 2.
- **17 smoke-тестов прогнаны** через DO-блок с rollback (создаём временного auth.user → profile → INSERT'ы → искусственный exception).

**Типы:**
- `app/types.ts` → `Place.secondary_kinds?: PlaceKind[] | null` (опционально для legacy).
- `app/types/supabase.ts` → `Database['public']['Tables']['places']` Row/Insert/Update — добавлено `secondary_kinds`.

**Lib:**
- `app/lib/access.ts` → новая `canUserCreateMulti(access, kinds[])` — проверяет права на КАЖДЫЙ kind. `canUserCreate` (single) сохранён.
- `app/lib/plans.ts` → новая `suggestPlanForKinds(kinds[])` — auto-suggest минимально достаточного плана для набора kind'ов:
  - service+experience → `creator_all` ($34.99/мес)
  - service (с/без location) → `creator_service` ($14.99/мес)
  - experience (с/без location) → `creator_experience` ($14.99/мес)
  - только location → `premium_viewer` ($35 разово)

**`/add/page.tsx`:**
- Парсит `?kinds=service,location` (новый CSV) с приоритетом над legacy `?kind=service`.
- `splitPrimaryAndSecondary(kinds)`: priority `service > experience > location` для выбора primary `kind`. Это означает, что мульти-формат «локация + сервис» получит primary=service → отрисуется через `OfferPlaceView` (с ценой), а не через legacy location-view.
- `createAndRedirect(kinds[])` — мульти-версия. Использует `canUserCreateMulti`, `checkQuota` для каждого service/experience в выборе. INSERT с `secondary_kinds`.
- Quota-counts через `or("kind.eq.X,secondary_kinds.cs.{X}")` — 1:1 с триггером.

**Проверки:**
- `npx tsc --noEmit --skipLibCheck` — чисто.
- `npx eslint` на правленых файлах — 0 errors. 10 warnings pre-existing (не мои), документированы выше.
- 17 smoke-тестов БД прошли с rollback — никаких побочных эффектов в prod.

### Готово к ship'у Phase 1+2

Что уже работает после деплоя:
1. Юзер кликает «Become a provider» в шапке.
2. Видит модалку с тремя карточками с чекбоксами, выбирает любой набор.
3. На «Continue» — если анон → AuthModal, после логина вернётся в /add?kinds=…
4. /add создаёт черновик с правильным `kind` + `secondary_kinds`.
5. Редактор (`/places/[id]/edit`) видит черновик через тот же RLS — ничего не сломано.
6. Триггер квоты считает мульти-kind места корректно.

### 🟡 Phase 3 — Wizard с превью (не реализовано)

Сейчас flow заканчивается в существующем хабе редактирования (`/places/[id]/edit/...`) — то же что было до. Превью карточки и pricing-suggest пока не интегрированы. План остаётся как описан выше — следующая сессия.

### 🟡 Phase 4-5 — Pricing + Polish (не реализовано)

См. план выше.

## Известные ограничения текущего скоупа

- **Фильтры на /map, главной, HomeSection, CategoryCarousel** ещё не учитывают `secondary_kinds`. Карточка с `kind=service, secondary_kinds=['location']` появится в списках services (по primary), но не в списках locations. Если это критично — добавить `or("kind.eq.X,secondary_kinds.cs.{X}")` в эти query (Phase 3+).
- **Edit-страницы** (`/places/[id]/edit/...`) пока не показывают и не позволяют менять `secondary_kinds`. Чтобы добавить kind к существующей карточке, юзер должен пересоздать. Phase 5.
- **PaywallModal** на /add берёт single `kind` для подсказки тарифа. При мульти-выборе показывается тариф по primary, что близко к правде, но не точно — реальный auto-suggest будет в Phase 4 на pricing-экране.
