# Maporia — Монетизация

Окончательная модель:

- **Sale-side**: каталог. Maporia не держит деньги клиентов и не делает payouts. Сделка между потребителем и поставщиком — снаружи (по `place.link`, мессенджер, телефон).
- **Buy-side**: 4 платных тарифа + add-on за докупку слотов.

⚠️ Я не финансовый и не юридический консультант — формулировки в Terms / Privacy и налоговую сторону провалидируй с юристом.

## 1. Тарифная сетка

| Тариф | Цена | Период | Что даёт |
|---|---|---|---|
| **Free** | $0 | — | Гость / зритель публичных локаций |
| **Premium** | $35 | one-time | Видишь скрытые локации навсегда; можешь публиковать свои локации |
| **Pro Service** | $14.99 | / мес | Premium + публикация **5 услуг**. Сверх — $2.99 за карточку |
| **Pro Experience** | $14.99 | / мес | Premium + публикация **5 впечатлений**. Сверх — $2.99 за карточку |
| **Pro All** | $34.99 | / мес | Premium + **10 в сумме** (services + experiences). Сверх — $2.99 за карточку |
| **+1 слот** | $2.99 | one-time | Add-on. Прибавляет +1 к квоте навсегда (`profiles.bonus_listing_credits`) |

Premium ($35) **автоматически включён** в любой Pro-тариф через `hasPremium = isPaidPlan` в `getUserAccess`. Покупать Premium отдельно при активной Pro-подписке не нужно.

Логика лимитов:

- **Pro Service**: `service ≤ 5`, experiences = 0.
- **Pro Experience**: `experience ≤ 5`, services = 0.
- **Pro All**: `service + experience ≤ 10` (общий пул, любые комбинации).
- Лимит не сбрасывается каждый месяц — это «активные карточки в кабинете», а не «созданных в месяц».
- Удаление карточки освобождает слот.

## 2. Воронка от регистрации до платежа

```
Регистрация (free)
       │
       ├── смотрит публичные локации
       │
       ├── клик на скрытую → пейволл "Premium $35 один раз"
       │     └─→ /pricing → Stripe Checkout (one-time)
       │
       └── клик "+ Add" в табе:
              ┌──────────────────────────────────────────────┐
              │  Выбор: Locations / Services / Experiences   │
              └──────────────────────────────────────────────┘
                  │            │              │
                 location     service      experience
                  │            │              │
        ┌─────────┴────┐     ┌─┴─────────────┐
        │ есть Premium │     │ есть Pro?     │
        │ или Pro?     │     │ (по kind)     │
        └────┬─────────┘     └─┬─────────────┘
             │                  │
   нет ─→ paywall: Premium     нет ─→ paywall:
   да  ─→ редактор             Pro Service / Pro Experience
                                │
                              да ─→ count активных карточек
                                       │
                            под лимитом ─→ редактор
                            над лимитом ─→ модалка:
                                            +1 слот за $2.99 (one-time)
                                            или сменить тариф
```

Ключевые точки конверсии в коде:

- **LockedPlaceOverlay** (уже работает) — сюда попадает гость/standard, который кликнул скрытую локацию.
- **`/add` PaywallModal** — нет права создавать этот kind.
- **`/add` LimitReachedModal** — право есть, но квота исчерпана: предлагает $2.99 add-on или upgrade.
- **`/pricing`** — публичная страница, открывается из всех точек выше.

## 3. Что реализовано в этом раунде ✅

### База данных
Две применённые миграции:

1. **`add_subscription_plans_and_history`**:
   - `profiles.plan` (CHECK + индекс), `plan_period`, `plan_renews_at`.
   - Таблица `subscriptions(user_id, plan, period, status, stripe_*, current_period_end, ...)`.
   - RLS: пользователь видит свои подписки, пишет туда только service role (webhook).
   - Бэкфилл: legacy lifetime юзеры → `plan='premium_viewer', period='lifetime'`.

2. **`add_bonus_listing_credits`**:
   - `profiles.bonus_listing_credits int DEFAULT 0` — счётчик докупленных слотов.

### Конфиг тарифов (`app/lib/plans.ts`)
- `PLAN_CONFIG` — единый источник правды: цены, фичи, env-переменные Stripe, тип billing (`one_time` для Premium / `subscription` для Pro), квота по kind'у.
- `EXTRA_LISTING` — конфиг add-on $2.99.
- `quotaFor(plan, kind)` — учитывает combined-pool для Pro All.

### Логика прав (`app/lib/access.ts`)
- `getUserAccess(profile)` возвращает `plan` в UserAccess.
- `canUserCreate(access, kind)` — гранулярные права по типу.
- `checkQuota(access, kind, services, experiences, credits)` — возвращает `{allowed, limit, used, bonusCredits, reason}`. Учитывает combined-pool на Pro All и докупленные слоты.

### UI
- **`/pricing`** — 4 карточки тарифов (Premium / Pro Service / Pro Experience / Pro All) + блок add-on $2.99 в подвале.
- **`/profile/billing`** — личный кабинет: текущий план, дата renew, кнопка Stripe Customer Portal (для подписок).
- **`/add`**:
  - PaywallModal — если нет права на kind.
  - LimitReachedModal — если квота исчерпана. Две CTA: «+1 слот за $2.99» (one-time) и «Сменить тариф».

### API
- **POST `/api/stripe/checkout`** — резолвит цену по `{plan}` или `{addon: 'extra_listing'}`. Premium = `mode: payment`, Pro = `mode: subscription`. Legacy fallback на `STRIPE_PRICE_ID` сохранён.
- **POST `/api/stripe/portal`** — Stripe Customer Portal.
- **POST `/api/stripe/webhook`** — обрабатывает:
  - `checkout.session.completed` для Premium (lifetime) и для add-on (`metadata.kind === 'extra_listing'` → `bonus_listing_credits += 1`).
  - `customer.subscription.created/updated/deleted` — для Pro-тарифов.
  - `invoice.payment_failed` → status='past_due'.

## 4. Что нужно настроить вручную в Stripe

### Продукты и Prices

| Продукт | Тип | Цена | ENV |
|---|---|---|---|
| Premium | one-time | $35 | `STRIPE_PRICE_PREMIUM_ONETIME` (можно оставить старый `STRIPE_PRICE_ID` как алиас) |
| Pro Service | recurring monthly | $14.99 | `STRIPE_PRICE_CREATOR_SERVICE_MONTH` |
| Pro Experience | recurring monthly | $14.99 | `STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH` |
| Pro All | recurring monthly | $34.99 | `STRIPE_PRICE_CREATOR_ALL_MONTH` |
| +1 listing | one-time | $2.99 | `STRIPE_PRICE_EXTRA_LISTING` |

### Webhook
Endpoint: `https://<домен>/api/stripe/webhook`. События:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

`whsec_…` → `STRIPE_WEBHOOK_SECRET`.

### Customer Portal
В **Settings → Billing → Customer portal**: включить отмену, смену тарифа, обновление карты.

### Stripe Tax
Включи если нужен авто-VAT по странам.

## 5. Что не сделано — следующий раунд

| Шаг | Зачем | Сложность |
|---|---|---|
| Серверная защита от обхода квоты | Сейчас count считается на клиенте перед insert. Юзер с DevTools может отправить insert напрямую. Нужен RPC `create_place_with_quota_check` или edge function | M |
| Расход `bonus_listing_credits` при insert | Сейчас credits только увеличиваются через webhook. Нужно decrement при insert карточки сверх плана | S |
| Edit-страницы `/places/[id]/edit/price` и `/edit/schedule` | Чтобы поставщик редактировал цены/расписание из UI | S |
| Карточки «Цена» и «Расписание» в хабе редактора | Сейчас новые поля редактируются только через SQL | S |
| Onboarding после регистрации | «Я ищу места» / «Я создаю» — задаёт первый touchpoint | S |
| Замочек `LockedPlaceOverlay` для скрытых service/experience | Сейчас работает только для location | S |
| Email-уведомления (past_due, успешная оплата) | Stripe умеет сам, но кастомные триггеры повышают retention | M |
| Аналитика когорт по подпискам | `subscriptions` таблица есть — нужен SQL view + дашборд | M |
| Локализация EN | Биллинг-UI на русском | S |

## 6. Риски

- **Обход лимита через клиент** — главный риск этой версии. Кто-то с DevTools и базовым опытом сможет создать N карточек, обойдя проверку. Серверный CHECK через RPC — приоритет №1 в следующем раунде.
- **`bonus_listing_credits` пока не списывается** — webhook добавляет +1, но логика «используй сначала credit, потом план» в `/add` пока считает их как обычный лимит. Нужно decrement в момент insert.
- **Past_due** — пока юзер в просрочке, оставляем ему права. Stripe ретраит ~3 недели, потом приходит `customer.subscription.deleted` → план → `free`.
- **DSA / DMCA** — каталог пользовательского контента требует процедуру жалоб. В этом раунде не делал.
- **Платежи в RUB / KZT** — Stripe в РФ не работает; для русскоязычной аудитории нужен альтернативный процессор (ЮKassa и т.д.) — отдельный большой блок.

## 7. Где смотреть

- `app/lib/plans.ts` — все цены, лимиты, env Stripe.
- `app/lib/access.ts` — права (`canUserCreate`, `checkQuota`, `getUserAccess`).
- `app/pricing/page.tsx` — публичная страница тарифов.
- `app/(auth)/profile/billing/page.tsx` — личный кабинет.
- `app/(auth)/add/page.tsx` — выбор kind + 2 модалки (PaywallModal, LimitReachedModal).
- `app/api/stripe/{checkout,portal,webhook}/route.ts` — биллинг-API.
- Миграции: `add_place_kind_and_pricing_fields`, `add_subscription_plans_and_history`, `add_bonus_listing_credits`.
