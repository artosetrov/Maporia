# Stripe v3 migration — Pro Creator + Pro All-in repricing

> Дополняет `docs/PRICING_V3_CREATOR_MERGE.md`. Тот документ описывает продукт и код Maporia.
> Этот — описывает **только Stripe-сторону**: что и в каком порядке прогнать, чтобы кнопки
> Downgrade / Switch на /profile?section=premium перестали падать с
> `Stripe Price ID is not set for plan=creator_pro cycle=...`.
>
> Дата: 2026-05-12. Автор: разбор инцидента после v3 merge.

---

## 0. Симптом и корень проблемы

**Симптом:** на /profile?section=premium при тоггле Yearly клик «Downgrade» по карточке Pro Creator
показывает красный текст `Stripe Price ID is not set for plan=creator_pro cycle=year. Define env
STRIPE_PRICE_CREATOR_PRO_YEAR.`

**Корень:** PRICING v3 (2026-05-11) добавил план `creator_pro` и снизил `creator_all` с $34.99 до
$19.99 в `app/lib/pricing/registry.ts`, но **Stripe-сторона никогда не догонялась**:

1. `scripts/setup-stripe.mjs` всё ещё содержит только v2 PLANS (нет `creator_pro`, `creator_all` указан
   с amount=3499/33588 ¢).
2. В Stripe Dashboard нет Price'ов для Pro Creator → ENV пустые → `resolvePriceId` бросает
   `PriceNotConfiguredError` → 503 `MISSING_PLAN_PRICE`.
3. Customer Portal allowed-products whitelist не знает про новый product — даже после фикса (1)
   Stripe Portal откажется применять `subscription_update_confirm` с creator_pro price.
4. Активные подписчики на `creator_all` биллятся по старому $34.99 price_id, а UI показывает $19.99
   (рассинхрон UI ↔ Stripe).

Скрипты `scripts/stripe/provision-prices.ts` и `scripts/stripe/migrate-all-in-to-v3.ts`, обещанные в
`docs/PRICING_V3_CREATOR_MERGE.md` §5.1 и §7.2, в репо отсутствовали.

---

## 1. Изменения, которые добавляются в репо этим PR

| Файл | Что | Зачем |
|---|---|---|
| `scripts/setup-stripe.mjs` | + `creator_pro` (month/year), `creator_all` → $19.99/$191.88 c lookup_key suffix `_v3`, `creator_service`/`_experience` помечены `legacy: true` | Provision Stripe products + prices, идемпотентно |
| `scripts/migrate-all-in-to-v3.mjs` | Новый скрипт: находит active subs со старым $34.99 price и переключает их на новый $19.99 price | Чтобы grandfathered $34.99 подписчики не остались под старой ценой после ENV-swap |
| `scripts/all-in-precheck.sql` | Read-only SQL: 7 диагностических запросов (counts по легаси, candidate-list, orphan-проверка, profile↔sub mismatch, MRR delta) | Pre-flight перед Φ1, оценка blast radius |
| `scripts/notify-all-in-repricing.mjs` | Резендит письмо «we lowered your price» через Resend API клиентам с metadata `pricing_v3_migrated_at` | Прозрачность с подписчиками после Φ3 |
| `docs/email-templates/all-in-repricing-notice.md` | Шаблон письма (subject + plain + html, плейсхолдер `{{first_name}}`) | Текст вынесен из скрипта, чтобы менять без правки кода |
| `docs/STRIPE_V3_MIGRATION_PLAN.md` | Этот файл | Runbook + чек-лист |

`app/lib/pricing/registry.ts` **не трогаем** — он уже v3-корректный.
ENV-имена (`STRIPE_PRICE_CREATOR_ALL_MONTH/_YEAR`) тоже **не переименовываем** — после миграции они
будут указывать на новые price_id, и `resolvePlanByPriceId` корректно отрезолвит подписки.

---

## 2. План выполнения (в этом порядке!)

Порядок критичен: `migrate-all-in` должна пройти **до** обновления Vercel ENV, иначе временный
период между «новые Prices созданы» и «active subs ещё на старых» не нарушит ничего, а вот наоборот —
сразу обновить ENV — приведёт к тому, что `resolvePlanByPriceId` на webhook'е renewal'а старых
$34.99 подписок вернёт `null`, и план юзера сбросится на `free`.

### Φ0 — Pre-check blast radius (1 min, перед всем)

Прогнать `scripts/all-in-precheck.sql` целиком (через Supabase SQL Editor или MCP). Файл содержит 7
read-only запросов. Главные числа:

- **§1** — counts активных подписок по legacy + creator_all. Если `creator_all` count = 0, шаги Φ3
  (migrate-all-in) можно пропустить — мигрировать некого.
- **§3** — список candidate-юзеров для миграции с `current_period_end` (когда их следующий billing).
- **§7** — MRR delta (сколько мы недополучим в month после переключения на $19.99 — потенциально
  компенсируется новыми подписчиками).
- §4–§5 — sanity-проверки на orphan/mismatch между `profiles.plan` и `subscriptions`. Если что-то
  найдётся — отдельный фикс, миграцию не блокирует, но стоит знать.

### Φ1 — Test mode: создать новые Stripe Prices

```bash
cd /path/to/maporia
STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs
```

Скрипт идемпотентен. На stdout — список ENV-имён и новых price_id для копирования. Должны появиться:

- `STRIPE_PRICE_CREATOR_PRO_MONTH` = `price_...` (новый product Pro Creator, $14.99)
- `STRIPE_PRICE_CREATOR_PRO_YEAR` = `price_...` (Pro Creator, $143.88)
- `STRIPE_PRICE_CREATOR_ALL_MONTH` = `price_...` (новый Pro All-in, $19.99 — lookup_key `maporia_pro_all_month_v3`)
- `STRIPE_PRICE_CREATOR_ALL_YEAR` = `price_...` (новый Pro All-in, $191.88)

Старые $34.99 prices (`maporia_pro_all_month` / `_year`) **остаются в Stripe активными** — их не
трогает скрипт. Они нужны до конца Φ3.

Customer Portal config обновится автоматически: `recurringPortalProducts` теперь включает
`creator_pro` product и оба варианта `creator_all` (старый и новый).

### Φ2 — Test smoke (1 user)

В test mode зарегистрировать юзера, оформить $34.99 (старый) Pro All-in (если ещё работает прежний
price), потом прогнать Φ3 для test mode, потом проверить даунгрейд на Pro Creator.

(Этот шаг можно скипнуть если test data пустой.)

### Φ3 — Test mode: мигрировать активные creator_all на новый price

```bash
# Dry-run сначала — показывает кто будет тронут, ничего не меняет
STRIPE_SECRET_KEY=sk_test_... node scripts/migrate-all-in-to-v3.mjs --dry-run

# Боевой прогон
STRIPE_SECRET_KEY=sk_test_... node scripts/migrate-all-in-to-v3.mjs
```

Скрипт:
1. Находит prices с lookup_key `maporia_pro_all_month` / `_year` (старые).
2. Находит новые с lookup_key `maporia_pro_all_month_v3` / `_year_v3`.
3. Идёт по всем active+trialing subscriptions со старым price.
4. Для каждой делает `stripe.subscriptions.update({items:[{id, price: NEW_ID}]}, proration_behavior: "none")`.
5. Логирует {sub_id, customer_id, old_price → new_price, status}.

`proration_behavior: "none"` важен — мы не списываем разницу, новая цена применится со следующего
billing cycle. Это договорённость из `PRICING_V3_CREATOR_MERGE.md` §7.2.

После прогона: каждая активная подписка триггерит webhook `customer.subscription.updated` →
`handleSubscriptionUpsert` → `resolvePlanByPriceId(NEW_ID)` → план остаётся `creator_all`, period
тот же. (Это сработает только если Vercel ENV ещё на старых ID — webhook должен иметь возможность
резолвить ОБА. См. Φ4 ниже.)

⚠️ **Важно:** webhook резолвит price_id через `process.env[stripeIdEnv]`. До Φ4 ENV указывает на
**старый** price_id, поэтому новый price_id (на который мы только что переключили подписку) webhook
не резолвит → план сбросится на `free`.

**Поэтому Φ3 и Φ4 должны идти как одна транзакция:** сначала Φ4 (обновить ENV в Vercel и задеплоить),
**потом** Φ3 (migrate). Иначе webhook съест данные.

Корректный порядок:

```
Φ1  setup-stripe.mjs (test)       → создал prices
Φ4t Vercel preview ENV update      → preview обновлён, prod ещё на старом
Φ3t migrate-all-in (test mode)     → переключил test subs
Φ2  smoke test on preview          → даунгрейд работает
Φ1l setup-stripe.mjs (live)        → создал prices в live
Φ4l Vercel production ENV update   → prod обновлён
Φ3l migrate-all-in (live)          → переключил live subs (если есть)
```

(Я ошибся выше, исправил порядок здесь. Φ3 идёт после Φ4.)

### Φ4 — Обновить Vercel ENV и задеплоить

Через Vercel Dashboard (Settings → Environment Variables) или CLI:

```bash
echo "$STRIPE_PRICE_CREATOR_PRO_MONTH_value" | vercel env add STRIPE_PRICE_CREATOR_PRO_MONTH production --force
echo "$STRIPE_PRICE_CREATOR_PRO_YEAR_value"  | vercel env add STRIPE_PRICE_CREATOR_PRO_YEAR production --force
echo "$STRIPE_PRICE_CREATOR_ALL_MONTH_value" | vercel env add STRIPE_PRICE_CREATOR_ALL_MONTH production --force
echo "$STRIPE_PRICE_CREATOR_ALL_YEAR_value"  | vercel env add STRIPE_PRICE_CREATOR_ALL_YEAR production --force
```

Повторить с `preview` target для preview-окружения.

Затем: `vercel --prod` (или дождаться auto-deploy от git push).

### Φ5 — Production smoke (после Φ4l и Φ3l)

1. На /pricing — карточки рендерят 4 плана, Pro All-in $19.99/mo, Pro Creator $14.99/mo.
2. На /profile?section=premium у юзера с Pro All-in — кликнуть Downgrade на Pro Creator yearly →
   редирект в Stripe Portal `subscription_update_confirm`.
3. Подтвердить → редирект назад на /profile?section=premium&payment=success.
4. Webhook `customer.subscription.updated` пришёл → `subscriptions` row обновлена → `profiles.plan =
   creator_pro`.
5. На /profile видно «Current plan: Pro Creator».

### Φ6 — Уведомить подписчиков (после успешного Φ3l)

```bash
# dry-run: показывает кому будет письмо, ничего не шлёт
STRIPE_SECRET_KEY=sk_live_... node scripts/notify-all-in-repricing.mjs

# боевая отправка через Resend (домен @maporia.co должен быть verified)
STRIPE_SECRET_KEY=sk_live_... RESEND_API_KEY=re_... node scripts/notify-all-in-repricing.mjs --send
```

Скрипт находит подписки с `metadata.pricing_v3_migrated_at` (его проставляет
`migrate-all-in-to-v3.mjs`) → дедуплицирует по customer → шлёт письмо по шаблону
`docs/email-templates/all-in-repricing-notice.md`. Локальный лог `scripts/.notify-all-in-sent.json`
дедуплицирует повторные прогоны. Файл в .gitignore — не коммитим (содержит email'ы).

Subject: «Good news — your Maporia Pro All-in is now $19.99/mo». Текст в .md, можно поменять без
правки кода.

### Φ7 — Cleanup старых Stripe price'ов (опционально, через неделю)

После того как все активные creator_all мигрированы и уведомлены:

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/migrate-all-in-to-v3.mjs --deactivate-old
```

Этот флаг деактивирует старые price'ы `maporia_pro_all_month` / `_year` в Stripe. Скрипт сначала
перепроверяет, что на старом price нет ни одной active/trialing/past_due подписки — иначе откажет
с exit code 3. После деактивации никто не сможет случайно подписаться на $34.99.

---

## 3. ENV diff (что должно стать в Vercel)

| ENV | До | После |
|---|---|---|
| `STRIPE_PRICE_CREATOR_LOCATION_MONTH` | `price_...` | без изменений |
| `STRIPE_PRICE_CREATOR_LOCATION_YEAR`  | `price_...` | без изменений |
| `STRIPE_PRICE_CREATOR_SERVICE_MONTH`  | `price_...` | **оставляем** — нужен для grandfathered |
| `STRIPE_PRICE_CREATOR_SERVICE_YEAR`   | `price_...` | оставляем |
| `STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH` | `price_...` | оставляем |
| `STRIPE_PRICE_CREATOR_EXPERIENCE_YEAR` | `price_...` | оставляем |
| `STRIPE_PRICE_CREATOR_PRO_MONTH` | _(нет)_ | **новый** `price_...` ($14.99) |
| `STRIPE_PRICE_CREATOR_PRO_YEAR`  | _(нет)_ | **новый** `price_...` ($143.88) |
| `STRIPE_PRICE_CREATOR_ALL_MONTH` | `price_...` (старый $34.99) | **обновлён** на новый `price_...` ($19.99) |
| `STRIPE_PRICE_CREATOR_ALL_YEAR`  | `price_...` (старый $335.88) | обновлён на новый `price_...` ($191.88) |
| `STRIPE_PRICE_PREMIUM_ONETIME`   | без изменений | без изменений |
| `STRIPE_PRICE_EXTRA_LISTING`     | без изменений | без изменений |

---

## 4. Rollback

| Шаг | Откат |
|---|---|
| Φ1 (новые prices в Stripe) | Деактивировать новые prices в Dashboard, удалить лишние product'ы (если без подписок) |
| Φ3 (migrate-all-in) | Прогнать `migrate-all-in-to-v3.mjs --rollback` (не реализовано в первой версии; ручной откат: `stripe.subscriptions.update(sub_id, {items:[{id, price: OLD_ID}]}, proration_behavior:"none"}`). Risk: low — proration=none не двигает деньги. |
| Φ4 (Vercel ENV) | Вернуть старые price_id значения в Vercel ENV, передеплоить. Webhook resync произойдёт на следующем `customer.subscription.updated` (или ручной trigger). |

---

## 5. Связанные доки

- `docs/PRICING_V3_CREATOR_MERGE.md` — продуктовый план v3 (Φ-фазы для кода, Q1–Q5).
- `STRIPE_SETUP.md` — общая инструкция по Stripe для проекта.
- `app/lib/pricing/registry.ts` — single source of truth для тарифов.
- `app/lib/pricing/checkout.ts` — `resolvePriceId` / `resolvePlanByPriceId` / `PriceNotConfiguredError`.

---

## 6. Definition of Done

- [ ] `scripts/setup-stripe.mjs` содержит блоки `creator_pro` (×2) и обновлённый `creator_all` (×2 с
      lookup_key `_v3`).
- [ ] `scripts/migrate-all-in-to-v3.mjs` существует, поддерживает `--dry-run` и `--deactivate-old`.
- [ ] `scripts/all-in-precheck.sql` прогнан, blast radius известен.
- [ ] `scripts/notify-all-in-repricing.mjs` + `docs/email-templates/all-in-repricing-notice.md`
      существуют, dry-run выдаёт корректный candidate-list.
- [ ] Stripe (test mode): новые prices созданы, видны в Dashboard.
- [ ] Vercel preview env обновлён.
- [ ] Preview /pricing рендерит 4 карточки.
- [ ] Preview /profile?section=premium для тест-юзера на creator_all → downgrade на creator_pro yearly
      работает end-to-end (Portal → webhook → БД).
- [ ] Live: те же шаги повторены.
- [ ] Поле `Renews —` на CURRENT PLAN перестало быть «—» (если был баг — он рассосётся после next
      webhook на этой подписке). _Это сторонняя задача — отслеживать отдельно._

---

## 7. Журнал

> Заполняется по мере прохождения.

- 2026-05-12 — план и скрипты добавлены в репо (этот PR). Прогон против Stripe ещё не делал — нужен
  `STRIPE_SECRET_KEY` от тебя.
