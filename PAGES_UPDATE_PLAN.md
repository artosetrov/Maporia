# Maporia — план обновления страниц

На основе `AIRBNB_RESEARCH.md`. Цель: довести каталог и detail-страницы service/experience до уровня, на котором их не стыдно показывать первым host'ам и первым покупателям. Для location ничего не ломаем — там UX и так зрелый.

⚠️ Это план **структуры данных и UI**, не дизайн-копия. Сроки — мой best-guess; могут уплыть на ±50% на местах с RLS / auto-layout.

---

## TL;DR

Три волны:

1. **Sprint 1 (1.5–2 дня)** — закрывает самую заметную UX-дыру. Раздельные категории для location/service/experience, host info на detail-страницах service/experience, базовые фильтры по типу карточки. Без миграций БД (только ENV-таксономия и одна-две колонки).

2. **Sprint 2 (2–3 дня)** — experience становится «как Airbnb». Поля `max_guests / meeting_point / cancellation / included_items / bring_items`, edit-страница «Details», секция «Что вас ждёт» / «Что взять с собой» на странице.

3. **Sprint 3 (Q2-задача)** — multiple offerings под одним service-host'ом и booking inquiries. Это уже не цвет интерфейса, это новая бизнес-модель.

После Sprint 1 + 2 платформа выглядит цельно. Sprint 3 — когда есть ≥30 платных host'ов и реальные сделки.

---

## Sprint 1 — Quick wins

### S1.1 — Разделить категории по kind ✅ DONE

**Проблема:** при создании service в `/edit/categories` юзер видит «🌳 Nature» и «🍷 Bars» — нерелевантно. Один общий список путает.

**Что делаем:**
- В `app/constants.ts` добавить три массива:
  - `LOCATION_CATEGORIES` — текущий список (рестораны, виды, парки, бары).
  - `SERVICE_CATEGORIES` — Photography, Chefs, Massage, Prepared meals, Training, Makeup, Hair, Spa, Catering. ~9 штук, из Airbnb-сетки.
  - `EXPERIENCE_CATEGORIES` — Water sports, Adventures, Cooking, Tours, Workshops, Wellness, Music, Photography tours, Wildlife, Tastings. ~10.
- Добавить функцию `getCategoriesByKind(kind)` → один из трёх массивов.
- В `/places/[id]/edit/categories` — выбирать массив по `place.kind`.
- В `FiltersModal` — категории показывать в зависимости от выбранного `kinds[]`. Если `kinds` пуст или содержит >1 типа — показывать union с дедупликацией.

**БД:** изменений нет. Колонка `categories text[]` в places просто хранит разные значения для разных kind. Существующие 292 location'а не трогаем.

**Размер:** S (2–3 ч).

**Риски:** старые места с категориями типа «🍽 Food & Drinks» останутся в БД с этими значениями даже если они теперь в другом списке. Норм для location — список ровно тот же. Для service/experience сейчас 0–1 запись, можно вручную поправить.

---

### S1.2 — Host info на detail-странице service/experience ✅ DONE

**Проблема:** в Airbnb под каждым service/experience видно «Hosted by Jordan · PADI Elite Scuba Diving Instructor». Это сильный trust-signal, у нас сейчас вообще нет блока про автора карточки.

**Что делаем:**
- Миграция БД: `places.host_qualification text` (короткая строка, ~80 chars).
- Edit-страница `/places/[id]/edit/host` — два поля: автозаполненное `host_name` (читается из profiles.display_name создателя) + ручное `host_qualification` (например, «PADI Instructor», «Certified Massage Therapist»).
- В `OfferPlaceView` добавить блок «Hosted by» под title: avatar + display_name + qualification line. Avatar тянем из `profiles` по `created_by`.
- В hub редактора добавить карточку «Host info» — только для service / experience.

**БД:** одна колонка text. Миграция 30 секунд.

**Размер:** M (3–4 ч).

**Риски:** не ставить в карточке текст «Vetted Professional» — у нас нет верификации. Просто host_qualification как самодекларация.

---

### S1.3 — Service mode ✅ DONE

**Проблема:** Airbnb-services пишут «Provided at your home» / «Provided at host's location». Это критично для chef, massage, photographer — сразу понятно, кто к кому едет.

**Что делаем:**
- Миграция БД: `places.service_mode text CHECK IN ('at_provider','at_client','online','flexible')` (NULLABLE).
- Edit-страница `/places/[id]/edit/host` — добавить radio (4 варианта).
- В `OfferPlaceView` показать chip рядом с локацией: «At your place» / «At provider's place» / «Online» / «Flexible».

**БД:** одна колонка с CHECK.

**Размер:** S (2 ч). Можно объединить с S1.2 в одну страницу `/edit/host`.

---

### S1.4 — Карусель категорий сверху таба

**Проблема:** на главной с табом Services/Experiences — сразу секции по городам. Сложно «перепрыгнуть» в нужную категорию (фотограф / повар / тур).

**Что делаем:**
- Над сетками `HomeSection` добавить горизонтальную карусель категорий с фото-превью + label + count (`«57 available»`).
- Только когда `activeKind !== 'location'`.
- Клик по категории → редирект на `/map?kind=service&categories=Photography` (фильтр уже работает).
- Source: первое фото последней published карточки в этой категории, либо стоковая SVG.

**БД:** изменений нет, count считается RPC `get_category_counts(p_kind)` или клиентским count-запросом.

**Размер:** M (4 ч — карусель + RPC + интеграция).

---

### S1.5 — Empty state на пустых категориях

**Проблема:** если категория пустая, она пропадает / выглядит broken.

**Что делаем:**
- В `HomeSection` если result === 0 не рендерить секцию вообще (уже работает для location). Для service/experience добавить такую же защиту.
- В карусели категорий пустые с count=0 либо не показывать, либо показывать с CTA «Be the first».

**Размер:** S (1 ч).

---

## Sprint 2 — Experience как у Airbnb

### S2.1 — Поля для experience: max_guests, meeting_point, cancellation_policy ✅ DONE

**Проблема:** experience без размера группы и точки встречи — не работает. Покупатель не понимает, на какое количество людей и куда идти.

**Что делаем (миграция):**
```sql
ALTER TABLE places
  ADD COLUMN max_guests integer CHECK (max_guests IS NULL OR max_guests > 0),
  ADD COLUMN min_guests integer CHECK (min_guests IS NULL OR min_guests >= 0),
  ADD COLUMN meeting_point text,
  ADD COLUMN cancellation_policy text CHECK (cancellation_policy IS NULL OR cancellation_policy IN
    ('flexible','moderate','strict','non_refundable','custom'));
```

**UI:**
- Новая страница `/places/[id]/edit/details` — все поля выше.
- В хаб-редактор — карточка «Details» (рядом с Price/Schedule), видимая только для experience.
- В `OfferPlaceView` под секцией «What to expect» добавить блок «Logistics»: max_guests («Up to 8 guests»), meeting_point text, cancellation chip с понятным labeled («Free up to 24h»).

**Размер:** M (полдня).

---

### S2.2 — included_items / bring_items для experience ✅ DONE

**Проблема:** Airbnb experience всегда показывает «What's included: Snorkel gear, Water» и «What to bring: Swimsuit, Towel». Без этого покупатель боится «я не знаю что брать».

**Миграция:**
```sql
ALTER TABLE places
  ADD COLUMN included_items text[] DEFAULT '{}',
  ADD COLUMN bring_items text[] DEFAULT '{}';
```

**UI:**
- В странице `/edit/details` (S2.1) — две группы chip-input'ов: добавляешь строки, удаляешь крестиком.
- В `OfferPlaceView` под «Schedule» — две колонки: «What's included» / «What to bring» с галочкой/иконкой.

**Размер:** S (2–3 ч).

---

### S2.3 — Photo mosaic в OfferPlaceView ✅ DONE

**Проблема:** Airbnb experience имеет mosaic 4 фото на hero. У нас — одна обложка.

**Что делаем:**
- На desktop в hero показать mosaic 1 + 2×2 (как Airbnb): main фото слева, 4 миниатюры справа.
- На mobile оставить single cover (это уже работает).
- Photos подгружать из `place_photos` (таблица уже есть, на странице editor работает).

**Размер:** M (3 ч — layout + lightbox).

---

### S2.4 — Aggregate rating в hero ✅ DONE

**Проблема:** мы только что сделали `<ReviewsSection>`, и aggregate `★ 4.88 · 388 reviews` есть только внутри секции, а у Airbnb он в hero под title.

**Что делаем:**
- В `OfferPlaceView` после title вывести `★ N.NN · M reviews` как у Airbnb. Под одним flex-row с city/category chip.
- Тянуть через RPC `get_place_rating(place_id)` при загрузке страницы (уже создан в миграции).
- Показывать только если `count > 0`, чтобы не было «★ 0.00 · 0 reviews» на новых.

**Размер:** S (1 ч).

---

## Sprint 3 — Большое (Q2)

### S3.1 — Multiple offerings под одним service-host'ом

**Зачем:** Airbnb-chef Jeremiah имеет 4 offerings (BBQ / Pizza / Vacation Meals / Catering). У нас один такой chef = 4 листинга = тратит 4 слота квоты Pro Service. Это душит сетап в продакшене.

**Что менять:**
- Новая таблица:
```sql
CREATE TABLE place_offerings (
  id uuid PRIMARY KEY,
  place_id uuid REFERENCES places(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_url text,
  price_amount numeric(10,2),
  price_currency text,
  price_unit text,
  min_booking_amount numeric(10,2),
  duration_minutes integer,
  sort integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```
- Карточка `place` становится «host card» (chef Jeremiah). Offerings — варианты у этого host'а.
- На detail-странице справа — список offerings (как у Airbnb).
- В edit — новая секция «Offerings» с CRUD.
- Квота: один place = один слот, offerings внутри безлимит (или 10 на place).

**Размер:** L (1.5–2 дня). Затрагивает БД, Edit-флоу, OfferPlaceView, страницу карточки в листингах.

**Запускать когда:** ≥30 активных Pro-аккаунтов и ≥3 жалобы «не хватает слотов на разные пакеты».

---

### S3.2 — Booking inquiries (внутренний контакт)

**Зачем:** сейчас CTA «Contact / Book» на OfferPlaceView ведёт на `place.link` (внешний URL). Это размывает воронку — мы не видим конверсию, host теряет лидов на пути.

**Что менять:**
- Новая таблица `inquiries(id, place_id, sender_user_id, message, contact_email, contact_phone, status, created_at)`.
- Кнопка «Contact host» открывает inline-форму (email + телефон + сообщение). После submit — запись в БД + email уведомление host'у через Resend.
- Anti-spam: rate limit по IP, hCaptcha на анонимные.
- В `/profile` для host'ов — секция Inquiries со списком входящих.

**Размер:** XL (2 дня + Resend setup).

**Запускать когда:** есть N=20 host'ов и они говорят «не понимаю, кто кликал».

---

### S3.3 — Photo gallery с lightbox для service

**Зачем:** services сейчас показывают одну обложку. Photographer / chef хотят показать портфолио.

**Размер:** S (2–3 ч). Скорее всего сделаю в Sprint 2 вместе с experience mosaic.

---

## Что трогает каждую страницу (matrix)

| Страница | Sprint 1 | Sprint 2 | Sprint 3 |
| --- | --- | --- | --- |
| `/` Home — Locations tab | — | — | — |
| `/` Home — Services tab | категории-карусель сверху + раздельные категории в фильтрах | — | — |
| `/` Home — Experiences tab | категории-карусель | — | — |
| `/id/[id]` Location | — | — | — |
| `/id/[id]` Service (OfferPlaceView) | host info, service_mode chip | photo mosaic | offerings list, inquiries form |
| `/id/[id]` Experience (OfferPlaceView) | host info | max_guests, meeting_point, cancellation, included/bring items, photo mosaic, aggregate rating в hero | inquiries form |
| `/places/[id]/edit` (hub) | карточка Host info для service/experience | карточка Details для experience | карточка Offerings для service |
| `/places/[id]/edit/categories` | kind-specific список | — | — |
| `/places/[id]/edit/host` (новая) | name + qualification + service_mode | — | — |
| `/places/[id]/edit/details` (новая) | — | guests/meeting/cancellation/included/bring | — |
| `/places/[id]/edit/offerings` (новая) | — | — | CRUD |
| `/map` | — | — | — |
| `FiltersModal` | категории по kind | — | — |

`/map` не меняется в этих спринтах — фильтры по kind и иконки уже сделаны раньше.

---

## Bird's-eye порядок (что предлагаю брать)

Если делать по очереди и хочется максимум impact / время:

1. **S1.1** (раздельные категории) — самая заметная разница для тех, кто создаёт service/experience.
2. **S1.2 + S1.3** (host info + service_mode) — минимум БД, максимум trust.
3. **S2.4** (aggregate rating в hero) — мы уже сделали reviews, это дочерчивает.
4. **S2.1 + S2.2** (experience details) — закрывает блок experience-специфики.
5. **S1.4** (карусель категорий) — UX-конфетка после того, как контент есть.
6. **S2.3** (photo mosaic) — выглядит круто, но не блокирует.

S3 — отдельный квартал, обсуждать после первых host'ов.

---

## Что я бы сделал прямо сейчас

Минимальный pull request, который заметно меняет ощущение продукта:

**Sprint 1.1 + 1.2 + 1.3 одной коммитсериeй** (~5–6 часов):
- Разделить категории по kind.
- Добавить host_qualification + service_mode в БД.
- Создать `/places/[id]/edit/host` страницу.
- Подключить host info в `OfferPlaceView`.
- Добавить карточку «Host info» в edit-хаб для service/experience.

После этого продакшен service / experience выглядит как: фото → title → host name + quals + service_mode → цена / длительность / расписание → описание → что включено (из текущих categories/tags) → карта → reviews. Это уже похоже на Airbnb.

Скажи — брать этот пакет, или другой раздел сначала.
