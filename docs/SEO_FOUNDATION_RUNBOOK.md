# SEO Foundation — runbook

Что сделано в коде (PR `seo-foundation`):

1. `app/sitemap.ts` — динамический sitemap. Включает 311 visible places + 3 статические страницы (/, /map, /pricing). Регенерация раз в час (`revalidate = 3600`).
2. `app/robots.ts` — `robots.txt` с allow на публичное, disallow на `/admin`, `/profile`, `/auth`, API. Указывает sitemap.
3. `app/lib/placeSeo.ts` — улучшен:
   - title теперь = `"Name, City"` (вместо `"Name"`) → +CTR в Google
   - description докручивает гео-хвост `"— [thing] in [City] on Maporia"` если описание не упоминает город
   - новая функция `buildPlaceJsonLd` → schema.org `TouristAttraction` / `LocalBusiness`
4. `app/id/[id]/layout.tsx` — рендерит `<script type="application/ld+json">` с разметкой Place, name, image, address, geo. Это даёт rich snippets в Google.

После деплоя нужно сделать руками. Без этих 3 шагов SEO foundation мёртвый.

## Шаг 1 — Verify `https://www.maporia.co` в Google Search Console

1. Открой [search.google.com/search-console](https://search.google.com/search-console).
2. **Add property** → URL prefix → `https://www.maporia.co`.
3. Метод верификации — **HTML tag**. Скопируй мета-тег вида `<meta name="google-site-verification" content="…"/>`.
4. Добавь его в `app/layout.tsx` в `metadata.verification.google`:
   ```ts
   verification: { google: "ТВОЙ_КОД" },
   ```
   Я сделаю PR с этим, когда пришлёшь код. Либо вставь сам — там одна строка.
5. Redeploy → нажми **Verify** в консоли.

Альтернатива (быстрее): **DNS TXT-запись** через Vercel DNS. Без редеплоя.

## Шаг 2 — Submit sitemap

В Search Console → **Sitemaps** → ввести `https://www.maporia.co/sitemap.xml` → **Submit**.

Через 1–7 дней увидишь:
- сколько URL обнаружено (~314)
- сколько проиндексировано
- ошибки парсинга (если есть)

## Шаг 3 — Smoke-проверки (5 минут после деплоя)

```
https://www.maporia.co/sitemap.xml      → должен отдавать XML с ~314 URL
https://www.maporia.co/robots.txt       → должен содержать `Sitemap: ...sitemap.xml`
https://www.maporia.co/id/<любой_uuid>  → view-source: должен содержать
                                          <script type="application/ld+json">
                                          и улучшенный <title>Name, City | Maporia</title>
```

Rich Results Test: [search.google.com/test/rich-results](https://search.google.com/test/rich-results) → вставь URL карточки → должен показать **TouristAttraction** (или **LocalBusiness** для service/experience).

## Шаг 4 — Bing Webmaster (бонус, 2 минуты)

Bing/DuckDuckGo дают ~2% мирового трафика, но в США чуть больше. Минимум усилий = max upside.

1. [bing.com/webmasters](https://www.bing.com/webmasters).
2. **Import from Google Search Console** — одна кнопка, забирает всё что добавил в GSC.

## Что ожидать (реалистично)

- **Неделя 1**: Google обнаружит sitemap, начнёт краулить. Indexed count = 0–50.
- **Неделя 2–4**: индекс растёт до 200–300 URL. Появятся первые impressions в GSC.
- **Месяц 2–3**: первые клики на long-tail запросы (`"hidden gems fort lauderdale"`, `"[название места]"`).
- **Месяц 3–6**: при стабильном добавлении новых карточек — 200–1000 органических сессий/мес. Не гарантия, но реалистичный потолок для 314 страниц в low-comp гео-нише.

Что ускоряет:
- Backlinks с релевантных доменов (Reddit, local Facebook groups, гео-блоги).
- Внутренние ссылки между местами одного города.
- City landing pages (`/cities/fort-lauderdale`) — следующий шаг, дам отдельный PR.

## Что НЕ делать

- ❌ Не отправлять indexer requests руками для каждой карточки — Google не любит.
- ❌ Не делать noindex на `/map` и `/` — это твои топ landing pages.
- ❌ Не покупать backlinks. SEO-penalty быстрее, чем рост.

## Следующий шаг (когда созреем)

City pages: `/cities/fort-lauderdale` (51 место), `/cities/miami` (37 мест), `/cities/west-palm-beach` (12). Это 25 потенциальных landing pages для запросов уровня `"things to do in fort lauderdale"`. Объём — ~1 рабочий день: route + generateMetadata + SSR-список карточек + JSON-LD `ItemList`. Скажи когда — сделаю.
