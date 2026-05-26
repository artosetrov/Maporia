# User Scenario Audit

Последнее обновление: 2026-05-26.

Этот документ фиксирует live-аудит `https://maporia.co` по ключевым сценариям использования Maporia. Аудит проводился в in-app browser на production site, с авторизованной сессией. Guest/paywall поведение может отличаться и требует отдельного smoke-теста.

## Сценарии

| Сценарий | Основные страницы | Главный вывод |
| --- | --- | --- |
| Турист во Флориде | `/`, `/map`, `/map?city=Miami`, `/map?q=beach`, `/id/[id]`, `/pricing` | Discovery уже сильный, но нужен guided trip-planning flow |
| Локальный житель | `/`, `/explore`, `/feed`, category/city filters | Нужна лента свежих nearby-рекомендаций, а не только каталог |
| Creator / местный эксперт | `/add`, `/profile`, `/pricing` | Добавление понятно, но creator value и метрики нужно усилить |
| Локальный бизнес / сервис | `/map?kinds=service`, service detail, `/pricing`, `/add` | Service detail сильный, но listing cards и lead flow слабые |
| Организатор experiences | `/map?kinds=experience`, experience detail, `/add` | Experience model есть, но не хватает inventory, availability и booking intent |
| Семья с детьми | `/map?q=kids`, `/map?q=children`, family-friendly place details | Search находит family places, но нет явного family-mode |
| Пара / date night | `/map?q=romantic`, `/map?categories=Vibe+%26+Atmosphere`, detail pages | Romantic search слишком узкий, vibe category слишком широкий |
| Удаленный работник | `/map?q=coffee`, `/map?q=coworking`, service/detail pages | Coffee работает, coworking не покрыт как job-to-be-done |
| Организатор группового выхода | `/map?kinds=service`, private chef/bathhouse service details | Хорошие service pages, но нет group request flow |
| Premium-curious hidden-gems hunter | hidden categories, Premium details, `/pricing` | Premium виден, но момент принятия решения можно усилить preview-ценностью |

## 1. Турист Во Флориде

Пример пользователя: новый турист впервые едет во Флориду и хочет быстро найти места, hidden gems и маршрут без долгого ручного ресерча.

Проверенные страницы:

- `/`
- `/map`
- `/map?city=Miami`
- `/map?q=beach`
- `/id/14103e63-2cfc-4094-a1da-b747af040d32`
- `/id/129f839e-2cde-4c28-98bf-c1e3b07445bd`
- `/pricing`

Что хорошо:

- Главная сразу объясняет позиционирование: Florida, local gems, places, experiences, services.
- Home sections помогают начать без пустого поиска: Recommended, Popular in Fort Lauderdale, Hidden Gems, Unusual Restaurants.
- `/map?city=Miami` дает понятный city-filtered результат: `76 places in Miami`.
- Query search работает через `/map?q=beach`; во время аудита `beach` вернул `70 places`.
- Detail page сильная: большие фото, адрес, описание, категории, Google Maps, comments, favorites, share.
- Premium places отмечаются в списке и на detail page.

Что сложно:

- Туристу не предлагается guided flow: куда едешь, на сколько дней, с кем, какой стиль поездки.
- Карточки в списке почти не объясняют, почему место стоит посетить именно этому пользователю.
- Premium-лейбл есть, но ценность Premium не раскрывается в момент discovery.
- Нет trip planner, day-by-day маршрута, distance clustering или `Save to trip`.

Как улучшить:

- Добавить entry `Plan my trip`: city -> days/dates -> company -> vibe -> generated route.
- На карточках показывать short reason-to-go: `hidden rooftop`, `good for sunset`, `local favorite`, `family-friendly`.
- Добавить `Save to trip`, `Add to day`, route map и grouped-by-area рекомендации.
- Для Premium показывать preview: например `3 hidden gems unlocked out of 12`.

## 2. Локальный Житель

Пример пользователя: живет во Флориде и ищет новые места на вечер, выходные или короткую прогулку.

Проверенные страницы:

- `/`
- `/explore`
- `/feed`
- `/map?city=Fort+Lauderdale&categories=Hidden+%26+Unique`

Что хорошо:

- Home already supports repeat discovery через `New this week`, `Recently viewed`, `Hidden Gems`.
- `/explore` содержит mood chips: Romantic, Quiet, Sunset, Coffee, Nature.
- `/feed` показывает живую активность: кто добавил place, favorite или comment.

Что сложно:

- `/feed` сейчас выглядит скорее как raw activity log, чем как полезная recommendation feed.
- Локальному пользователю не хватает `new near me`, `not touristy`, `open now`, `this weekend`.
- City/category filters могут выводить соседние города без объяснения радиуса. Например Fort Lauderdale + Hidden Gems показывал места из Miami, Hollywood, Davie и других nearby areas.
- Нет явного состояния `been there`, чтобы не показывать очевидные или уже посещенные места.

Как улучшить:

- Добавить режим `For locals`: fresh nearby, less touristy, open now, weekend-ready.
- Добавить состояния `Want to go` и `Been there`.
- Пересобрать `/feed` в curated local feed: `new near you`, `friends saved`, `popular this week`, `recently added by locals`.
- В city/category filters показывать radius explanation или nearby grouping.

## 3. Creator / Местный Эксперт

Пример пользователя: локальный эксперт, блогер или человек, который хочет публиковать подборки, места, маршруты и монетизировать знания.

Проверенные страницы:

- `/add`
- `/profile`
- `/pricing`

Что хорошо:

- `/add` очень понятно разделяет типы: Location, Service, Experience.
- Каждый тип объяснен через простой пример: rooftop bar, massage, food tour.
- `/pricing` ясно разделяет Premium, Pro Location, Pro Creator, Pro All-in.
- `/profile` показывает added places, favorites, subscription и edit profile.

Что сложно:

- Creator value не очень виден до `/add`: нет сильного promise про аудиторию, рост, подборки или маршруты.
- В профиле мало creator analytics: views, saves, contact clicks, leads, profile visits.
- Pricing говорит про публикацию, но не показывает, как creator будет получать отдачу.
- Нет явных templates для создания content package: guide, route, top list, weekend plan.

Как улучшить:

- Добавить creator dashboard: views, saves, clicks, leads, profile visits.
- Дать publishing templates: `Weekend guide`, `Top 10 hidden spots`, `Date night route`, `Florida with kids`.
- На `/add` добавить Google import как быстрый путь рядом с выбором типа.
- Сделать публичный creator profile как витрину подборок, expertise и published listings.

## 4. Локальный Бизнес / Сервис

Пример пользователя: владелец сервиса или малый бизнес, например массаж, фотограф, тренер, дизайнер, гид.

Проверенные страницы:

- `/map?kinds=service`
- `/id/94f43e62-2695-41b3-b4cf-7bbe06bb9f77`
- `/pricing`
- `/add`

Что хорошо:

- Service detail уже выглядит как marketplace page: фото, host, packages, prices, duration, hours, contact.
- `Facial massage` показывает service menu с 5 options, price и duration.
- Pricing понятен для provider: Pro Creator покрывает services + experiences.
- Есть CTA `Contact`.

Что сложно:

- Service cards в list view показывают в основном фото, name и city. Не хватает `from price`, duration, availability, service category.
- CTA `Contact` есть, но нет structured request form или lead tracking.
- Бизнесу не видно ROI: views, saves, contact clicks.
- Для пользователя неочевидно, что произойдет после нажатия `Contact`.

Как улучшить:

- На service cards добавить `from price`, `duration`, `available by request`, `contact`.
- Сделать lightweight lead form: name, date, message, contact method.
- В provider dashboard показывать views, saves, contact clicks и leads.
- Добавить filters: in-person/online, price range, available this week.

## 5. Организатор Experiences

Пример пользователя: организатор food tour, workshop, guided trip, music lesson, event или локального мероприятия.

Проверенные страницы:

- `/map?kinds=experience`
- `/id/db26a49e-3df6-4d83-9aeb-bae51a5340cd`
- `/add`

Что хорошо:

- Experience detail уже имеет правильную структуру: host, host location, packages, price, dates by request, contact.
- Есть связка experience -> host location, что добавляет доверие.
- `/add` объясняет Experience как event with schedule and duration.

Что сложно:

- Experiences inventory маленький: во время аудита было 3 experiences, поэтому marketplace выглядит пустым.
- Experience cards в list view не показывают date, price, format, host, duration.
- `By request` лучше, чем ничего, но для experiences пользователь ожидает availability или calendar.
- CTA слишком общий: `Contact` вместо `Request booking`, `Reserve`, `Ask host`.

Как улучшить:

- Добавить experience cards с `from price`, `duration`, `next available`, `host`.
- Сделать CTA `Request booking`.
- Добавить поля availability/calendar, group size, cancellation, meeting point.
- На home выделить секцию `Experiences this weekend`.

## 6. Семья С Детьми

Пример пользователя: родители во Флориде или туристы с детьми, которым нужно безопасно и быстро найти места для семейного дня.

Проверенные страницы:

- `/map?q=kids`
- `/map?q=children`
- family-friendly result detail pages from search results

Что хорошо:

- Search `kids` работает и во время аудита вернул `20 places`.
- В результатах были релевантные семейные варианты: `Childrens Gallery & Art Center`, `Showcase of Citrus`, `Cow Creek Farm`, `Busch Wildlife Sanctuary`, `McKee Botanical Garden`, `Palm Beach Zoo & Conservation Society`.
- Search `children` вернул более узкий список из `7 places`, включая libraries, parks и kid-oriented cultural places.
- Premium places тоже показываются внутри family search, что может стать хорошим Premium hook.

Что сложно:

- Нет отдельного family-mode или фильтра `Kid-friendly`.
- Не видно важной family-информации на карточках: возраст, indoor/outdoor, stroller-friendly, restroom, parking, rainy-day suitability.
- Search `kids` и `children` дают разные результаты, но пользователь не понимает, какой запрос лучше.
- Family planner не помогает собрать день по энергии ребенка: morning activity, lunch, nap-friendly stop, easy evening.

Как улучшить:

- Добавить фильтр `Kid-friendly` и быстрые chips: `toddlers`, `teens`, `rainy day`, `outdoor`, `free`, `animals`, `hands-on`.
- На карточках показывать family badges: `Ages 3+`, `Indoor`, `Free parking`, `Stroller ok`, `Restrooms`.
- Добавить guided flow `Plan a family day`.
- Нормализовать search synonyms: `kids`, `children`, `family`, `family-friendly` должны вести к близким результатам.

## 7. Пара / Date Night

Пример пользователя: пара ищет романтичный ужин, красивое место, прогулку на закате или необычный вечер.

Проверенные страницы:

- `/map?q=romantic`
- `/map?city=Fort+Lauderdale&categories=Vibe+%26+Atmosphere`
- romantic/vibe result detail pages

Что хорошо:

- `Vibe & Atmosphere` уже существует как категория и хорошо совпадает с date-night intent.
- Category flow дал широкий список: во время аудита `43 places in Fort Lauderdale`.
- В результатах есть места, которые подходят для свиданий: restaurants, bars, scenic places, hidden spots.

Что сложно:

- Search `romantic` во время аудита вернул только `2 places`, что для date-night сценария выглядит как пустой продукт.
- `Vibe & Atmosphere` слишком широкий: пользователь должен сам угадать, что подойдет для first date, anniversary, sunset, drinks или dinner.
- На карточках нет сигналов: `quiet`, `dressy`, `reservation recommended`, `sunset`, `good for talking`.
- Нет flow “построить вечер”: dinner -> walk -> dessert/drinks.

Как улучшить:

- Добавить date-night entry point: `Plan a date`.
- Сделать chips: `first date`, `anniversary`, `sunset`, `quiet`, `cocktails`, `dinner`, `walkable`.
- На карточках показывать vibe tags и practical cues: reservation, price level, noise, best time.
- Для Premium предложить `secret date spots` как отдельную ценность.

## 8. Удаленный Работник / Digital Nomad

Пример пользователя: человек ищет место поработать, встретиться с клиентом или провести пару часов с ноутбуком.

Проверенные страницы:

- `/map?q=coffee`
- `/map?q=coworking`
- `/id/d9eb1bb1-67a0-4d57-b6e1-2bdabbf27e54`

Что хорошо:

- Search `coffee` работает и во время аудита вернул `32 places`.
- В списке есть релевантные места: `Jade Tea House`, `Croissant Park Cafe`, `Ren Coffee`, `Ann's Florist and Coffee Bar`, `SEED N CUP`, `The Alchemist Cafe`.
- Service detail для `Designing AI products` показывает, что Maporia может покрывать профессиональные services, консультации и creative work.

Что сложно:

- Search `coworking` вернул `0 places`, хотя это естественный запрос для remote-worker пользователя.
- Coffee places не показывают laptop-friendly признаки: Wi-Fi, outlets, quiet, table space, long-stay ok, calls ok.
- Нет фильтра `work-friendly` или `meeting-friendly`.
- Профессиональные services и places живут рядом, но нет связки “найти место + найти специалиста”.

Как улучшить:

- Добавить remote-work category/tag layer: `work-friendly`, `Wi-Fi`, `outlets`, `quiet`, `good for calls`, `client meeting`.
- Нормализовать `coworking`, `work from cafe`, `laptop`, `Wi-Fi` в search.
- Сделать подборку `Work from here`.
- Для service pages добавить professional-intent CTA: `Book consultation` или `Request project intro`.

## 9. Организатор Группового Выхода

Пример пользователя: человек организует день рождения, corporate outing, dinner, spa day, private chef или небольшое событие для группы.

Проверенные страницы:

- `/map?kinds=service`
- `/id/cff0dffe-de0e-4440-bdd3-9f30326d38da`
- `/id/fddbf405-5816-4666-9634-c3aa8ba0cb9b`

Что хорошо:

- Service list показывает разные provider options: interior design, trainer, massage, AI/product design, paddles, chef, bathhouse.
- `Chef Alex Krestnikov` detail page хорошо подходит для group/event intent: `At your place`, `$120 / person`, `By request`, catering/events copy, phone, website, Instagram.
- `Bathhouse` service page показывает `$200 / person`, `At your place`, `By request`, host location.
- Service detail уже содержит enough trust content: photos, about, included tags, reviews, contact.

Что сложно:

- В list view не видно group-specific информации: minimum group size, price per person, event type, at-your-place vs host location.
- CTA остается общим `Contact`, хотя для группы нужен structured request.
- Нет сценария сравнения providers: chef vs bathhouse vs massage vs activity.
- Нет полей date, group size, budget, location, occasion.

Как улучшить:

- Добавить `Plan a group event` flow: occasion -> date -> group size -> budget -> location -> providers.
- На service cards показывать `from $/person`, `group size`, `format`, `by request`.
- Сделать request form: `date`, `number of guests`, `occasion`, `budget`, `message`.
- Добавить collections: `Birthday ideas`, `Corporate outings`, `Wellness day`, `Private dining`.

## 10. Premium-Curious Hidden-Gems Hunter

Пример пользователя: человек уже видит public results, замечает Premium labels и решает, стоит ли платить $35 за hidden locations.

Проверенные страницы:

- `/map?city=Fort+Lauderdale&categories=Hidden+%26+Unique`
- Premium-labeled place detail pages
- `/pricing`

Что хорошо:

- Premium labels появляются прямо внутри high-intent списков, например Hidden & Unique.
- `/pricing` ясно формулирует Premium: `$35 one-time`, lifetime access, hidden locations.
- Premium включен в Pro plans, что хорошо для creators/providers.

Что сложно:

- В списке нет объяснения, что именно скрыто за Premium и сколько ценности пользователь получит.
- Premium detail page в авторизованной premium-сессии выглядит почти как обычная place page, поэтому трудно оценить guest upsell.
- `/pricing` объясняет план, но не показывает examples of unlocked places или before/after.
- Нет bundle by intent: Premium for date spots, family hidden gems, scenic gems, weekend route.

Как улучшить:

- На locked cards показывать preview: blurred/partial title, city, category, why it matters.
- Добавить Premium landing block: examples of hidden places, categories unlocked, count by city.
- Продавать Premium через сценарии: `Unlock secret date spots`, `Unlock hidden family gems`, `Unlock scenic viewpoints`.
- Сделать guest smoke-test отдельно, чтобы проверить actual paywall copy and conversion path.

## Общие Наблюдения

Сильная база:

- Maporia уже не просто каталог, а multi-sided local marketplace.
- Есть три типа контента: location, service, experience.
- Home и details визуально сильные, особенно за счет фото.
- Pricing и add flow уже отражают продуктовую модель.

Главные UX-разрывы:

- Всем пользователям показывается похожий discovery/catalog experience, хотя их jobs-to-be-done разные.
- Для туриста не хватает trip planner.
- Для локала не хватает свежей nearby-ленты.
- Для creator не хватает dashboards и content templates.
- Для business/provider не хватает lead flow и ROI.
- Для experience organizer не хватает availability/booking intent.
- Для семьи не хватает family-mode и practical badges.
- Для date-night не хватает intent-specific search/category layer.
- Для remote worker не хватает work-friendly metadata.
- Для group planner не хватает structured request flow.
- Для Premium-curious пользователя не хватает preview ценности до оплаты.

Техническое наблюдение из браузерного аудита:

- Прямые URL filters работали (`?city=Miami`, `?q=beach`, `?q=kids`, `?q=coffee`, `?kinds=service`, `?kinds=experience`).
- Search gaps from persona audit: `coworking` вернул `0 places`, `romantic` вернул только `2 places`.
- Во время браузерного аудита клики по `Where?`, `Filters` и type tabs на `/map` не дали видимого изменения. Нужно проверить вручную и/или Playwright-smoke, потому что если это воспроизводится, discovery flow становится хрупким.
- Console показывала Google Maps warning о deprecated `google.maps.Marker`; этот риск уже отражен в operations docs как миграция на `AdvancedMarkerElement`.

## Product Direction

Maporia стоит развивать не как одну универсальную карту, а как набор сценарных входов:

- `Explore` для общего discovery.
- `Plan` для туристов и маршрутов.
- `Local` или `Nearby` для жителей.
- `Create` для creators.
- `Promote` для сервисов и бизнесов.
- `Book` или `Request` для experiences и paid services.
- `Family` для родителей и kid-friendly дней.
- `Date Night` для пар и вечерних маршрутов.
- `Work` для coffee/coworking/meeting-friendly discovery.
- `Groups` для birthdays, corporate outings и private events.

Самый сильный следующий продуктовый шаг: добавить guided flows поверх уже существующих страниц, не ломая текущий каталог.
