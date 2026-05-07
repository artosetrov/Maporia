# Airbnb Services & Experiences — Research для Maporia

Что я зафиксировал на airbnb.com (Fort Lauderdale контекст), и что предлагаю взять / адаптировать / отложить в Maporia.

⚠️ Это **анализ структуры данных и категоризации**, не призыв копировать дизайн 1-в-1 (на это у Airbnb есть IP/copyright).

---

## 1. Что у Airbnb на /services

### Search bar (3 поля)
- **Where** — destination
- **When** — dates
- **Type of service** — selectable category

### Каталог
- Сверху **карусель из 9 категорий** с большими preview-фото, emoji не используется (фото вместо иконки), под каждой — `«N available»`.
- Контент — **горизонтальные carousels по категориям**: «Photography», «Chefs», «Massage» и т.д. 6–7 карточек на ширину экрана.

### Карточка service
- Square cover photo
- Heart (favorite)
- Badge `Popular` (опционально)
- Title (1–2 строки)
- `From $X / guest` или `From $X / group`
- `Minimum $X to book` (опционально)
- ★ rating

### Detail page одного service
- Слева — cover photo + **avatar host'а внахлёст**
- Title (большой)
- Description (свободный текст; часто включает promo-код, сроки бронирования, политику)
- ★ rating + reviews count
- Quals host'а («Chef in South Florida Atlantic Coast»)
- «Provided at your home» — это **режим работы service** (host приходит к клиенту)
- **Справа — несколько offerings под одним host'ом** (BBQ, Pizza party, Vacation Meals, Catering) — каждое со своим прайсом и описанием. Это ключевая архитектурная деталь.
- Снизу — sticky CTA «Show dates»

### 9 базовых категорий services
Photography, Chefs, Massage, Prepared meals, Training, Makeup, Hair, Spa treatments, Catering.

---

## 2. Что у Airbnb на /experiences

### Search bar (3 поля)
- **Where** — city or landmark
- **When** — dates
- **Who** — number of guests (вместо «type» как у services)

### Каталог
- Большая секция «Popular experiences in [city]» — карточки крупнее, чем у services.
- Дальше скроллом — категории (Water sports, Tours, Cooking и т.д.).

### Карточка experience
- Rectangular cover (более широкая чем у service)
- Heart
- Badge `Popular`
- Title
- `From $X / guest`
- ★ rating

### Detail page одного experience
- **Photo mosaic** (4 крупных фото)
- Title
- Description (что вас ждёт + **важные warnings** типа «must know how to swim»)
- ★ rating + reviews count
- Location (`Lauderdale-by-the-Sea`)
- **Category chip** рядом с локацией (`Water sports`)
- Share / Heart
- Host: avatar + «Hosted by Jordan» + qualification line («PADI Elite Scuba Diving Instructor»)
- Mini-map с подписью района
- **Cancellation policy** карточка («Free cancellation · Up to 1 day before start time»)
- Sticky CTA `From $75 / guest` + `Show dates`

---

## 3. Что отличается между Services и Experiences

| | Services | Experiences |
|---|---|---|
| Search | Where + When + Type | Where + When + Guests |
| Группировка | По категориям (9 фикс) | Сначала Popular, потом категории |
| Карточка | Square + «Minimum to book» | Rectangular |
| Detail | Один host → много offerings | Одно событие, плоская структура |
| Host quals | «Chef in …» | «PADI Instructor» (профессиональное звание) |
| Cancellation | Не показывается на detail | Явно на detail |
| Location label | «Provided at your home» | Конкретное место |

Ключевое концептуальное различие:
- **Service = повторяющаяся услуга**, host выезжает или принимает у себя, прайс часто за гостя или группу с минимальной суммой.
- **Experience = разовое событие** с расписанием, фиксированной длительностью, локацией.

---

## 4. Какие данные из этого нам нужны в Maporia

Maporia сейчас имеет на `places`: title, description, address, lat/lng, cover, photo_urls, categories, tags, link, kind, price_amount, price_currency, price_unit, duration_minutes, schedule.

### MVP-добавления (S–M)

| Поле | Зачем | Применимость |
|---|---|---|
| `host_qualification text` | Строка под именем host'а на detail page («PADI Instructor», «Certified Massage Therapist»). У Airbnb это сильный trust-signal. | service + experience |
| `min_booking_amount numeric` | «Minimum $156 to book» — у services частая практика. | service (опц.) |
| `max_guests int` | Сколько гостей принимает за раз. На /experiences search есть Who. | experience (обяз.) + service (опц.) |
| `cancellation_policy text` | Free 1d / Free 7d / Strict / etc. Простой enum. | experience (обяз.) |
| `meeting_point text` | Точка встречи отдельно от lat/lng. | experience |
| `included_items text[]` | «What's included» — gear, snacks, drinks. | experience |
| `bring_items text[]` | «What to bring» — swimsuit, water shoes. | experience |
| `service_mode text` | `at_provider` / `at_client` / `online`. У Airbnb — «Provided at your home» / у клиента. | service |

### Архитектурно отложить в v2

- **Multiple offerings под одним service-host'ом** — это самое сложное, но и самое импактное. Реализация: новая таблица `place_offerings(place_id, title, description, price_amount, price_currency, price_unit, min_booking_amount)`. На detail-странице — список offerings с CTA «Contact» на каждом. Сейчас одна услуга = один place; для Pro All юзеру это значит «1 услуга × 5 разных пакетов = 5 листингов» что съедает квоту. Имеет смысл перейти к offerings, когда будет 50+ активных хостов.
- **Reviews/ratings** — у Airbnb они везде. Нужна таблица `reviews(place_id, user_id, rating, text)`. Можно начать с простого: 1–5 звёзд + текст. Это отдельный большой блок.
- **Booking inquiries** — встроенная форма «Contact host» с captcha и моделью anti-spam. Сейчас CTA ведёт на `place.link`, что ОК для каталога, но снижает конверсию.

---

## 5. Категории — как разделить

**Сейчас в Maporia** все три kind делят один общий список `categories` (с эмодзи в начале строки). Это работает для location, но для service/experience нужны разные таксономии.

### Предложение: kind-specific categories

Разделить `categories` на 3 списка в `app/constants` и связать с `kind` карточки.

**LOCATION_CATEGORIES** (текущие):
🍽 Food & Drinks · 🏛 Sights · 🌳 Nature · 🍷 Bars · ☕ Cafés · 🛍 Shopping · 🎭 Culture · 🤫 Hidden & Unique

**SERVICE_CATEGORIES** (по Airbnb):
📸 Photography · 👨‍🍳 Chefs · 💆 Massage · 🍱 Prepared meals · 💪 Training · 💄 Makeup · ✂️ Hair · 🧖 Spa · 🍽 Catering

**EXPERIENCE_CATEGORIES** (по Airbnb + Atlas Obscura):
🏊 Water sports · 🥾 Adventures · 🍳 Cooking · 🗺 Tours · 🎨 Workshops · 🧘 Wellness · 🎶 Music · 📷 Photography tours · 🦊 Wildlife · 🍷 Tastings

Реализация:
- `app/constants.ts` — три массива.
- В `/edit/categories` — выбор из массива по `place.kind`.
- В `FiltersModal` — категории показываются разные в зависимости от выбранного `kinds` фильтра.
- В БД — поле `categories text[]` остаётся, в нём просто разные значения по kind. Никакой миграции.

Это ~2 часа работы.

---

## 6. Главная — как Airbnb группирует контент

У Airbnb на /services и /experiences:
- На /services — **карусель категорий сверху** + **горизонтальные carousels по каждой категории** ниже.
- На /experiences — **«Popular in [city]»** сверху + категорийные carousels.

Для Maporia (когда будет N service/experience карточек > 20):
- На таб Services — добавить наверху карусель категорий (9 карточек с фото).
- В сетке — добавить секции типа «Photography in [city]», «Chefs in [city]» и т.д. через тот же `HomeSection` + `kindFilter`.
- На таб Experiences — секция «Popular» сверху, дальше — категорийные секции.

Чтобы не делать сейчас этот рефакторинг (карточек слишком мало), стоит **подготовить структуру `HOME_SECTIONS_BY_KIND`** в `app/constants/homeSections.ts` — три массива секций под каждый kind.

---

## 7. Конкретный план интеграции (приоритеты)

### Quick wins (1–2 раунда работы)

1. **Разделить категории по kind** (~2 ч). Самое заметное и дешёвое улучшение. Юзер при создании service увидит правильный список (Photography / Chefs / etc.), не перепутает с location.
2. **Добавить host_qualification + service_mode в OfferPlaceView** (~2 ч). Под именем host'а — строка квалификации. Простая текстовая колонка в places.
3. **Карусель категорий сверху на табах Services/Experiences** на главной (~3 ч). Та же `<Pill>`-логика что у kind-табов, только следующим уровнем.
4. **Empty state в каждой категории** — если в категории 0 карточек, не рендерить пустую секцию.

### Средняя сложность (отдельные раунды)

5. **`max_guests`, `meeting_point`, `cancellation_policy`** для experience — миграция БД + `/edit/details` страница + render в OfferPlaceView (~6 ч).
6. **`included_items[]` и `bring_items[]`** — две array-text колонки, простой UI (~3 ч).
7. **Расширить FiltersModal** под kind-specific фильтры: для service — service_mode (at home / at provider / online); для experience — guest count slider, cancellation strict/flexible (~4 ч).

### Большие, на отдельный квартал

8. **Multiple offerings под одним host'ом** — отдельная таблица, переработка карточки и detail-page. Делать когда у нас будет ≥30 активных host'ов и они начнут жаловаться на лимит листингов.
9. **Reviews / ratings** — таблица + UI + анти-спам модерация. Делать после первых 100 транзакций (даже если каталог).
10. **Booking inquiries** — встроенная форма contact host. Делать когда конверсия по `place.link` упадёт ниже 2%.

---

## 8. Что НЕ копировать у Airbnb

- **Гарантированный возврат / страховка** — Airbnb это AirCover. Мы каталог, deals идут снаружи, страховка не наша зона.
- **«Vetted Local Professionals»** marketing — у нас нет верификации хостов в MVP. Не пиши такое в копи, иначе подставишься юридически.
- **Рейтинги** — рекламировать «★ 4.88» когда ты только запустился = false advertising. Заводить только когда соберётся 5+ реальных отзывов на карточку.
- **«Free cancellation»** — это бизнес-полиси Airbnb-as-broker. У нас deals напрямую, отмена — между клиентом и host'ом. Можно ввести **рекомендованную** политику для host'а, но мы её не enforce'им.

---

## 9. Что я предлагаю взять следующим раундом

Если хочешь самое заметное улучшение — **kind-specific categories** (пункт 1). Это:
- Решает текущую путаницу (юзер при создании service видит «🌳 Nature» — нерелевантно).
- 2 часа работы, чистая миграция UI без БД-изменений.
- Открывает дорогу к kind-specific фильтрам в FiltersModal.

Если приоритет — выглядеть «как Airbnb» — пункт 3 **(карусель категорий сверху таба)** добавляет визуально много структуры на главной.

Скажи, что брать — или возьму оба сразу.
