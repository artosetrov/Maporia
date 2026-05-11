# Stripe Setup для Maporia

Один скрипт, один запуск — Stripe настроен.

Источник правды по тарифам в коде: `app/lib/pricing/registry.ts`.

## Что он делает

1. Создаёт продукты в Stripe: Premium, Pro Location, Pro Service, Pro Experience, Pro All, Extra Listing.
2. Создаёт цены для всех public plan variants: one-time Premium, monthly/yearly Pro plans, one-time Extra Listing.
3. Создаёт webhook endpoint с пятью нужными событиями (если передан URL).
4. Создаёт Customer Portal конфиг (если ещё нет).
5. Печатает env-переменные готовые к копированию в Vercel.
6. Опционально — заливает их в Vercel через `vercel env add`.

**Идемпотентен** — повторный запуск не дублирует. Цены матчатся по `lookup_key`, продукты — по `metadata.maporia_id`.

## Текущая сетка тарифов

| Plan ID | Stripe product | Price | Billing | Env |
| --- | --- | ---: | --- | --- |
| `premium_viewer` | Maporia Premium | $35 | one-time | `STRIPE_PRICE_PREMIUM_ONETIME` |
| `creator_location` | Maporia Pro Location | $9.99 / $95.88 | monthly/yearly subscription | `STRIPE_PRICE_CREATOR_LOCATION_MONTH`, `STRIPE_PRICE_CREATOR_LOCATION_YEAR` |
| `creator_service` | Maporia Pro Service | $14.99 / $143.88 | monthly/yearly subscription | `STRIPE_PRICE_CREATOR_SERVICE_MONTH`, `STRIPE_PRICE_CREATOR_SERVICE_YEAR` |
| `creator_experience` | Maporia Pro Experience | $14.99 / $143.88 | monthly/yearly subscription | `STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH`, `STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR` |
| `creator_all` | Maporia Pro All-in | $34.99 / $335.88 | monthly/yearly subscription | `STRIPE_PRICE_CREATOR_ALL_MONTH`, `STRIPE_PRICE_CREATOR_ALL_YEAR` |
| `extra_listing` | Maporia Extra Listing | $2.99 | one-time add-on | `STRIPE_PRICE_EXTRA_LISTING` |

`STRIPE_PRICE_ID` остаётся legacy fallback для старого one-time Premium checkout. Для новых флоу используй plan/addon env выше.

## Запуск (test mode)

```bash
STRIPE_SECRET_KEY=sk_test_XXXXX npm run setup:stripe -- \
  --webhook-url=https://YOUR-PREVIEW.vercel.app/api/stripe/webhook
```

Скрипт распечатает что-то вроде:

```
📋 Env vars:
STRIPE_PRICE_PREMIUM_ONETIME=price_1AbCd…
STRIPE_PRICE_CREATOR_LOCATION_MONTH=price_1AbCd…
STRIPE_PRICE_CREATOR_LOCATION_YEAR=price_1AbCd…
STRIPE_PRICE_CREATOR_SERVICE_MONTH=price_1AbCd…
STRIPE_PRICE_CREATOR_SERVICE_YEAR=price_1AbCd…
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=price_1AbCd…
STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR=price_1AbCd…
STRIPE_PRICE_CREATOR_ALL_MONTH=price_1AbCd…
STRIPE_PRICE_CREATOR_ALL_YEAR=price_1AbCd…
STRIPE_PRICE_EXTRA_LISTING=price_1AbCd…

📋 SAVE THIS — webhook signing secret:
STRIPE_WEBHOOK_SECRET=whsec_…
```

## Залить в Vercel

Вариант 1 — вручную: скопируй из вывода скрипта, открой Vercel → Project → Settings → Environment Variables, вставляй по одной.

Вариант 2 — автоматически (если `vercel link` уже был сделан в этой папке):

```bash
STRIPE_SECRET_KEY=sk_test_XXXXX npm run setup:stripe -- \
  --webhook-url=https://YOUR-PREVIEW.vercel.app/api/stripe/webhook \
  --push-vercel \
  --env=preview
```

Для production — поменяй `--env=production` и используй `sk_live_…`:

```bash
STRIPE_SECRET_KEY=sk_live_XXXXX npm run setup:stripe -- \
  --webhook-url=https://maporia.com/api/stripe/webhook \
  --push-vercel \
  --env=production
```

## После запуска

Проверь, что в Vercel залиты:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PREMIUM_ONETIME=
STRIPE_PRICE_CREATOR_LOCATION_MONTH=
STRIPE_PRICE_CREATOR_LOCATION_YEAR=
STRIPE_PRICE_CREATOR_SERVICE_MONTH=
STRIPE_PRICE_CREATOR_SERVICE_YEAR=
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=
STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR=
STRIPE_PRICE_CREATOR_ALL_MONTH=
STRIPE_PRICE_CREATOR_ALL_YEAR=
STRIPE_PRICE_EXTRA_LISTING=
```

Скрипт сам не льёт `STRIPE_SECRET_KEY` и `STRIPE_WEBHOOK_SECRET` — это для безопасности. `STRIPE_SECRET_KEY` должен быть тем же ключом test/live режима, в котором созданы prices.

## Webhook events

Endpoint `/api/stripe/webhook` должен получать:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
```

Что обновляется:

- Premium one-time: `profiles.plan = premium_viewer`, `plan_period = lifetime`, legacy `subscription_status = active`.
- Extra Listing: `profiles.bonus_listing_credits += 1`.
- Creator subscriptions: upsert в `subscriptions` и denormalized `profiles.plan`, `plan_period`, `stripe_customer_id`.
- Cancel/payment failed: subscription status и profile plan приводятся к актуальному состоянию webhook handler.

## Checkout payloads

Новые флоу должны вызывать `POST /api/stripe/checkout` с `access_token` и одним из вариантов:

```json
{ "access_token": "...", "plan": "premium_viewer" }
```

```json
{ "access_token": "...", "plan": "creator_service" }
```

```json
{ "access_token": "...", "addon": "extra_listing" }
```

Поддерживаемые plans: `premium_viewer`, `creator_location`, `creator_service`, `creator_experience`, `creator_all`.

Поддерживаемый addon: `extra_listing`.

Важно: Stripe операции запрещены во время admin impersonation.

Если у пользователя уже есть активная recurring subscription, `POST /api/stripe/checkout`
не создаёт новый Checkout. Для switch/upgrade/downgrade он создаёт Stripe Billing
Portal `subscription_update_confirm` deep link на конкретный target price. Stripe
показывает confirmation screen с upcoming invoice/proration credit, поэтому downgrade
пересчитывается по оставшемуся времени периода. Если у customer несколько активных
подписок, API открывает обычный Billing Portal, чтобы пользователь не поменял не ту
subscription.

Customer Portal должен разрешать subscription update для всех creator prices и иметь:

```text
subscription_update.proration_behavior = create_prorations
```

## Database expectations

Перед smoke-тестом убедись, что применены SQL-изменения для billing:

- `profiles.plan`
- `profiles.plan_period`
- `profiles.plan_renews_at`
- `profiles.stripe_customer_id`
- `profiles.bonus_listing_credits`
- `subscriptions`

Если этих колонок/таблиц нет, checkout может создаться, но webhook не сможет корректно активировать тариф.

## Smoke-тест

После настройки запусти `npm run dev`, открой `/pricing`, нажми «Subscribe» на Pro Service, в Stripe Checkout вбей тестовую карту `4242 4242 4242 4242` (любая дата, любой CVC). Должен пройти редирект на `/profile?section=premium&payment=success` и через ~5–10 секунд (webhook/verify догоняет) увидишь активный план.

Карты для разных сценариев — https://docs.stripe.com/testing.

## Если что-то пошло не так

- **Скрипт упал на webhook**: убедись что `--webhook-url` начинается с `https://` (Stripe не принимает http).
- **Customer Portal config skipped**: один раз нужно открыть Stripe Dashboard → Settings → Billing → Customer Portal, нажать «Activate», и сохранить. После этого можешь либо запустить скрипт ещё раз, либо настроить руками — это ~30 секунд кликов.
- **Webhook не приходит**: проверь что `STRIPE_WEBHOOK_SECRET` залит в Vercel **той же среды** где endpoint URL хостится. Test ↔ test, live ↔ live.
- **Checkout вернул `MISSING_PLAN_PRICE`**: не залит env для конкретного plan из таблицы выше.
- **Checkout вернул `IMPERSONATION_ACTIVE`**: выйди из impersonation, платежи под impersonation намеренно заблокированы.
- **После оплаты план не активировался**: проверь webhook delivery в Stripe Dashboard и логи `/api/stripe/webhook`.
