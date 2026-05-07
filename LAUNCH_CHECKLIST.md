# Maporia Launch Checklist

Пошагово до live-Stripe и публичного запуска. Все нужные env-переменные и smoke-сценарии в одном месте.

⚠️ Сначала прогоняем **в test mode** (Stripe TEST + Vercel Preview). Live mode — после того как пройдёт весь чек-лист хотя бы один раз.

---

## Step 1 — Получить Stripe API ключ

1. Зайди в [https://dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys).
2. **Standard keys → Secret key** (под глазиком). Скопируй полностью. Должен начинаться с `sk_test_51…` и быть длинным.
3. Этот ключ должен жить **только** на твоём Mac и в Vercel env. Никуда больше — не клади в чат, не коммить в репо, не пиши в Slack.

---

## Step 2 — Активировать Customer Portal один раз

1. [https://dashboard.stripe.com/test/settings/billing/portal](https://dashboard.stripe.com/test/settings/billing/portal)
2. Нажать **Activate test link** (если ещё не активирован).
3. В блоке «Subscription cancellations» включить «Allow customers to cancel». В «Subscription updates» включить «Allow customers to switch plans» — это понадобится позже, когда добавишь Pro Service ↔ Pro All переключения.
4. **Save**.

(скрипт ниже попробует сам создать конфиг, но Stripe требует ручного Activate first.)

---

## Step 3 — Запустить setup-skript

В корне репо на твоём Mac:

```bash
cd "/Users/artosetrov/Documents/MY AI/maporia"
git pull --rebase

# Минимальный запуск — создаст продукты и цены, без webhook
STRIPE_SECRET_KEY=sk_test_51XXXXX npm run setup:stripe
```

Скрипт распечатает 5 env-переменных типа:

```
STRIPE_PRICE_PREMIUM_ONETIME=price_1Abc…
STRIPE_PRICE_CREATOR_SERVICE_MONTH=price_1Abc…
STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH=price_1Abc…
STRIPE_PRICE_CREATOR_ALL_MONTH=price_1Abc…
STRIPE_PRICE_EXTRA_LISTING=price_1Abc…
```

Скопируй эти строки — пригодятся в Step 5.

⚠️ Если упадёт `non-ASCII characters` — ты скопировал плейсхолдер с символом `…`. Возьми **реальный** ключ из Dashboard (sk_test_51 + длинная строка).

---

## Step 4 — Получить Vercel preview URL

Чтобы создать webhook endpoint, нужен реальный URL:

1. Открой Vercel → проект Maporia → последний preview deployment (на ветке `main`).
2. Скопируй URL вида `https://maporia-xxxxx.vercel.app`.

Если ещё не задеплоено — сделай `git push` на main (preview deployment появится автоматически), либо `vercel --prod` чтобы создать prod URL сразу.

---

## Step 5 — Прогнать setup-skript повторно с webhook

Идемпотентно — продукты не задублируются, добавится только webhook:

```bash
STRIPE_SECRET_KEY=sk_test_51XXXXX npm run setup:stripe -- \
  --webhook-url=https://YOUR-PREVIEW.vercel.app/api/stripe/webhook
```

Скрипт распечатает дополнительно:

```
📋 SAVE THIS — webhook signing secret:
STRIPE_WEBHOOK_SECRET=whsec_1Abc…
```

Этот `whsec_…` показывается **только один раз**. Скопируй немедленно.

---

## Step 6 — Залить env в Vercel

7 переменных (5 prices + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET):

### Вариант A — руками через Dashboard

Vercel → Project → Settings → Environment Variables → **Add new** для каждой. Environment: **Preview** (для теста). Значения из Step 3 + Step 5 + сам ключ.

### Вариант B — через Vercel CLI

В папке проекта (требует `vercel link` сделанным один раз ранее):

```bash
echo "sk_test_51XXXXX" | vercel env add STRIPE_SECRET_KEY preview
echo "whsec_1Abc…" | vercel env add STRIPE_WEBHOOK_SECRET preview
echo "price_1Abc…" | vercel env add STRIPE_PRICE_PREMIUM_ONETIME preview
echo "price_1Abc…" | vercel env add STRIPE_PRICE_CREATOR_SERVICE_MONTH preview
echo "price_1Abc…" | vercel env add STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH preview
echo "price_1Abc…" | vercel env add STRIPE_PRICE_CREATOR_ALL_MONTH preview
echo "price_1Abc…" | vercel env add STRIPE_PRICE_EXTRA_LISTING preview
```

Или одной командой через `--push-vercel` флаг скрипта (требует `vercel link` уже сделан):

```bash
STRIPE_SECRET_KEY=sk_test_51XXXXX npm run setup:stripe -- \
  --webhook-url=https://YOUR-PREVIEW.vercel.app/api/stripe/webhook \
  --push-vercel \
  --env=preview
```

---

## Step 7 — Redeploy preview

После того как залил env — Vercel **не пересобирает автоматически**. Нужен redeploy:

- Vercel → Deployments → у последнего preview нажать `…` → **Redeploy**.
- Или `git commit --allow-empty -m "redeploy" && git push`.

Дождаться зелёного билда.

---

## Step 8 — Smoke-тесты

5 сценариев. Используй тестовые карты Stripe:

- **Успех**: `4242 4242 4242 4242`, любая дата в будущем, любой CVC, любой ZIP.
- **Отказ**: `4000 0000 0000 0002` — generic decline.
- **3DS**: `4000 0025 0000 3155` — требует подтверждения.

Полный список — [https://docs.stripe.com/testing](https://docs.stripe.com/testing).

### Test 1 — Купить Premium ($35 one-time)

1. Зарегистрируйся новым аккаунтом.
2. `/pricing` → жми **Buy** на карточке Premium.
3. В Stripe Checkout вбей тестовую карту 4242…, submit.
4. Должен быть редирект на `/profile?section=premium&payment=success`.
5. Через ~5–10 секунд (webhook догоняет) `/profile?section=premium` должен показывать «Current plan: Premium · Lifetime».

**Что проверить через SQL:**
```sql
select plan, plan_period from public.profiles where id = 'твой_user_id';
-- Ожидание: plan='premium_viewer', plan_period='lifetime'
```

### Test 2 — Подписаться на Pro Service ($14.99/mo)

1. Другой аккаунт (или тот же — может купить и Premium, и Pro поверх).
2. `/pricing` → Pro Service → **Subscribe**.
3. Карта 4242…, submit.
4. Редирект на `/profile?section=premium&payment=success`.
5. Через ~10 сек: «Current plan: Pro Service · Monthly · Next charge: дата».
6. **Что проверить:**
```sql
select plan, plan_period from public.profiles where id = '...';
select status, plan, current_period_end from public.subscriptions where user_id = '...';
-- Ожидание: profiles.plan='creator_service', subscriptions row с status='active'.
```

### Test 3 — Создать 5 services и упереться в лимит

1. Аккаунт из Test 2 (Pro Service).
2. `/add` → Service → создать 5 раз. Карточки должны создаваться.
3. На 6-й попытке — модалка **«Services limit reached»** с CTA «+1 slot for $2.99» / «Switch plan» / «Not now».

### Test 4 — Купить +1 слот ($2.99 one-time)

1. На модалке «Services limit reached» → нажать **+1 slot for $2.99**.
2. Stripe Checkout, карта 4242…, submit.
3. Редирект на `/profile?section=premium&payment=success`.
4. **Что проверить:**
```sql
select bonus_listing_credits from public.profiles where id = '...';
-- Ожидание: 1
```
5. Вернуться в `/add` → Service → теперь должна позволить создать 6-ю.
6. После создания 6-й:
```sql
select bonus_listing_credits from public.profiles where id = '...';
-- Ожидание: 0 (decrement сработал)
```

### Test 5 — Cancel через Customer Portal

1. На любом активном подписанном аккаунте `/profile?section=premium` → **Manage / cancel**.
2. Должен редиректнуть на Stripe Customer Portal.
3. Кликнуть **Cancel plan**.
4. Закрыть портал. Подождать ~10 сек.
5. **Что проверить:**

При немедленной отмене (для test mode):
```sql
select plan, plan_period from public.profiles where id = '...';
select status, cancelled_at from public.subscriptions where user_id = '...';
-- Если ты выбрал «cancel at period end» — план остаётся active до конца периода.
-- Если «cancel immediately» (если включил в Portal config) — plan='free' сразу.
```

---

## Step 9 — Проверить /admin/billing

Залогинься админом → `/profile?section=premium` → должна быть секция **Admin → Billing** (если ты сделал админом). Либо открой `/admin/billing` напрямую.

Должны быть видны:
- Overview: 1+ paid users, 1+ active subscriptions, 1+ bonus credits если использовал Test 4.
- By plan: строки premium_viewer, creator_service с цифрами.
- Last 12 months: текущий месяц с new_count.

---

## Step 10 — Live mode

Когда test работает целиком — повтори Steps 1, 3, 5, 6 с **live key** и production webhook URL:

```bash
STRIPE_SECRET_KEY=sk_live_… npm run setup:stripe -- \
  --webhook-url=https://maporia.com/api/stripe/webhook \
  --push-vercel \
  --env=production
```

Не забудь redeploy production после env.

---

## Если что-то отваливается

| Симптом | Причина | Что делать |
|---|---|---|
| `MISSING_STRIPE_KEY` 503 на /pricing | env не залит в Vercel | Проверь Settings → Env Variables, redeploy |
| `MISSING_PLAN_PRICE` 503 | Один из STRIPE_PRICE_* не залит | Перезапусти setup-skript, скопируй **всю** пятёрку |
| Купил, а план не обновился | Webhook не долетел | Stripe → Developers → Webhooks → твой endpoint → **Events** — есть ли запись с error 4xx/5xx? |
| Webhook 401 invalid signature | `STRIPE_WEBHOOK_SECRET` не тот mode (test vs live) | Test secret для test endpoint, live для live |
| Quota check «no_plan» хотя план куплен | webhook не записал в profiles | Проверь `subscriptions` таблицу — есть ли строка? Если нет — webhook fail. Логи Vercel. |
| Customer Portal 400 «Portal is not enabled» | Не активировал в Step 2 | Зайди в Dashboard → Settings → Customer Portal → Activate |

Скидывай вывод ошибки — разберём.

---

## После лаунча

Когда живые юзеры начнут покупать:

- Watch `/admin/billing` → MRR / churn в первый месяц.
- Watch Stripe Dashboard → failed payments retries (Stripe ретраит автоматом 4 раза за 3 недели).
- Если кто-то жалуется «купил, доступ не открылся» — в первую очередь смотри Stripe → Webhook → Events → ошибки.
- Через ~30 платных юзеров возвращайся к Sprint 3 (multiple offerings + booking inquiries).
