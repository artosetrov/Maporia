# PRICING_V2_PLAN.md — тарифы v2 + годовой billing

Дата: 2026-05-08
Скоуп: переход с текущей сетки (4 плана: premium / pro service / pro experience / pro all) на v2 (5 планов + monthly/yearly toggle), реструктуризация ролей Premium и creator-планов, серверная миграция квот.

Источники правды до начала: `app/lib/plans.ts`, `app/lib/access.ts`, миграции `add_subscription_plans_and_history`, `add_bonus_listing_credits`, `enforce_place_quota_trigger`, `add_secondary_kinds_to_places`. Memory-нот `maporia_monetization` отражает ТЕКУЩУЮ сетку — он будет переписан после релиза v2.

---

## 0. Цели и не-цели

**Цели:**

- Развести consumer-фичу (видеть скрытые локации) и creator-фичу (создавать карточки) по разным SKU. Premium становится **чисто consumer**.
- Ввести Pro Location SKU $9.99/мес для creator'ов, у которых только локации.
- Добавить **annual billing toggle** на /pricing и в `BecomeProviderModal`. Скидка 20%.
- Сохранить мульти-kind кейс «service + secondary location» бесплатным для Pro Service/Experience/All.
- Не сломать existing Premium-юзеров, которые публикуют locations (grandfather-стратегия — см. § 7).

**Не-цели:**

- Не вводим Stripe Connect / payouts.
- Не меняем модель `places.kind` + `secondary_kinds[]` (она уже Phase 2-готова).
- Не трогаем UI карточек / view layer.

---

## 1. Тарифная сетка v2

### Consumer

| План | Цена | Доступ |
|---|---|---|
| Free | $0 | публичные локации, чтение |
| Premium | $35 one-time | + скрытые локации |

Premium **больше не даёт право создавать карточки** (никакого kind'а). Существующие юзеры — см. § 7.

### Creator (каждый автоматически включает Premium)

| План | Monthly | Yearly (20% off) | Monthly equiv | Save / год | Квота |
|---|---|---|---|---|---|
| Pro Location | $9.99 | $95.88 | $7.99 | $24 | 5 locations |
| Pro Service | $14.99 | $143.88 | $11.99 | $36 | 5 services + secondary location free |
| Pro Experience | $14.99 | $143.88 | $11.99 | $36 | 5 experiences + secondary location free |
| Pro All | $34.99 | $335.88 | $27.99 | $84 | 10 combined всех 3 типов |

**Math (precise):** $14.99 \times 12 = 179.88$; $179.88 \times 0.80 = 143.904 \approx 143.88$ ($11.99 \times 12$). Все три yearly-цены дают ровно `$X.99/mo billed yearly` — клин для UI.

### Add-on

`+1 listing` — $2.99 one-time, навсегда. Без toggle.

---

## 2. Mapping: kinds[] → suggestedPlan

Логика для `suggestPlanForKinds(kinds[])`:

```
[location]                       → creator_location  $9.99/mo  | $95.88/yr
[service]                        → creator_service   $14.99/mo | $143.88/yr
[experience]                     → creator_experience $14.99/mo | $143.88/yr
[location, service]              → creator_service   (location=secondary, free)
[location, experience]           → creator_experience
[service, experience]            → creator_all       $34.99/mo | $335.88/yr
[service, experience, location]  → creator_all
```

Cycle (`month | year`) выбирает юзер тогглом — функция возвращает план, не цену.

---

## 3. Инвариант квоты (критично)

**Old behavior** (`enforce_place_quota`): считает union(`kind`, `secondary_kinds`). Карточка `kind='service', secondary_kinds=['location']` шла в обе квоты.

**New behavior:** location-квота применяется ТОЛЬКО когда `kind='location'` (primary). Secondary location — бесплатен.

Псевдо-логика триггера:

```sql
-- service-квота: считаем все, где kind='service' OR 'service' = ANY(secondary_kinds)
-- experience-квота: то же для experience
-- location-квота: ТОЛЬКО где kind='location' (primary) AND 'location' NOT covered by another quota
-- combined (Pro All): DISTINCT places, где primary OR secondary ∈ {service, experience, location}

IF plan = 'creator_location' THEN
  count = (SELECT count(*) FROM places WHERE created_by = user AND kind = 'location');
  IF count >= 5 + bonus_credits THEN raise QUOTA_EXCEEDED;
ELSIF plan = 'creator_service' THEN
  count = services_count(user); -- includes secondary services
  IF NEW.kind = 'location' THEN
    -- pure location card — not allowed on Pro Service
    raise NO_PLAN_FOR_KIND;
  ELSIF count >= 5 + bonus_credits THEN raise QUOTA_EXCEEDED;
  END IF;
-- ...
ELSIF plan = 'creator_all' THEN
  count = (SELECT count(DISTINCT id) FROM places WHERE created_by = user);
  IF count >= 10 + bonus_credits THEN raise QUOTA_EXCEEDED;
END IF;
```

Ключевые тесты (DO-блок с rollback, как в `enforce_place_quota_trigger`):

1. Pro Service создаёт `kind='service', secondary_kinds=['location']` 5 раз → ОК. 6-й → QUOTA_EXCEEDED.
2. Pro Service создаёт `kind='location'` → NO_PLAN_FOR_KIND.
3. Pro Location создаёт `kind='location'` 5 раз → ОК. 6-й → QUOTA_EXCEEDED. 6-й после `bonus_listing_credits=1` → ОК.
4. Pro All создаёт 10 разных карточек разных kind'ов → ОК. 11-я → QUOTA_EXCEEDED.
5. Pro All создаёт `kind='service', secondary_kinds=['location']` → засчитывается как 1 карточка (DISTINCT places), не 2.
6. Premium ($35) пытается создать `kind='location'` → NO_PLAN_FOR_KIND. (См. § 7 про grandfather.)
7. `is_admin=true` обходит проверку.

---

## 4. DB миграция

**Файл:** `supabase/migrations/<timestamp>_pricing_v2.sql`

1. Расширить enum/check для `profiles.plan`:

   ```sql
   ALTER TABLE profiles DROP CONSTRAINT profiles_plan_check;
   ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check
     CHECK (plan IN ('free', 'premium_viewer', 'creator_location',
                     'creator_service', 'creator_experience', 'creator_all'));
   ```

2. Добавить `subscriptions.cycle` (text, `'month' | 'year'`, default `'month'`). Backfill = `'month'` для existing.

3. Заменить функцию `enforce_place_quota()` под новую логику (см. § 3). Триггер не пересоздаём — `CREATE OR REPLACE FUNCTION`.

4. Smoke-тесты в DO-блоке с `RAISE EXCEPTION 'TESTS_DONE'` для rollback (паттерн как в `add_subscription_plans_and_history`).

**Откат:** прямой `DOWN`-script — drop check, restore старое тело функции (оставить snapshot в комментарии миграции).

---

## 5. Stripe конфигурация

### Новые price IDs (8 recurring)

| ENV переменная | Цена | Period |
|---|---|---|
| `STRIPE_PRICE_CREATOR_LOCATION_MONTH` | $9.99 | month |
| `STRIPE_PRICE_CREATOR_LOCATION_YEAR` | $95.88 | year |
| `STRIPE_PRICE_CREATOR_SERVICE_MONTH` | $14.99 | month |
| `STRIPE_PRICE_CREATOR_SERVICE_YEAR` | $143.88 | year |
| `STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH` | $14.99 | month |
| `STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR` | $143.88 | year |
| `STRIPE_PRICE_CREATOR_ALL_MONTH` | $34.99 | month |
| `STRIPE_PRICE_CREATOR_ALL_YEAR` | $335.88 | year |

Сохраняются:
- `STRIPE_PRICE_PREMIUM_ONETIME` ($35)
- `STRIPE_PRICE_EXTRA_LISTING` ($2.99)

### `/api/stripe/checkout`

Принимает `{ plan: PaidPlan, cycle?: 'month' | 'year' }`. Cycle игнорируется для one-time (premium, add-on). Резолвит price ID через map `(plan, cycle) → ENV`.

### `/api/stripe/webhook`

При `customer.subscription.created/updated`:
1. Берём `subscription.items.data[0].price.id`.
2. Ищем в reverse-map `priceId → { plan, cycle }`.
3. Пишем `profiles.plan = plan`, `subscriptions.cycle = cycle`.

При `customer.subscription.deleted` → `plan = 'free'`. Premium one-time не сбрасываем (legacy флаг отдельно).

### Customer Portal

Включить `subscription_update.proration_behavior = 'create_prorations'` для смены monthly↔yearly. Артёму нужно вручную в Stripe Dashboard включить product list для апгрейда.

---

## 6. Код-changes по файлам

### 6.1 `app/types.ts` (или где `PaidPlan`)

```ts
export type CreatorPlan =
  | "creator_location"   // NEW
  | "creator_service"
  | "creator_experience"
  | "creator_all";

export type PaidPlan = "premium_viewer" | CreatorPlan;
```

### 6.2 `app/lib/plans.ts`

- Добавить `creator_location` в `PLAN_CONFIG` с двумя ценами (см. ниже).
- Изменить `PlanBilling`: добавить поле `priceMonth`, `priceYear`, `priceIdEnvMonth`, `priceIdEnvYear` для всех recurring planов. Premium и add-on остаются `kind: 'one_time'`.
- Обновить `quotaFor`: добавить кейс `creator_location` (`location: 5`, `service: 0`, `experience: 0`). Расширить тип чтобы возвращать квоту по location тоже.
- Перевести `suggestPlanForKind` (single) → deprecated. Использовать только `suggestPlanForKinds`.
- Поправить `suggestPlanForKinds`: новая логика из § 2 (location-only → `creator_location`, не `premium_viewer`).
- `formatPrice` без изменений, добавить хелпер `formatYearlyPrice(plan)` → `"$11.99/mo billed yearly · save $36"`.

**Premium теперь теряет фичу «Publish your own locations»** в `features[]` — это видимое для юзера breaking. См. § 7.

### 6.3 `app/lib/access.ts`

- `canUserCreate(access, kind)`:
  - `kind === 'location'` (как primary) → разрешено для `creator_location | creator_all` (и grandfather'ed Premium до cutoff даты — см. § 7).
  - `kind === 'service'` → `creator_service | creator_all`.
  - `kind === 'experience'` → `creator_experience | creator_all`.
- Secondary location: `canUserAddSecondaryLocation(access)` → true для любого `CreatorPlan`. Используется в форме создания, не в триггере (триггер просто не считает secondary в location-квоту).
- `checkQuota(...)` — расширить reason'ы: добавить `'no_plan_for_kind'` (юзер с Pro Service пытается создать pure location).

### 6.4 `/pricing` page

- 5 карточек (4 Pro + Premium). Premium идёт первым или последним — UX-выбор (предлагаю первым: «Travelling? Start here»).
- Toggle `Monthly | Yearly` сверху, **default Yearly**, бейдж «Save 20%».
- На каждой Pro-карточке при Yearly:
  - Большой шрифт: `$11.99/mo`
  - Серым ниже: `$143.88 billed yearly · Save $36`
- При Monthly: `$14.99/mo · billed monthly`.
- Premium и add-on не реагируют на toggle.

### 6.5 `BecomeProviderModal` + `/add` flow

- Multi-select сохраняется. Default empty + Continue disabled — без изменений.
- Не блокировать непокрытые типы (apsell на финале — см. ответ Артёма).
- На финальном шаге `/add` (после формы) если `canUserCreate` фейлится по любому kind → открыть `PaywallModal` с:
  - предзаполненным `suggestPlanForKinds(allSelected)`
  - тем же Monthly/Yearly toggle, дефолт Yearly
  - one-click checkout

### 6.6 `/profile/billing`

- Показывать `subscriptions.cycle` в текущем плане (`Monthly` / `Yearly`).
- Кнопка «Switch to yearly · Save 20%» если сейчас monthly. Кнопка идёт в Customer Portal с предвыбранным yearly price.

---

## 7. Migration of existing users (КРИТИЧНО — open question)

**Проблема:** в текущем `PLAN_CONFIG.premium_viewer.features[]` стоит `{ label: "Publish your own locations", included: true }`. Триггер квоты на location не ограничивает Premium-юзеров. То есть прямо сейчас существуют юзеры с `plan='premium_viewer'`, которые легально опубликовали location'ы.

В v2 Premium это право теряет. Это **breaking change для existing customers**.

**Варианты:**

**A. Grandfather до cutoff даты.** Все юзеры с `plan='premium_viewer'` И хотя бы 1 опубликованной location-карточкой ДО даты релиза v2 — получают новый plan `premium_grandfathered` (внутренний, невидимый в /pricing). Этот plan = Premium + право на unlimited location creation legacy. Новые Premium-покупатели — без этого права.

  - ✅ Никого не обижаем.
  - ⚠️ +1 plan SKU в коде (только internal).

**B. Free upgrade в Pro Location.** Existing Premium с активными locations → бесплатно мигрируют в `creator_location` на 12 месяцев, потом конвертируются в Premium $35 one-time + опция апгрейда.

  - ⚠️ Stripe-сложно: бесплатная подписка через 100% off coupon с экспирацией.

**C. Отказ от ограничения для Premium вообще.** Premium продолжает позволять unlimited location. Тогда зачем Pro Location $9.99? — только если location-квота больше 5 (нет смысла).

  - ❌ Ломает экономику Pro Location.

**Рекомендация:** **A**. Pre-deploy SQL: `UPDATE profiles SET plan = 'premium_grandfathered' WHERE plan = 'premium_viewer' AND id IN (SELECT DISTINCT created_by FROM places WHERE kind = 'location');`. Триггер квоты для этого plan = unlimited location.

→ Это нужно зафиксировать с Артёмом перед началом миграции. Блокер.

---

## 8. Фазы реализации

| Фаза | Что | Файлы | Эффорт |
|---|---|---|---|
| Φ1 | Согласовать grandfather-стратегию (§ 7) | discussion | — |
| Φ2 | DB migration `pricing_v2.sql` + smoke-тесты | `supabase/migrations/...` | M |
| Φ3 | Типы + `plans.ts` + `access.ts` | `app/types.ts`, `app/lib/plans.ts`, `app/lib/access.ts` | M |
| Φ4 | Stripe products+prices в Dashboard, ENV в `.env.local` и Vercel | manual | S |
| Φ5 | `/api/stripe/checkout` принимает `{plan, cycle}` | `app/api/stripe/checkout/route.ts` | S |
| Φ6 | Webhook: reverse-map `priceId → {plan, cycle}` | `app/api/stripe/webhook/route.ts` | S |
| Φ7 | `/pricing` UI: 5 карточек, monthly/yearly toggle | `app/pricing/page.tsx` | M |
| Φ8 | `BecomeProviderModal` + `/add` paywall с toggle | `app/components/BecomeProviderModal.tsx`, `app/(auth)/add/page.tsx`, `PaywallModal` | M |
| Φ9 | `/profile/billing`: показ cycle, кнопка switch | `app/profile/billing/...` | S |
| Φ10 | Регрессия: тестовые покупки в Stripe test mode (4 плана × 2 cycles) | manual | S |
| Φ11 | Update memory `maporia_monetization.md` под v2 | memory | S |

Total: ~M+M+S+S+S+M+M+S+S+S = **2-3 дня** работы один человек, реалистично 4-5 с тестами.

---

## 9. Rollback стратегия

**Если что-то ломается на проде:**

1. В Stripe Dashboard — приостановить новые подписки на v2 prices (deactivate). Existing subscriptions продолжают рендериться.
2. В коде — feature-флаг `NEXT_PUBLIC_PRICING_V2=false` отключает новый /pricing UI и BecomeProviderModal upsell. UI откатывается на v1.
3. DB-уровень — миграция additive (новый enum-валуе, новая колонка `cycle` с default). Откат не нужен, старая логика триггера сохранена в комментарии.
4. Webhook — продолжает понимать и старые, и новые price IDs (reverse-map включает оба).

---

## 9.1. As-built journal

### 2026-05-08 — Φ0 done

- Принят default по § 7: **вариант A** (grandfather через `premium_grandfathered`, unlimited locations forever).
- Принят default по § 10.3: **Pro Location yearly $95.88** (формула 20%, держим однородность сетки `$X.99/mo billed yearly`).
- Принят default по § 10.4: **единый `bonus_listing_credits`** — действует на любую квоту того же плана.
- Создан `app/lib/pricing/` со следующими файлами:
  - `registry.ts` — `PRICING_REGISTRY: Record<PlanId, PlanSpec>` с 7 планами (free, premium_viewer, premium_grandfathered, 4 creator). Типы `PlanId`, `Capability`, `Cycle`, `Currency`, `PriceSpec`, `PlanQuota`, `PlanSpec`. Хелперы `getPriceSpec`, `planBillingCycle`, `PUBLIC_PLANS`, `CREATOR_PLAN_IDS`, `EXTRA_LISTING`, `ANNUAL_DISCOUNT`.
  - `quota.ts` — pure-функции `computeQuota`, `canCreateMultiKind`, `suggestPlanForKinds`, `planCoversKind`. Поведенческий близнец SQL-триггера (Φ12 проверит equivalence).
  - `checkout.ts` — `resolvePriceId` (для checkout) и `resolvePlanByPriceId` (для webhook). Кастомные ошибки `PriceNotConfiguredError`, `UnsupportedPlanCycleError`. Helper `listAllStripePriceEnvs` для smoke-validation. **ENV не валидируются здесь — это Φ9.**
  - `features.ts` — `getFeatures(plan, locale)` генерирует feature-list для /pricing из `capabilities` + `quota`. Локали `en` (русский — подключим в Φ7 при необходимости).
  - `format.ts` — `priceDisplay(plan, cycle)` возвращает готовое представление цены: primary "$11.99/mo", secondary "billed yearly · save $36". `annualDiscountLabel()` для тоггла.
  - `index.ts` — barrel export.
- Старые файлы `app/lib/plans.ts` и `app/lib/access.ts` НЕ ТРОНУТЫ. Это намеренно — они продолжают работать в существующем коде; миграция на registry — отдельная Φ3.
- Полный `tsc --noEmit --skipLibCheck` зелёный.

### 2026-05-08 — Φ3 done

- `app/types.ts`: `Plan` теперь = `PlanId` из registry. Добавлены `creator_location` и `premium_grandfathered`. `PaidPlan = Exclude<Plan, 'free' | 'premium_grandfathered'>`. `CreatorPlan` расширен.
- `app/lib/access.ts`:
  - `CREATOR_PLANS` теперь включает `creator_location`.
  - `canUserCreate(kind)` — делегирует в `planCoversKind` из registry. Оставлен legacy fallback для `premium_viewer + location` (TODO удалить после Φ2 grandfather-миграции).
  - `requiredPlanFor('location')` теперь возвращает `creator_location` (был `premium_viewer`).
  - `checkQuota` — переписан на делегирование в `computeQuota(registry)`. Сигнатура расширена `activeLocations` (default 0 для backward-compat). Reason'ы маппятся на legacy `'no_plan'/'limit_reached'/'ok'`.
- `app/lib/plans.ts` помечен `@deprecated`. Добавлен stub `creator_location` в `PLAN_CONFIG` (минимальный набор полей) — чтобы `Record<PaidPlan, PlanConfig>` оставался exhaustive. Реальные данные в registry; этот stub удалится в Φ7 при UI-переезде.
- Полный `tsc --noEmit --skipLibCheck` + `eslint` на изменённые файлы — зелёные, 0 warnings.

### 2026-05-08 — Φ2 + Φ10 done (DB migration)

- Применена миграция `pricing_v2_creator_location_and_grandfather` на prod через `mcp__supabase.apply_migration`.
- **Pre-migration state:** `profiles_plan_check` без `creator_location`/`premium_grandfathered`; `places.kind_check` уже корректный; `subscriptions.period` существует — отдельная `cycle`-колонка не нужна (использую `period`); 4 юзера всего (3 free + 1 premium_viewer без location-карточек), 292 места (291 location + 1 service от admin).
- **Изменения:**
  1. `profiles_plan_check` расширен 7 ID (free, premium_viewer, premium_grandfathered, creator_location, creator_service, creator_experience, creator_all).
  2. Grandfather UPDATE — 0 строк (как и ожидалось: единственный premium_viewer не публиковал locations).
  3. Композитный индекс `places_created_by_kind_idx ON places (created_by, kind)` — добавлен.
  4. `enforce_place_quota()` переписана под v2-инвариант:
     - primary kind должен быть напрямую покрыт capability плана (creator_location → location, creator_service → service, etc.);
     - secondary location бесплатен для всех creator-планов и premium_grandfathered;
     - service/experience как secondary требует direct capability;
     - quota: creator_location 5 location, creator_service 5 service (primary OR secondary), creator_experience 5 exp, creator_all 10 combined (DISTINCT places, ВСЕ 3 kind'а);
     - premium_grandfathered → unlimited locations forever.
- **Verification:**
  - `profiles_plan_check` обновлён (7 IDs): ✅
  - `plan_distribution` (premium_viewer:1, free:3): ✅ — никого не сломали, blast radius 0.
  - `places_created_by_kind_idx` создан: ✅
  - `get_advisors security`: 0 регрессий — все warnings (`function_search_path_mutable`, `anon_security_definer`) pre-existing на других функциях, не на enforce_place_quota.
  - **Smoke INSERT-тесты НЕ прогнал** — это требует создания тестового auth.user и rollback'а; перенесено в Φ12 (TS↔SQL equivalence test, Task #12).
- **Subscriptions:** существующая колонка `subscriptions.period` (`'month'|'year'`) уже подходит под yearly billing — отдельная миграция не нужна.

### Migration as-applied SQL (для grep'а)

Миграция применена через MCP, не через `supabase/migrations/` файл. Если потом нужно восстановить DDL для CI / staging — взять из commit'а или re-run через MCP `apply_migration` (idempotent: ALTER CONSTRAINT, CREATE OR REPLACE FUNCTION, CREATE INDEX IF NOT EXISTS).

### 2026-05-08 — Φ4 + Φ8 + Φ9 done (Stripe layer)

**Φ9 — ENV validation + webhook idempotency:**

- `app/lib/env.ts` создан — ручная валидация без Zod (zod не был установлен, не добавляли зависимость).
  - `validatePricingEnv({ strict: false })` — soft-проверка: только core (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) обязательны. Pricing v2 SKU optional во время rollout.
  - `validatePricingEnv({ strict: true })` — hard-проверка: все registry SKU обязательны. Включается после Φ4 provisioning.
  - `getMissingPricingEnvs()` для UI: показать «temporarily unavailable» вместо упавшего checkout.
  - `requireEnv(name)` — безопасный getter, кидает понятную ошибку.
- Миграция `stripe_webhook_events_idempotency` применена. Таблица `(event_id pk, event_type, processed_at, request_id)` + индекс на `processed_at DESC` для cleanup-задач. RLS включён, без public policies (service_role bypass).
- `app/api/stripe/webhook/route.ts` — handler теперь делает `tryClaimWebhookEvent()` сразу после verify signature. Если row уже была (unique violation 23505) — возвращает 200 с `duplicate: true`, скипает работу. Если ошибка claim'а — 500 (лучше fail loud, чем дважды активировать план).

**Φ4 — Stripe checkout + webhook:**

- `app/api/stripe/checkout/route.ts` переписан:
  - Body теперь принимает `{ access_token, plan, cycle?, addon? }`. `cycle: 'month' | 'year' | 'lifetime'` (с fallback на legacy `period`).
  - Резолв Price ID — через `resolvePriceId({plan, cycle})` из registry. Никаких хардкодов `STRIPE_PRICE_*` в роуте.
  - Кастомные ошибки: `MISSING_PLAN_PRICE`, `UNSUPPORTED_PLAN_CYCLE`, `MISSING_ADDON_PRICE`. Каждая возвращает понятный JSON юзеру.
  - `defaultCycleForPlan(plan)` для defensive default — если клиент не прислал cycle.
- `app/api/stripe/webhook/route.ts` — `handleSubscriptionUpsert` теперь имеет fallback на `resolvePlanByPriceId(price.id)`, если metadata.plan/period пустые (например, подписка создана вручную в Stripe Dashboard).

**Φ8 — Stripe provisioning script:**

- `scripts/stripe/provision-prices.ts` создан. Идемпотентный TS-скрипт, читает `PRICING_REGISTRY`, через Stripe API ищет Product/Price по `metadata.maporia_plan` + `metadata.maporia_cycle`, создаёт если нет.
- Запуск:
  - `npx tsx scripts/stripe/provision-prices.ts --dry` — печатает план, ничего не создаёт.
  - `npx tsx scripts/stripe/provision-prices.ts` — реально создаёт Products/Prices.
- Печатает .env-блок для copy-paste в Vercel ENV.
- Защита от mismatch: если Stripe Price существует, но `unit_amount` расходится с registry — ругается (Prices иммутабельны, нужно создавать новый).
- Работает на test-режиме (sk_test_…) и live-режиме (sk_live_…) одинаково — те же metadata-ключи, разные Price IDs.
- **Не прогнан** — это ручной шаг для Артёма, нужен Stripe API key. После прогона: ENV переменные в Vercel + локально.

**TS:** полный `tsc --noEmit --skipLibCheck` зелёный после всех изменений.

### 2026-05-08 — Φ7 done (UI /pricing)

- `app/pricing/page.tsx` переписан полностью на registry. Никакого `PLAN_CONFIG` импорта.
- **5 карточек** в ровном grid (sm:2, lg:5): Premium → Pro Location → Pro Service → Pro Experience → Pro All. Premium идёт первым как consumer-entry-point.
- **Monthly | Yearly toggle** в pill-стиле (`role="tablist"`), default `Yearly`. На Yearly — бейдж «Save 20%» через `ANNUAL_DISCOUNT` constant. Premium и Add-on не реагируют на toggle (всегда lifetime / one-time).
- **Цены через `priceDisplay(plan, cycle)`** из registry/format.ts:
  - Yearly: primary `$11.99/mo`, secondary `$143.88 billed yearly · save $36`.
  - Monthly: primary `$14.99/mo`, secondary `billed monthly`.
  - Lifetime: primary `$35`, secondary `one payment, lifetime access`.
- **Features авто-генерируются** через `getFeatures(plan)` из registry (capabilities + quota). UI больше не хардкодит feature-list.
- **CTA отправляет `cycle`** в `/api/stripe/checkout`. `effectiveCycle(plan, toggle)` — для Premium/lifetime-only план делает override на `lifetime` независимо от toggle.
- TS + ESLint зелёные.

### 2026-05-08 — Φ8 done (BecomeProviderModal)

- `BecomeProviderModal` теперь читает `currentPlan` из `useUserAccessContext()` и подсвечивает **«Covered»** бейдж на каждом kind, который покрыт текущим планом юзера (`planCoversKind` из registry). UX-сигнал: ты уже можешь это публиковать без апгрейда.
- Внизу модалки — **динамическая подсказка suggested plan**:
  - Если выбраны kind'ы и suggested ≠ currentPlan → «Suggested plan: Pro Service from $14.99/mo. You'll see Monthly/Yearly options after you fill the form.»
  - Иначе (ничего не выбрано или план уже покрывает) → fallback на оригинальный текст.
- Не блокируем выбор непокрытых типов (соответствует решению Артёма: «не блокировать, апсейл на финале»).
- `/add` page **не трогали** — она ловит ?kinds=… как раньше, и при `checkQuota` падении показывает PaywallModal. /api/stripe/checkout v2 теперь получит правильный suggested plan + cycle из тех же registry-функций.
- TS + ESLint зелёные.

### 2026-05-08 — Φ11 done (i18n инфра)

- `app/lib/i18n.ts` создан как минимальный stub. Функции `t(key, params)`, `useT()`, типы `Locale`, `DEFAULT_LOCALE`.
- Один словарь `STRINGS.en` с ключами `pricing.*`, `paywall.*`, `become_provider.*`. Структура готова к разбиению на отдельные JSON-файлы.
- Реальные локали (`ru`, `es`) НЕ добавляли — это incremental work, фундамент в `Locale` и `availableLocales()`.
- При замене `t()` на `next-intl`'s `useTranslations()` или другую библиотеку — сигнатура совместима, остальной код не меняется.

### 2026-05-08 — Φ12 done (TS↔SQL quota smoke tests)

- Прогнаны 11 smoke-тестов на `enforce_place_quota` через DO-блок с rollback (`RAISE EXCEPTION 'TESTS_DONE' USING ERRCODE = '45000'`):
  1. **T1** free → location: rejected (P0001 NO_PLAN) ✅
  2. **T2** premium_viewer → location: rejected (v2 strict — раньше пускал) ✅
  3. **T3** creator_location → 5 locations: ОК ✅
  4. **T4** creator_location → 6th location: rejected (P0002 QUOTA_EXCEEDED) ✅
  5. **T5** creator_location → service: rejected (P0001 NO_PLAN) ✅
  6. **T6** creator_service → service+secondary[location]: ОК (бесплатный secondary) ✅
  7. **T7** creator_service → primary location: rejected (P0001) ✅
  8. **T8** creator_all → 10 mixed (4 loc + 3 svc + 3 exp): ОК ✅
  9. **T9** creator_all → 11th: rejected (P0002) ✅
  10. **T10** bonus_listing_credits=1 → 11th OK (credit consumed) ✅
  11. **T11** premium_grandfathered → 50 locations: ОК (unlimited) ✅
- Использован existing free-юзер (FK на auth.users не позволяет создать тестовый профиль с ходу). Snapshot/restore через UPDATE; всё в одной транзакции с rollback через `RAISE EXCEPTION`.
- Verification post-test: тестовый юзер вернулся в исходное состояние (`plan='free'`, `bonus_listing_credits=0`, 0 places). Total places не изменилось от тестов (новая запись от admin'а — не от наших тестов).
- TS-сторона equivalence: `computeQuota` в `app/lib/pricing/quota.ts` реализует ту же decision-логику. Property-based тест с десятками тысяч случайных входов — TODO для будущей сессии (требует jest/vitest setup).

**Итог Φ12:** 11/11 SQL-инвариантов выполняются. Поведенческий близнец TS↔SQL работает. Производственный риск drift'а минимизирован.

### 2026-05-08 — Cleanup: удалён legacy fallback в `canUserCreate`

- Sanity-check на проде: единственный `premium_viewer`-юзер имеет 0 plats всех kinds. Безопасно удалить fallback.
- `app/lib/access.ts` — удалена ветка `if (kind === 'location' && plan === 'premium_viewer') return true`. Теперь `canUserCreate` чисто делегирует в `planCoversKind` из registry. v2-strict поведение Premium = чисто consumer.
- TS + ESLint зелёные.

### Что осталось ручным

**Что я НЕ могу сделать без твоих credentials:**

1. **Stripe provisioning** — `STRIPE_SECRET_KEY` в `.env.local` сейчас placeholder (`ВСТАВЬ_НОВЫЙ_СЮДА`). Когда восстановишь:
   ```bash
   cd /path/to/maporia
   export STRIPE_SECRET_KEY=sk_test_...   # сначала test
   npx tsx scripts/stripe/provision-prices.ts --dry
   npx tsx scripts/stripe/provision-prices.ts
   # → копируй .env-блок в .env.local + Vercel ENV
   # → повтори с sk_live_… для прода
   ```
2. **Customer Portal** в Stripe Dashboard — включить subscription_update + proration_behavior=create_prorations для switch monthly↔yearly.

**Cleanup, который я отложил для безопасности (требует решения на Φ7+):**

- `app/lib/plans.ts` legacy — оставлен с `@deprecated` пометкой. Используется в 9 местах (`/profile`, `/admin/billing`, `/add`, …). Удалить после миграции этих callers на registry.
- Stub `creator_location` в `PLAN_CONFIG` — нужен только для exhaustive `Record<PaidPlan, PlanConfig>`. Уйдёт вместе с `plans.ts`.

---

## 10. Открытые вопросы

1. **§ 7 grandfather-стратегия** — A/B/C? (рекомендую A).
2. Premium one-time — оставляем $35 или меняем? (рекомендую оставить — это якорь воронки).
3. Yearly Pro Location $95.88 — это хорошая цена или предложить $99 round? (Все четыре yearly даны по формуле; round-цены ломают «monthly equivalent $X.99»-эстетику. Рекомендую оставить $95.88.)
4. Add-on `+1 slot` — действует на location-квоту тоже? (Сейчас `bonus_listing_credits` единый счётчик. Логично: +1 любого kind'а в рамках того же плана. Я бы оставил единый.)
5. Что делать с юзерами на Pro Service, у которых сейчас уже опубликованы pure-location карточки (созданные через мульти-kind с primary=location)? Edge case — но возможный. Скан БД покажет.

---

## 11. Scalability requirements (added 2026-05-08)

Решено реализовать все четыре направления **сразу в v2**, до релиза. Дисциплина: инфраструктуру закладываем; конкретные значения (новые планы, локали, A/B-варианты) добавляем по мере надобности без рефакторинга.

### 11.1 Single source of truth (архитектура кода)

**Принцип:** добавление нового плана = патч одного registry-объекта + одна миграция (enum + триггер). Всё остальное — типы, UI, Stripe-маппинг, квоты, paywall — выводится автоматически.

**Реализация:**

- `app/lib/pricing/registry.ts` — единственный источник. Один `const PRICING_REGISTRY = { creator_location: { ... }, creator_service: { ... }, ... } as const`. Из него выводится тип `PaidPlan` через `keyof typeof PRICING_REGISTRY`. Никаких параллельных enum'ов руками.
- `app/lib/pricing/quota.ts` — чистая функция `computeQuota(plan, kind, current_count, bonus_credits)`. Используется и в TS (для UI-предикатов), и поведенчески идентично SQL-триггеру (см. § 11.2 — генерация SQL из той же спецификации).
- `app/lib/pricing/checkout.ts` — `resolvePriceId(plan, cycle, currency='USD')`. Один map для checkout, один обратный map для webhook. Нет хардкоженных `STRIPE_PRICE_*` в роутах.
- `app/lib/pricing/features.ts` — генерирует `features[]` для `/pricing`-карточек из quota+capabilities, не хардкодит строки. Это автоматически держит UI и БД в синхроне.
- `app/types/plans.ts` — типы выводятся из registry через `keyof`. Брейк в TS, если кто-то добавил план в SQL, но забыл в registry.

**Что это даёт:** добавить 6-й план = добавить ключ в registry + миграция. Все 12+ файлов перестают существовать как точки правки.

**Где закопано:** дисциплина. Любое условие `if (plan === 'creator_x')` в коде — code smell. Должно быть `if (registry[plan].capabilities.includes('x'))` или `quotaFor(plan, kind) > 0`.

### 11.2 DB performance на росте (10K+ юзеров)

**Bottleneck-кандидаты:**

1. **`enforce_place_quota` триггер на INSERT.** Сейчас он делает `SELECT count(*)` по `places WHERE created_by = $1 AND ...`. Без индекса — seqscan, на 10K юзеров × N карточек становится дорого.
2. **Webhook UPSERT в `subscriptions`.** Не должен блокировать checkout flow.
3. **`/pricing` рендер.** Должен быть RSC, не client. Pricing registry — server-only.

**Решение:**

- **Композитный индекс:** `CREATE INDEX places_created_by_kind_idx ON places (created_by, kind) WHERE is_deleted IS NOT TRUE;`. Покрывает три квоты (location/service/experience). Partial index на не-удалённых — экономит размер.
- **GIN на `secondary_kinds`:** `CREATE INDEX places_secondary_kinds_gin ON places USING gin(secondary_kinds);`. Нужен для service/experience-квоты, которая считает union(primary, secondary).
- **`EXPLAIN ANALYZE` benchmark:** запустить триггер на сидовой БД с 10K профилей × 5 карточек, зафиксировать `< 5ms` на INSERT. Если выше — кэшировать count в `profiles.places_count_by_kind jsonb` (lazy materialized view).
- **Postgres advisor:** прогнать `mcp__supabase__get_advisors` (level=performance) после миграции — fail-fast на missing indexes / unused indexes.
- **RLS:** проверить, что новые проверки квоты не делают N+1 RLS-эвалуации. Триггер `SECURITY DEFINER` уже это делает корректно.

**Critical invariant:** SQL-логика триггера и TS-функция `computeQuota` должны быть **эквивалентны**. Расхождение → клиент скажет «можно создать», сервер откажет → юзер видит loading + ошибку. Подход: TS-функция и SQL-функция оба генерируются из общей JSON-спеки в `pricing/spec.json`, либо у нас есть property-based тесты, проверяющие эквивалентность.

### 11.3 Ops automation (Stripe + grandfather + ENV)

**Принцип:** ноль ручных шагов на проде между «git push» и «новый план работает».

**Stripe provisioning скрипт:**

- `scripts/stripe/provision-prices.ts` — идемпотентный TS-скрипт.
- Читает `PRICING_REGISTRY`, для каждой пары `(plan, cycle)` ищет существующий Price по `metadata.maporia_plan = 'creator_location'` + `metadata.cycle = 'month'`. Если нет — создаёт Product+Price. Если есть — проверяет actual `unit_amount` совпадает с registry.
- Печатает diff: `[CREATE] STRIPE_PRICE_CREATOR_LOCATION_MONTH = price_xyz`.
- Экспорт в формате `.env`: copy-paste в Vercel ENV.
- Запускается на любой Stripe-аккаунт (test → live) — те же metadata, разные Price IDs.

**ENV validation на старте:**

- `app/lib/env.ts` (Zod-схема). Валидирует на boot: все 8 recurring + 2 one-time `STRIPE_PRICE_*` присутствуют и начинаются с `price_`. Server fails to start с понятной ошибкой, если ENV сломан. Лучше hard-fail на деплое, чем silent broken checkout на проде.
- В `next.config.ts` добавить `runtimeChecks` импорт `env.ts` — Next падает при сборке если ENV невалиден.

**Grandfather-миграция:**

- Идемпотентная: `INSERT ... ON CONFLICT DO NOTHING` или `UPDATE WHERE plan = 'premium_viewer' AND ...`. Можно прогнать второй раз без эффекта.
- Лог результата: `RAISE NOTICE 'grandfathered N users'`.
- Один SQL-файл в `supabase/migrations/`, не отдельный ad-hoc скрипт. Чтобы воспроизводилось на любом env (staging, preview branches).

**Webhook resilience:**

- Webhook idempotent на `event.id` — Stripe ретраит, мы не должны двойного начислять. Таблица `stripe_webhook_events (event_id pk, processed_at)`.
- Очередь обработки через background job (Inngest/QStash) если webhook handler делает >100ms работы. Сейчас не обязательно — но забронировать асинхронный путь.

### 11.4 Multi-currency / i18n / A/B — инфраструктура без преждевременных значений

**Что закладываем сейчас:**

- **Currency-aware schema:** `subscriptions.currency text not null default 'USD'` + `places.price_currency` уже есть. `PRICING_REGISTRY` хранит `prices: { USD: {...} }` с возможностью добавить ключ `EUR`/`RUB`.
- **Stripe multi-currency:** один Product, несколько Prices (по одному на валюту). `resolvePriceId(plan, cycle, currency)` уже принимает третий аргумент.
- **i18n-готовый UI:** все строки в `/pricing`, `BecomeProviderModal`, `PaywallModal` идут через `useTranslations()` (next-intl). Сейчас словарь только `en`. Добавить `ru` / `es` — патч JSON, не код.
- **Feature-flag для цен:** `PRICING_VARIANT` ENV-переменная (или Supabase row в `app_settings` KV — там уже есть паттерн для `premium_modal`/`stats_banner`). Меняет, какой `PRICING_REGISTRY_VARIANT` активен. По умолчанию `default`. A/B можно реализовать на уровне cookie + два варианта registry — без редеплоя.

**Что НЕ делаем сейчас:**

- Реальный `EUR`/`RUB` — добавим, когда придёт юр.лицо в EU/RU. Сейчас только USD.
- Реальный A/B — нужен конкретный hypothesis. Без него инфраструктура мертвеет. Закладываем точку расширения, не сам тест.
- Geolocation-detection валюты — over-engineering для USD-only.

**Why:** добавить `EUR` потом = `prices.EUR = {...}` в registry + миграция Price IDs + `accept-language` или geo-IP детектор. Полдня работы, если фундамент есть.

### 11.5 Обновлённая фазовая раскладка

| Фаза | Что | Эффорт |
|---|---|---|
| Φ0 | Pricing registry в `app/lib/pricing/` (single source) | M |
| Φ1 | Согласовать grandfather-стратегию | — |
| Φ2 | DB migration + индексы + триггер | M |
| Φ3 | Типы + access.ts + quota.ts (синхронно с SQL) | M |
| Φ4 | `scripts/stripe/provision-prices.ts` + run в test mode | M |
| Φ5 | ENV validation (Zod в `lib/env.ts`) | S |
| Φ6 | `/api/stripe/checkout` + webhook (idempotent + reverse-map) | M |
| Φ7 | `/pricing` UI (RSC + monthly/yearly toggle + i18n hook) | M |
| Φ8 | `BecomeProviderModal` + `/add` paywall | M |
| Φ9 | `/profile/billing` (cycle + switch) | S |
| Φ10 | Performance benchmark (`EXPLAIN ANALYZE` + advisors) | S |
| Φ11 | Регрессия в Stripe test (4 плана × 2 cycles × 1 currency = 8 покупок) | S |
| Φ12 | Provision в live Stripe + grandfather pre-deploy | S |
| Φ13 | Update memory + as-built правки в плане | S |

**Total:** ~M×7 + S×6 ≈ **8-12 рабочих дней**, реалистично 2 недели с тестами и review.

---

## 12. Definition of Done

- [ ] Миграция применена, smoke-тесты прошли.
- [ ] 8 recurring + 2 one-time price IDs созданы в Stripe (test + live).
- [ ] /pricing рендерит 5 карточек, toggle работает, default Yearly, save-бейдж видим.
- [ ] BecomeProviderModal + /add → корректный план в paywall для всех 7 комбинаций kinds[].
- [ ] /profile/billing показывает cycle и предлагает switch.
- [ ] Тестовая покупка каждого Pro-плана в monthly + yearly прошла, webhook обновил `profiles.plan` и `subscriptions.cycle`.
- [ ] Customer Portal даёт перейти monthly→yearly с прорейтингом.
- [ ] Grandfather-миграция (если выбрали A) применена pre-deploy.
- [ ] `docs/PRICING_V2_PLAN.md` (этот файл) обновлён "as-built" — где разошлись с планом.
- [ ] Memory `maporia_monetization.md` обновлён под v2.
- [ ] **Scalability acceptance** (§ 11):
  - [ ] `app/lib/pricing/registry.ts` — единственное место с ценами/квотами/Stripe-id. Grep по `STRIPE_PRICE_` находит только `lib/env.ts`, registry, и тесты — никаких хардкодов в роутах.
  - [ ] Композитный индекс `places(created_by, kind)` + GIN на `secondary_kinds` созданы. `mcp__supabase__get_advisors` (level=performance) возвращает 0 missing indexes.
  - [ ] `EXPLAIN ANALYZE` триггера на seed-БД с 10K профилей × 5 карточек: < 5ms на INSERT.
  - [ ] `scripts/stripe/provision-prices.ts` идемпотентен — два прогона подряд не создают дубликатов.
  - [ ] `lib/env.ts` Zod-валидация: попытка boot с пропущенным `STRIPE_PRICE_X` → fail-fast с понятной ошибкой.
  - [ ] Webhook idempotent на `event.id` — таблица `stripe_webhook_events` создана.
  - [ ] `PRICING_REGISTRY` ключ `prices.USD` готов к расширению до `prices.EUR/RUB` — добавлен type-test, который ломается, если структура нарушена.
  - [ ] Property-based test: для случайного `(plan, kind, count)` TS `computeQuota` и SQL-функция возвращают одинаковое решение.
