# Maporia — План доводки до launch-ready

Что осталось довести до того, чтобы реально нажать «open beta» с тарифами и тремя типами карточек. Цифры оценок — мой best-guess, не контракт; могу промахнуться в обе стороны на ±50%, если упрёмся в недокументированные особенности RLS / Stripe Connect.

Шкала сложности:
- **XS** — до 1 часа.
- **S** — 1–3 часа.
- **M** — пол-дня.
- **L** — день.
- **XL** — 2+ дня.

---

## TL;DR

3 трека. P0 закрывает риски монетизации (1.5–2 дня). P1 закрывает UX-дыры в создании service/experience (2–3 дня). P2 улучшения, которые можно делать после публичного запуска (1–2 дня).

**Минимум для запуска:** P0 целиком + P1.1 + P1.2 + P1.3. Это ~3.5 рабочих дня одним мной.

---

## P0 — без этого нельзя запускать

### P0.1 — Стрипо-настройка вручную (не в коде)

**Цель:** активировать чекаут.

**Шаги (в Stripe Dashboard, обе среды — test и production):**
1. Создать **Product**: "Maporia Premium". На нём один **Price**: `$35 USD one-time`. Скопировать `price_…` → env `STRIPE_PRICE_PREMIUM_ONETIME`.
2. Создать Product "Pro Service" → Price `$14.99/month recurring` → env `STRIPE_PRICE_CREATOR_SERVICE_MONTH`.
3. Создать Product "Pro Experience" → Price `$14.99/month recurring` → env `STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH`.
4. Создать Product "Pro All" → Price `$34.99/month recurring` → env `STRIPE_PRICE_CREATOR_ALL_MONTH`.
5. Создать Product "Extra Listing" → Price `$2.99 one-time` → env `STRIPE_PRICE_EXTRA_LISTING`.
6. **Webhooks → Add endpoint** `https://maporia.com/api/stripe/webhook`, события: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Скопировать `whsec_…` → env `STRIPE_WEBHOOK_SECRET`.
7. **Settings → Billing → Customer portal**: включить Cancel subscription, Switch plans, Update payment method.
8. **Settings → Tax**: если хочешь авто-VAT — включить Stripe Tax (опц., может подождать).
9. На Vercel залить все env переменные в Production и Preview.

**Сложность:** S (1.5–2 часа, плюс время на тест-чекаут).

**Зависимости:** ни от чего.

---

### P0.2 — Серверная защита квоты (anti-abuse) ✅ DONE

**Что сделано:** миграция `enforce_place_quota_trigger` — функция `enforce_place_quota()` SECURITY DEFINER + trigger BEFORE INSERT на places. Закрывает дыру независимо от точки entry (клиентский insert, прямой SQL, RPC) — не нужно отзывать INSERT-привилегию у `authenticated` и переписывать клиент.

**Логика триггера:**
- `created_by IS NULL` или профиль не найден → пропускаем (миграции/seed).
- `is_admin=true` → пропускаем.
- `kind='location'` + `plan='free'` → P0001 NO_PLAN. Любой платный план — ok.
- `kind='service'/'experience'`: считает текущий count, выбирает base_limit по плану (5 / 5 / 10 combined), складывает с `bonus_listing_credits`. Если выше — P0002 QUOTA_EXCEEDED. Если выбрана базовая квота, но кредиты покрывают — атомарно decrement бонусов (закрывает P0.3).

**Коды:** `P0001` = no plan, `P0002` = quota exceeded. Клиент в `/add` ловит их и показывает `PaywallModal` / `LimitReachedModal` (с актуальной перегруженной квотой).

**Smoke-тесты:** 11 сценариев прогнаны через DO-блок с откатом через `RAISE EXCEPTION 'TESTS_DONE'`. Все прошли (DO дошёл до финального exception, реальные данные не пострадали):
1. free + location → P0001
2. premium + location → ok
3. premium + service → P0001
4. creator_service + 5 services → ok
5. 6-я service без credits → P0002
6. +1 credit → 6-я service ok, decrement до 0
7. 7-я без credits → P0002
8. creator_service + experience → P0001
9. creator_all 6+4=10 mixed → ok
10. creator_all 11-я → P0002 (combined pool)
11. admin x15 services с free plan → ok (admin bypasses)

**Что НЕ сделано / отложено:**
- Отзыв `INSERT` privilege у `authenticated` на places. Trigger закрывает дыру и без этого; отзыв — paranoid level, можно сделать когда уберутся другие точки insert (Google import preview, например).
- TRIGGER реагирует только на NEW.created_by — если кто-то делает insert с `created_by=NULL` (от service role), trigger пропускает. Это намеренно — миграции и seed должны проходить.

---

### P0.3 — Decrement bonus_listing_credits ✅ DONE

**Что сделано:** реализовано внутри `enforce_place_quota()` (см. P0.2). Decrement происходит атомарно в той же транзакции, что и insert места. Если insert упадёт ниже на CHECK constraint — bonus credit откатится автоматически.

**Race condition** (между двумя одновременными инсертами с одним последним кредитом): функция использует `UPDATE ... WHERE bonus_listing_credits > 0` и проверяет `IF NOT FOUND` → RAISE P0002. Второй инсерт получит P0002 и клиент попросит обновить.

---

### P0.3-legacy — устаревший раздел (оставлен для истории)

**Цель:** $2.99 add-on реально расходуется. Сейчас он только зачисляется webhook'ом, но никогда не уменьшается, что превращает разовый платёж в pseudo-lifetime.

**Где:** часть P0.2 — атомарно внутри RPC. Если делаем P0.2, P0.3 закрывается само.

**Сложность:** XS (если делается в P0.2). Если откладываем P0.2 — S (нужен trigger BEFORE INSERT на places).

**Зависимости:** делать вместе с P0.2.

---

### P0.4 — Smoke-тест end-to-end

**Цель:** до публичного релиза прогнать всю воронку реальной картой Stripe в test mode.

**Сценарии (минимум):**
1. Free user → /pricing → купить Premium $35 → webhook → проверить `profiles.plan='premium_viewer', period='lifetime'`.
2. Free user → купить Pro Service → webhook → `plan='creator_service', period='month'`. Создать 5 services, попробовать 6-ю → должна показаться LimitReachedModal.
3. Pro Service user → купить +1 слот ($2.99) → `bonus_listing_credits = 1`. Создать 6-ю услугу → должна успешно создаться, кредит decrement до 0.
4. Pro Service user → /profile?section=premium → «Управлять / отменить» → Customer Portal → Cancel → дождаться `subscription.deleted` → план → `free`.
5. Pro All user → создать 5 services + 5 experiences → 11-я (любая) должна блокироваться (combined pool 10).

**Сложность:** S (2–3 часа на ручной прогон).

**Зависимости:** P0.1 + P0.2.

---

## P1 — UX-полнота для services/experiences

Без этого создатели публикуют пустые карточки без цены и расписания, и платный план чувствуется как обман.

### P1.1 — Edit-страница цены ✅ DONE

**Цель:** создатель задаёт `price_amount`, `price_currency`, `price_unit` из UI.

**Где:** новая страница `app/(auth)/places/[id]/edit/price/page.tsx`. Карточка «Цена» в хабе `app/(auth)/places/[id]/edit/page.tsx`.

**Шаги:**
1. Создать страницу с тремя полями: amount (number input с валидацией ≥ 0), currency (select USD/EUR/RUB/GBP — пока 4), unit (radio: fixed/from/per_hour/per_person/per_day/per_session).
2. Submit → `update places set price_amount, price_currency, price_unit where id=...`.
3. В хабе редактора добавить карточку «Цена» рядом с Title/Description, видимую только если `place.kind !== 'location'`. Показывать текущее значение или «Не задана».
4. Включить «Цена» в `requiredSteps`, если kind в (service, experience) — иначе нельзя published.

**Сложность:** S (2–3 часа).

---

### P1.2 — Edit-страница расписания ✅ DONE

**Цель:** создатель задаёт `schedule` (jsonb) и `duration_minutes` из UI.

**Где:** `app/(auth)/places/[id]/edit/schedule/page.tsx`.

**Шаги:**
1. Toggle: «Тип расписания» — Weekly / Specific dates / By request.
2. Weekly: чекбоксы дней + два time-инпута (from / to).
3. Specific dates: date picker, добавление/удаление дат.
4. By request: ничего больше.
5. Поле «Длительность» (number — минуты или часы+минуты). Применимо к experience особенно.
6. Submit → `update places set schedule = $1::jsonb, duration_minutes = $2`.
7. Карточка «Расписание» в хабе редактора (как P1.1).

**Сложность:** M (4–6 часов — больше из-за date picker и валидации).

**Зависимости:** независимо от P1.1.

---

### P1.3 — Empty-state на главной для пустых табов Services/Experiences ✅ DONE

**Цель:** когда юзер кликает Services и в БД 0 services — не показывать пустой экран, а «Скоро появятся + стань первым».

**Где:** `app/page.tsx` (после рендера sectionsToRender) и/или `HomeSection` (если все секции вернули 0).

**Шаги:**
1. Считать общий count карточек по `activeKind` одним запросом сверху (`select count from places where kind=$1 limit 1`).
2. Если 0 — рендерить полноширинную карточку `<EmptyKindState>` вместо секций. Текст: «В этом разделе пока пусто. Стань первым, кто опубликует [услугу/впечатление]» + CTA «Тарифы» (для не-creator) или «Создать» (для creator).
3. Если есть хоть одна карточка — рендерить секции, но мелким текстом сверху «Здесь {N} {kind}'ов».

**Сложность:** S (2 часа).

**Зависимости:** ни от чего.

---

### P1.4 — Замочек для скрытых services/experiences ✅ DONE

**Цель:** `LockedPlaceOverlay` сейчас работает только для location. Для скрытых service/experience нужен аналог с CTA на Premium.

**Где:** `app/components/LockedPlaceOverlay.tsx` + `app/id/[id]/_views/OfferPlaceView.tsx`.

**Шаги:**
1. В `OfferPlaceView` добавить проверку `isLocked` (по аналогии с легаси-страницей location).
2. Перед основным рендером: если `isLocked && !canUserViewPlace` → рендерить `LockedPlaceOverlay` с pseudo-title и cover (если разрешено).
3. Возможно нужен отдельный компонент `LockedOfferOverlay` если визуал должен отличаться — но я бы переиспользовал тот же.

**Сложность:** S (1–2 часа).

**Зависимости:** ни от чего.

---

### P1.5 — Карточки Price/Schedule в хабе редактора ✅ DONE

**Цель:** в `app/(auth)/places/[id]/edit/page.tsx` появляются ссылки-карточки на P1.1 и P1.2, видимые только для service/experience.

**Шаги:** аналогично существующим карточкам Title / Description / Categories. Условный рендер по `place.kind`.

**Сложность:** XS (30 минут).

**Зависимости:** P1.1 + P1.2.

---

## P2 — улучшения после launch

### P2.1 — Иконки/маркеры на карте по kind ✅ DONE

**Цель:** на `/map` визуально отличать локации/услуги/впечатления.

**Где:** `app/lib/mapMarkers.ts` (пины), `app/map/page.tsx` (select добавить kind, передать в маркер).

**Шаги:**
1. В select на /map добавить `kind`.
2. Расширить `createStaticPinSvg`/`createMarkerIcon` принимать `kind` и рисовать разный значок (📍 / 🛠 / ✨ внутри пина или разные цвета).
3. Опц.: разные цвета — service зелёный, experience жёлтый.

**Сложность:** S (2 часа).

---

### P2.2 — Фильтр по kind в FiltersModal ✅ DONE

**Цель:** в фильтрах на /map появляется чек-группа «Тип карточки» (3 чекбокса).

**Где:** `app/components/FiltersModal.tsx` + типы `ActiveFilters` + применение в `/map`.

**Шаги:**
1. Расширить `ActiveFilters.kinds: ('location'|'service'|'experience')[]`.
2. В UI — чек-группа в FiltersModal.
3. На /map применить фильтр в Supabase-запросе через `.in('kind', kinds)`.

**Сложность:** S (2–3 часа).

**Зависимости:** P2.1 (минимум изменений в select для kind).

---

### P2.3 — Аналитика когорт по подпискам ✅ DONE

**Цель:** простой view, чтобы видеть динамику MRR/churn.

**Где:** SQL view `subscriptions_kpi` в Supabase + страница `/admin/billing` для админа.

**Шаги:**
1. View: `select date_trunc('month', created_at) as month, plan, period, count(*), sum(case when status='cancelled' then 1 else 0 end) as churned from subscriptions group by 1,2,3`.
2. Страница в admin section с таблицей.

**Сложность:** M (полдня).

---

### P2.4 — Локализация EN ✅ DONE

**Цель:** биллинг на русском, остальное приложение на английском — рассогласовано. Переключить весь биллинг-UI на EN (Артём подтвердит, что приоритет EN над RU).

**Где:** `/pricing`, `PremiumSection`, `PaywallModal`, `LimitReachedModal`, `OfferPlaceView`.

**Шаги:** заменить русские строки на английские. i18n-системы в проекте сейчас нет, поэтому inline.

**Сложность:** S (1–2 часа).

---

## P3 — стратегические/большие, на отдельный квартал

### P3.1 — Onboarding после регистрации

«Я ищу места» / «Я создаю» → задаёт первый touchpoint и UTM. Без этого конверсия в платный план будет ниже на старте.

**Сложность:** L.

### P3.2 — Email-уведомления (past_due, успешная оплата, скоро renewal)

Stripe умеет сам, но кастомные триггеры повышают retention. Resend/Postmark через Supabase Functions.

**Сложность:** L.

### P3.3 — Альтернативный процессор для RU/KZT

Stripe в РФ не работает. Если основная аудитория русскоязычная — нужен ЮKassa или подобный. Это **отдельный большой блок**, ~неделя.

**Сложность:** XL.

### P3.4 — DSA / report flow для контента

Каталог пользовательских объявлений требует процедуру жалоб. Кнопка report у каждого place + админ-очередь.

**Сложность:** L.

---

## Граф зависимостей

```
P0.1 (Stripe Dashboard) ─────────────────┐
                                         ├──► P0.4 (smoke test)
P0.2 (RPC quota) ─── P0.3 (decrement) ──┘
                                ↓
                      освобождает P1.x

P1.1 (price page) ────┐
P1.2 (schedule page) ─┼──► P1.5 (карточки в хабе)
                       │
P1.3 (empty state) ────┘ (независимо)
P1.4 (locked offer) ─── (независимо)

P2.x — после P0+P1
P3.x — отдельный квартал
```

---

## Ручные шаги, которые я не могу сделать из IDE

Чтобы не спрятались в коде — повторяю:

1. **Stripe Dashboard**: 5 продуктов, 5 prices, 1 webhook endpoint, Customer Portal — настройка (см. P0.1).
2. **Vercel env**: 5 переменных Price ID + `STRIPE_WEBHOOK_SECRET`.
3. **Юридические**: обновить Terms of Service (Maporia как каталог, не сторона сделки), Privacy Policy (Stripe как processor). Это вне моей компетенции — попросить юриста или хотя бы взять шаблон tos-template типа Termly и адаптировать.

---

## Что я бы делал в следующем раунде

Минимум до запуска (~3.5 рабочих дня):

1. **P0.1** — настройка Stripe (это твоя часть, ~2 часа).
2. **P0.2 + P0.3** — серверная RPC + decrement (моя часть, ~5 часов).
3. **P0.4** — smoke-тест (вместе, ~3 часа).
4. **P1.1 + P1.2 + P1.5** — edit-страницы price/schedule + карточки в хабе (моя часть, ~8 часов).
5. **P1.3 + P1.4** — empty-state и locked overlay (моя часть, ~3 часа).

После этого P2 можно катать постепенно, по одной фиче в неделю.

P3 — отдельный квартал, обсуждать после первой когорты платных юзеров.

---

## Где документация

- `MONETIZATION_PLAN.md` — стратегия, тарифная сетка, какая модель и почему.
- `PLACE_KINDS_PLAN.md` — про три типа карточек, миграция, edit-флоу.
- `IMPLEMENTATION_PLAN.md` (этот) — что довести до launch-ready.
- `app/lib/plans.ts` — источник правды по тарифам и квотам.
- `app/lib/access.ts` — источник правды по правам.
