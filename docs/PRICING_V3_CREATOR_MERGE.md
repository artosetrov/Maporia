# PRICING V3 — Pro Creator merge + Pro All-in repricing

> **Решение зафиксировано 2026-05-11**: объединяем `creator_service` и `creator_experience` в единый `creator_pro` (display: «Pro Creator») и одновременно снижаем `creator_all` с $34.99 до $19.99. Без этого второго шага пакет становится математически невыгодным ($24.98 за две части vs $34.99 за пакет).
>
> Документ написан по образцу `docs/PRICING_V2_PLAN.md`. Каждая Φ-фаза должна закрываться отдельным коммитом.

---

## 0. Цели и не-цели

**Цели:**
1. Убрать визуальную дублирующуюся пару Pro Service / Pro Experience → одна карточка «Pro Creator $14.99/мес».
2. Восстановить sense-making у Pro All-in: цена ниже суммы частей.
3. Не сломать активных подписчиков на старых планах (grandfather-стратегия).

**Не-цели:**
- Менять Premium ($35 one-time) или Pro Location ($9.99/мес).
- Трогать `place_links`, `secondary_kinds`, `enforce_place_quota` инвариант secondary_location.
- Менять цены Add-on ($2.99 extra listing).
- Менять схему `subscriptions` (только CHECK constraint и backfill).

---

## 1. Тарифная сетка v3

| Plan ID | Display | Monthly | Yearly (-20%) | Quota | Status |
|---|---|---|---|---|---|
| `free` | Free | $0 | — | — | unchanged |
| `premium_viewer` | Premium | $35 one-time | — | view_hidden | unchanged |
| `creator_location` | Pro Location | $9.99 | $95.88 ($7.99/mo) | 5 locations | unchanged |
| **`creator_pro`** | **Pro Creator** | **$14.99** | **$143.88 ($11.99/mo)** | **5 combined (service ∪ experience) + secondary_location free** | **NEW** |
| `creator_all` | Pro All-in | **~~$34.99~~ $19.99** | **~~$335.88~~ $191.88 ($15.99/mo)** | 10 combined (location ∪ service ∪ experience) | repriced |
| `creator_service` | Pro Service *(legacy)* | $14.99 | $143.88 | 5 services + secondary_location free | grandfathered |
| `creator_experience` | Pro Experience *(legacy)* | $14.99 | $143.88 | 5 experiences + secondary_location free | grandfathered |
| `premium_grandfathered` | — | — | — | unlimited locations | unchanged |

**Why repricing All-in:** при $14.99 + $9.99 = $24.98 пакет $34.99 теряет смысл. $19.99 даёт ~20% экономии от суммы частей и сохраняет 3-tier psychology (cheap/mid/premium).

**Что показывается на /pricing (PUBLIC_PLANS):** `premium_viewer`, `creator_location`, `creator_pro`, `creator_all`. Четыре карточки вместо пяти.

---

## 2. Mapping: `kinds[]` → suggestedPlan

```
[location]                            → creator_location
[service]                             → creator_pro      (раньше creator_service)
[experience]                          → creator_pro      (раньше creator_experience)
[service, experience]                 → creator_pro      (раньше creator_all)
[location, service]                   → creator_all
[location, experience]                → creator_all
[location, service, experience]       → creator_all
```

Обновить в `app/lib/pricing/quota.ts` → `suggestPlanForKinds`.

---

## 3. Инвариант квоты (критично)

**Pro Creator** — combined-pool из service+experience, 5 слотов:
- Можно опубликовать 5 service, 0 experience.
- Можно опубликовать 0 service, 5 experience.
- Можно 2 service + 3 experience.
- Secondary location бесплатна для каждой такой карточки (как сейчас).
- Primary location создавать **нельзя** (need creator_all).

**Pro All-in** — combined-pool всех 3 kinds, 10 слотов (без изменений).

**Расширение `PlanQuota`:**

```ts
// app/lib/pricing/types.ts (или registry.ts)
type PlanQuota =
  | { location: number | null }
  | { service: number | null }
  | { experience: number | null }
  | { combined: number | null; combinedKinds: readonly Kind[] }; // NEW
```

`creator_all` мигрирует на `{ combined: 10, combinedKinds: ['location','service','experience'] }`.
`creator_pro` стартует с `{ combined: 5, combinedKinds: ['service','experience'] }`.
`creator_service`/`creator_experience` — оставляем как есть (для grandfathered).

**SQL `enforce_place_quota()`** получает новую ветку:

```sql
WHEN plan = 'creator_pro' AND NEW.kind IN ('service','experience') THEN
  -- считать union(kind, secondary_kinds) пересечённый с {service,experience}
  -- limit = 5
WHEN plan = 'creator_pro' AND NEW.kind = 'location' THEN
  -- only secondary_kinds-эффект: если это primary location → REJECT
  -- secondary location → OK (через существующую логику secondary_location)
```

---

## 4. DB-миграция

**Migration name:** `pricing_v3_creator_pro_merge`

```sql
-- 1. Расширить CHECK constraint
ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN (
    'free','premium_viewer','premium_grandfathered',
    'creator_location','creator_service','creator_experience','creator_all',
    'creator_pro'  -- NEW
  ));

ALTER TABLE profiles DROP CONSTRAINT profiles_plan_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN (
    'free','premium_viewer','premium_grandfathered',
    'creator_location','creator_service','creator_experience','creator_all',
    'creator_pro'
  ));

-- 2. Обновить enforce_place_quota() — добавить ветку для creator_pro
CREATE OR REPLACE FUNCTION enforce_place_quota() RETURNS trigger AS $$
  ... -- см. §3
$$;

-- 3. Smoke-тесты в DO-блоке (по образцу v2):
--    - creator_pro может опубликовать 5 service-карточек, 6-я REJECT
--    - creator_pro может опубликовать 3 service + 2 experience, 6-я REJECT
--    - creator_pro НЕ может опубликовать primary location → REJECT
--    - creator_pro может опубликовать secondary location (kind=service, secondary_kinds=[location])
--    - legacy creator_service всё ещё работает по старому инварианту
```

**Backfill: НЕТ.** Старые подписчики `creator_service`/`creator_experience` остаются на своих планах (grandfather). UPDATE их в `creator_pro` мы **не делаем** — это решение Артёма от 2026-05-11.

**Pre-check для оценки blast radius:**

```sql
SELECT plan, COUNT(*) FROM subscriptions
WHERE status = 'active' AND plan IN ('creator_service','creator_experience','creator_all')
GROUP BY plan;
```

---

## 5. Stripe конфигурация

### 5.1. Pro Creator — новые Price IDs

ENV-имена (по конвенции v2):
- `STRIPE_PRICE_CREATOR_PRO_MONTH`
- `STRIPE_PRICE_CREATOR_PRO_YEAR`

`scripts/stripe/provision-prices.ts` идёт по registry → автоматически создаст новые Product+Price (idempotent через `metadata.maporia_plan=creator_pro`). Запуск:

```bash
npx tsx scripts/stripe/provision-prices.ts --dry
npx tsx scripts/stripe/provision-prices.ts
```

### 5.2. Pro All-in — переход с $34.99 на $19.99

⚠️ **Открытый вопрос Q1**: Stripe Prices immutable — нельзя поменять цену существующего price_id. Варианты:

**A. Создать новые price IDs `STRIPE_PRICE_CREATOR_ALL_MONTH/YEAR` (v2 → v3)** и переключить env-переменные:
- Pro: чисто, новые подписчики идут на $19.99 сразу.
- Con: активные подписчики на $34.99 остаются на нём до cancel. На renewal Stripe возьмёт $34.99 (тот же price_id), а в нашем UI они увидят $19.99 — диссонанс.
- Fix: миграционный скрипт `scripts/stripe/migrate-all-in-subscriptions.ts` — пройти по всем active subscriptions с старым price_id и сделать `stripe.subscriptions.update(id, { items: [{ id: ..., price: NEW_ID }], proration_behavior: 'none' })`. Не списываем dif, новая цена возьмёт эффект со следующего billing cycle.

**B. Переименовать ENV-переменные в registry, **оставить старые цены** для grandfather-юзеров** через `creator_all_legacy` фейк-план:
- Слишком много кода.
- Не рекомендую.

**C. Не трогать активные, новые на $19.99:**
- Через split price_id в registry: `creator_all` имеет два mapping — старый $34.99 (только для resolve) и новый $19.99 (для checkout). Грязно.

**Рекомендую A.** Migration script — один проход, без потери ARR (т.к. до сих пор test mode и реальных $34.99-подписчиков скорее всего 0–1).

### 5.3. Webhook

`resolvePlanByPriceId()` сам подхватит новые price IDs из registry. Ничего менять не надо.

Старые `STRIPE_PRICE_CREATOR_SERVICE_*` и `STRIPE_PRICE_CREATOR_EXPERIENCE_*` env-переменные **оставляем** — иначе webhook на renewal grandfathered подписчика не сможет резолвить план.

---

## 6. Код-changes по файлам

### 6.1. `app/lib/pricing/registry.ts`

- Расширить `PlanId` union: `+ 'creator_pro'`.
- Расширить `PlanQuota` поддержкой `combinedKinds`.
- Добавить `creator_pro` PlanSpec.
- Изменить `creator_all.prices.USD.month.amount` → `19.99`, `.year.amount` → `191.88` (или $15.99/mo × 12).
- Изменить `creator_all.prices.USD.month.stripeIdEnv` на новый ENV-имя (если идём по варианту A § 5.2).
- Пометить `creator_service` и `creator_experience` флагом `display.legacy: true` (новое поле).
- `PUBLIC_PLANS`: убрать `creator_service` и `creator_experience` из массива.
- `CREATOR_PLAN_IDS`: оставить все четыре (нужно для quota/webhook).

### 6.2. `app/lib/pricing/quota.ts`

- `computeQuota`: добавить branch для `creator_pro` через `combinedKinds`.
- Унифицировать ветку `creator_all` через `combinedKinds` (поведение не меняется).
- `suggestPlanForKinds`: обновить под §2.
- `planCoversKind`: для `creator_pro` true только для `service`/`experience` (+ secondary_location).

### 6.3. `app/lib/pricing/features.ts`

- Новая строка `STRINGS.en.create_combined_creator`: `(n) => `Up to ${n} services or experiences (any mix)``.
- `getFeatures(creator_pro)` → `["Premium access included", "Up to 5 services or experiences (any mix)", "Add a map point to your listing", "Add extra listings for $2.99"]`.
- `getFeatures(creator_all)` → формулировка остаётся «10 listings combined (any type)».

### 6.4. `app/lib/pricing/format.ts`

- Без изменений. `priceDisplay(creator_all, ...)` автоматически отрисует $19.99.

### 6.5. `app/pricing/page.tsx`

- Карточек становится 4. Grid: `sm:grid-cols-2 lg:grid-cols-4` (вместо 5).
- Порядок: Premium → Pro Location → Pro Creator → Pro All-in (highlighted).
- `planTier` → актуализировать (`creator_pro` между `creator_location` и `creator_all`, tier ≈ 3).
- `decideCtaLabel` — без логических изменений, planTier подхватит.

### 6.6. `app/(auth)/profile/page.tsx` — PremiumSection

- Аналогично /pricing: 4 карточки вместо 5.
- **Особый случай grandfathered:** если `subscription.plan IN ('creator_service','creator_experience')` — рендерить **дополнительную** карточку «Your legacy plan» сверху с пометкой «Pro Service (legacy)» / «Pro Experience (legacy)» и кнопкой «Switch to Pro Creator» (downgrade без потери прав т.к. та же цена) или «Keep current plan» (no-op).
- `decideProfileCta` для grandfathered → новая ветка `isLegacy && target === 'creator_pro'` → label «Switch».

### 6.7. `app/components/BecomeProviderModal.tsx`

- `planCoversKind` уже обновлён в §6.2.
- Suggested-hint автоматически возьмёт `creator_pro` из обновлённого `suggestPlanForKinds`.
- Проверить вручную копи: «Suggested plan: Pro Creator from $14.99/mo.»

### 6.8. `app/lib/plans.ts` (legacy, `@deprecated`)

- Если ещё не удалён к Φ7 v2 cleanup — добавить stub для `creator_pro` для совместимости `PaidPlan` union, иначе не скомпилится.
- Желательно удалить весь файл в этой же фазе (cleanup долга v2).

---

## 7. Migration of existing users

### 7.1. Активные `creator_service` / `creator_experience`

- **Стратегия: grandfather.** Подписка остаётся на текущем price_id и в БД. UI на /profile/billing показывает «(legacy)» бейдж и предлагает переход на Pro Creator (та же цена, больше прав по факту).
- Никаких автоматических UPDATE.
- При естественном churn / cancel + resubscribe — попадают на Pro Creator.

### 7.2. Активные `creator_all` на $34.99

- ⚠️ Это open question Q1 в §5.2. Рекомендую миграционный Stripe-скрипт + почтовое уведомление «Good news — Pro All-in is now $19.99/mo».
- На уровне БД ничего не меняется (plan='creator_all' остаётся), price_id обновляется через Stripe API.

### 7.3. Pre-check скрипт

```sql
-- сколько потенциально затронутых
SELECT plan, period, COUNT(*) AS cnt, SUM(...)
FROM subscriptions WHERE status='active'
  AND plan IN ('creator_service','creator_experience','creator_all')
GROUP BY plan, period;
```

Запустить через Supabase MCP **до** Φ1.

---

## 8. Фазы реализации

| Φ | Что | Где | Откат |
|---|---|---|---|
| Φ0 | Pre-check: SQL count активных legacy-подписок | Supabase MCP | n/a |
| Φ1 | `registry.ts`: добавить `creator_pro`, пометить legacy, перевести `creator_all` на новые ENV/amount | TS | revert commit |
| Φ2 | `quota.ts`: combinedKinds, suggestPlanForKinds | TS | revert commit |
| Φ3 | `features.ts` + копи | TS | revert commit |
| Φ4 | DB migration `pricing_v3_creator_pro_merge` (CHECK extend, enforce_place_quota обновление, 5+ smoke-tests) | SQL | rollback SQL миграцией |
| Φ5 | Stripe provisioning (`provision-prices.ts` запустить, скопировать ENV в Vercel) | CLI | удалить новые Price в Stripe |
| Φ6 | `/pricing` page → 4 карточки | TSX | revert commit |
| Φ7 | `/profile/billing` → 4 карточки + legacy-карточка | TSX | revert commit |
| Φ8 | `BecomeProviderModal` smoke-проверка копи | TSX | revert commit |
| Φ9 | Stripe migrate-all-in-subscriptions.ts (если есть кандидаты из Φ0) + почта | TS+CLI | оставить старый price (no-op) |
| Φ10 | E2E: новый user → /pricing → checkout `creator_pro` → webhook → БД row → /profile показывает «Pro Creator» | manual | n/a |
| Φ11 | Cleanup: удалить `app/lib/plans.ts` если ещё жив; обновить `docs/PRICING_V2_PLAN.md` ссылкой на этот документ | TS+MD | revert commit |

---

## 9. Rollback

Любая Φ откатывается reverse-commit'ом. Критично: после Φ4 (DB migration) откат CHECK constraint **только если 0 row с `plan='creator_pro'`**, иначе сначала UPDATE их обратно в `creator_service` (или удалить).

Webhook остаётся обратно совместимым: ENV-переменные старых планов не удаляются.

---

## 10. Open questions

- **Q1:** Pro All-in migration — что делать с активными $34.99-подписчиками на момент релиза? Ответ зависит от Φ0 count. См. §5.2 / §7.2.
- **Q2:** `creator_pro` PlanId — окей с этим неймингом? Альтернативы: `creator_combo`, `creator_offer`. PlanId влияет на URL params в `/api/stripe/checkout` и читается в логах — желателен явный нейминг.
- **Q3:** Yearly Pro All-in — нужен ли отдельный `Save 20%` бейдж на /pricing или сохранение текущего toggle достаточно? (Думаю достаточно.)
- **Q4:** Legacy-карточка на /profile/billing — обязательная фича или nice-to-have для Φ7? Без неё grandfathered-юзер увидит просто «Your plan: Pro Service (legacy)» в шапке и 4 карточки апсейлов снизу — это уже норм для MVP.
- **Q5:** Уведомление о репрайсе All-in — почта или баннер в UI? Mailgun/Resend есть в стэке (см. `maporia_smtp.md`).

---

## 11. Definition of Done

- [ ] /pricing рендерит 4 карточки. Pro Creator показывает $14.99/$11.99 и квоту «Up to 5 services or experiences».
- [ ] /profile/billing рендерит 4 карточки + legacy-info если applicable.
- [ ] Stripe checkout `creator_pro` создаёт subscription, webhook пишет row с plan='creator_pro'.
- [ ] enforce_place_quota блокирует 6-ю service-карточку для creator_pro юзера.
- [ ] enforce_place_quota разрешает secondary location для creator_pro юзера.
- [ ] Существующий creator_service test-юзер (если есть) видит «(legacy)» и может опубликовать столько же сколько раньше.
- [ ] `npx tsc --noEmit` чисто.
- [ ] Smoke-тесты в SQL DO-блоке пройдены 5/5+.

---

## 12. As-built journal

> Заполняется по мере прохождения фаз — формат как в `PRICING_V2_PLAN.md` §9.1.

_(empty — план только что зафиксирован)_
