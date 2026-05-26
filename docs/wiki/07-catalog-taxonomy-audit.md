# Catalog Taxonomy Audit

Последнее обновление: 2026-05-26.

## Scope

Live Supabase catalog audit for `places` records. Цель: проверить `kind`, `categories`, `tags` и безопасно исправить очевидные дефекты таксономии.

Команды:

```bash
npm run catalog:taxonomy
npm run catalog:taxonomy:fix
npm run catalog:tags:fill
npm run catalog:tags:fill:apply
```

`catalog:taxonomy` работает в dry-run режиме. `catalog:taxonomy:fix` применяет только точные безопасные нормализации тегов.
`catalog:tags:fill` показывает предложенные теги для мест без тегов. `catalog:tags:fill:apply` записывает их в Supabase.

Важно: разрешенный список тегов берется из Supabase table `tags`. Все теги в `places.tags` должны быть значениями из этого списка.

## Snapshot

Initial snapshot:

- Visible places: 309.
- Kind split: 298 `location`, 8 `service`, 3 `experience`.
- Unknown kinds: 0.
- Category/kind mismatches: 0.
- Missing categories: 1.
- Missing tags: 121.

Главный вывод: категории технически чистые, но теги заполнены неравномерно. Каталог хорошо проходит проверку по `kind -> allowed categories`, но хуже работает как фильтруемый discovery-инструмент, потому что у большой части мест нет тегов.

## Applied Fixes

26 мая 2026 применен безопасный слой нормализации:

- `Сity` -> `City` (кириллическая `С` заменена на латинскую).
- `Speakesy` -> `Speakeasy`.
- `Icecream` -> `Ice Cream`.
- `Historical` -> `Historic`.
- `🍣 Sushi` -> `Sushi`.
- `👨‍🍳 Chef` -> `Chef`.

Затронуто:

- 18 visible place records.
- 3 rows in `tags`: `Сity`, `Speakesy`, `Icecream`.

После применения:

- Planned place tag fixes: 0.
- Planned tag table renames: 0.
- Category/kind mismatches: 0.

## Tag Fill Applied And Corrected

26 мая 2026 заполнены теги для всех 121 видимых мест, у которых tags были пустыми.

Подход:

- 2-5 тегов на место.
- Источники: title, description, categories.
- Для сервисов и неоднозначных мест добавлены ручные overrides.
- Перед записью использовался dry-run через `npm run catalog:tags:fill`.

После ревью заполненные теги были приведены к controlled list из `tags`. Значения вне списка были заменены на ближайшие существующие теги, например:

- `Hidden`, `Cozy`, `Vibe`, `Quiet` -> `Things to do`.
- `Beach`, `Springs`, `Paddle`, `Water Sports` -> `Waterfront`.
- `Wildlife` -> `Animals`.
- `Trail`, `Boardwalk` -> `Hike`.
- `Food`, `Deli`, `Greek`, `Uzbek`, `German`, `Latin` -> `Cuisine`.
- `Shop`, `Collectibles` -> `Market`.
- `Cocktails` -> `Speakeasy`.
- `Street Food` -> `Street food`.

## Category Fix Applied

`The Chimney House` было единственным видимым местом без categories. После проверки описания ему добавлены:

- `🍽 Food & Drinks`
- `🎭 Culture & History`
- `✨ Vibe & Atmosphere`
- `🤫 Hidden & Unique`

## Current Status

После повторной проверки:

- Missing categories: 0.
- Missing tags: 0.
- Category/kind mismatches: 0.
- Unknown kinds: 0.
- Planned place tag fixes: 0.
- Planned tag table renames: 0.
- Tags outside allowed list: 0.
- Tags outside allowed list (all places): 0.

## Previous Issues

### Missing Categories

До исправления одно видимое место было без категорий:

- `The Chimney House` (`location`) - также без тегов.

### Missing Tags

До исправления 121 видимое место было без тегов. Первые кандидаты из отчета:

- `Broken Shaker`
- `matheson hammock park`
- `The Wilder`
- `Regina's Farm`
- `Patio Bar & Pizza`
- `Hellas Restaurant & Bakery`
- `El Rincon Asturiano`
- `Tarpon Springs`
- `TATE'S Comics`
- `Old Heidelberg Restaurant`
- `Shucker’s (waterfront)`
- `Old Spanish Monastery`
- `Heritage`
- `Casablanca Cafe`
- `Southport Raw Bar & Restaurant`
- `My Mama's Books Records & Cafe`
- `Greynolds Park`
- `Marky's Gourmet`
- `The Chimney House`
- `Secret Woods Nature Center`

Для UX это было важнее, чем выглядело технически: теги используются как быстрые сигналы на карточках и как естественные фильтры для сценариев вроде “family”, “date night”, “remote work”, “hidden gems”.

## Recommendations

1. Ввести минимальный required set для новых мест: 1-3 категории и 2-5 тегов.
2. В админке подсвечивать места без тегов и без категорий отдельным saved view/filter.
3. Делать batch-fill тегов только из controlled list `tags`, с ручным review перед записью.
4. Не использовать `Hidden & Unique` как универсальный усилитель. Для каждого такого места должен быть конкретный тег, объясняющий hidden-сигнал: `Speakeasy`, `Garden`, `Historic`, `Rooftop`, `Waterfront`, `Vintage`, etc.
5. Для `service` и `experience` увеличить плотность тегов, иначе эти типы выглядят как пустые ответвления каталога.

## Source Of Truth

- Categories: `app/constants.ts`.
- Emoji lookup: `app/constants.ts`.
- Audit script: `scripts/catalog-taxonomy-audit.ts`.
- Missing tag fill script: `scripts/catalog-taxonomy-fill-tags.ts`.
- Supabase tables: `places`, `tags`.
