# Stripe Setup для Maporia

Один скрипт, один запуск — Stripe настроен.

## Что он делает

1. Создаёт 5 продуктов в Stripe: Premium, Pro Service, Pro Experience, Pro All, Extra Listing.
2. Создаёт 5 цен (`$35 one-time`, `$14.99/mo` × 2, `$34.99/mo`, `$2.99 one-time`).
3. Создаёт webhook endpoint с пятью нужными событиями (если передан URL).
4. Создаёт Customer Portal конфиг (если ещё нет).
5. Печатает env-переменные готовые к копированию в Vercel.
6. Опционально — заливает их в Vercel через `vercel env add`.

**Идемпотентен** — повторный запуск не дублирует. Цены матчатся по `lookup_key`, продукты — по `metadata.maporia_id`.

## Запуск (test mode)

```bash
STRIPE_SECRET_KEY=sk_test_XXXXX npm run setup:stripe -- \
  --webhook-url=https://YOUR-PREVIEW.vercel.app/api/stripe/webhook
```

Скрипт распечатает что-то вроде:

```
📋 Env vars:
STRIPE_PRICE_PREMIUM_ONETIME=price_1AbCd…
STRIPE_PRICE_CREATOR_SERVICE_MONTH=price_1AbCd…
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=price_1AbCd…
STRIPE_PRICE_CREATOR_ALL_MONTH=price_1AbCd…
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

Проверь что в Vercel `STRIPE_SECRET_KEY` тоже залит (тот же ключ что юзал в скрипте). Скрипт его сам не льёт — это для безопасности.

## Smoke-тест

После настройки запусти `npm run dev`, открой `/pricing`, нажми «Subscribe» на Pro Service, в Stripe Checkout вбей тестовую карту `4242 4242 4242 4242` (любая дата, любой CVC). Должен пройти редирект на `/profile?section=premium?payment=success` и через ~5–10 секунд (webhook догоняет) увидишь активный план.

Карты для разных сценариев — https://docs.stripe.com/testing.

## Если что-то пошло не так

- **Скрипт упал на webhook**: убедись что `--webhook-url` начинается с `https://` (Stripe не принимает http).
- **Customer Portal config skipped**: один раз нужно открыть Stripe Dashboard → Settings → Billing → Customer Portal, нажать «Activate», и сохранить. После этого можешь либо запустить скрипт ещё раз, либо настроить руками — это ~30 секунд кликов.
- **Webhook не приходит**: проверь что `STRIPE_WEBHOOK_SECRET` залит в Vercel **той же среды** где endpoint URL хостится. Test ↔ test, live ↔ live.
