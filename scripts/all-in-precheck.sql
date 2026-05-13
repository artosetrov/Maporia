-- scripts/all-in-precheck.sql
--
-- Read-only pre-check для Stripe v3 migration (см. docs/STRIPE_V3_MIGRATION_PLAN.md §Φ0).
--
-- Запуск:
--   - Через Supabase SQL Editor (project owgqntmgavexijwozyyx)
--   - Или: supabase MCP / psql, обязательно read-only.
--
-- Все запросы — SELECT, побочных эффектов нет. Безопасно гонять на проде.

-- ──────────────────────────────────────────────────────────────
-- 1. Активные подписки по плану + period.
--    Главное число: сколько creator_all нужно мигрировать в Stripe.
-- ──────────────────────────────────────────────────────────────
SELECT
  plan,
  period,
  status,
  COUNT(*) AS subs
FROM subscriptions
WHERE plan IN ('creator_service','creator_experience','creator_all')
  AND status IN ('active','past_due','trialing')
GROUP BY plan, period, status
ORDER BY plan, period, status;

-- ──────────────────────────────────────────────────────────────
-- 2. Legacy creator_service / creator_experience — не мигрируем (grandfathered),
--    но полезно знать, скольких людей затрагивает legacy-плашка в /profile/billing.
-- ──────────────────────────────────────────────────────────────
SELECT
  plan,
  period,
  COUNT(DISTINCT user_id) AS users
FROM subscriptions
WHERE plan IN ('creator_service','creator_experience')
  AND status = 'active'
GROUP BY plan, period
ORDER BY plan, period;

-- ──────────────────────────────────────────────────────────────
-- 3. Pro All-in candidates для migrate-all-in-to-v3.mjs.
--    Это и есть «кого скрипт миграции тронет» (он матчит по Stripe price_id,
--    но БД-side плана достаточно для оценки масштаба).
-- ──────────────────────────────────────────────────────────────
SELECT
  user_id,
  period,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  stripe_subscription_id,
  stripe_customer_id
FROM subscriptions
WHERE plan = 'creator_all'
  AND status IN ('active','past_due','trialing')
ORDER BY current_period_end ASC NULLS LAST;

-- ──────────────────────────────────────────────────────────────
-- 4. Sanity: ищем «orphans» — profile.plan='creator_all' без активной subscription row.
--    Если такие есть — webhook где-то пропустил субскрипшен или БД рассинхронизирована.
-- ──────────────────────────────────────────────────────────────
SELECT
  p.id AS user_id,
  p.plan AS profile_plan,
  p.plan_period AS profile_period,
  p.plan_renews_at,
  p.stripe_customer_id
FROM profiles p
LEFT JOIN subscriptions s
  ON s.user_id = p.id
 AND s.status = 'active'
WHERE p.plan = 'creator_all'
  AND s.id IS NULL;

-- ──────────────────────────────────────────────────────────────
-- 5. Sanity: profile.plan ≠ best active subscription.plan.
--    Если есть — `syncProfileToBestActiveSubscription` где-то не отработал.
-- ──────────────────────────────────────────────────────────────
WITH best_active AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    plan,
    period,
    current_period_end
  FROM subscriptions
  WHERE status = 'active'
  ORDER BY user_id,
           -- best == longest renewal in the future, fallback created_at
           current_period_end DESC NULLS LAST,
           created_at DESC NULLS LAST
)
SELECT
  p.id AS user_id,
  p.plan AS profile_plan,
  b.plan AS subscription_plan,
  p.plan_period,
  b.period AS subscription_period
FROM profiles p
JOIN best_active b ON b.user_id = p.id
WHERE p.plan <> b.plan OR COALESCE(p.plan_period,'') <> COALESCE(b.period,'');

-- ──────────────────────────────────────────────────────────────
-- 6. Sanity: подписки в past_due > 7 дней. Если есть — Stripe retry exhausted,
--    миграция таких отправит subscription.update, но списать $19.99 он всё равно не сможет.
--    Не критично, но стоит знать.
-- ──────────────────────────────────────────────────────────────
SELECT
  user_id,
  plan,
  status,
  current_period_end,
  stripe_subscription_id
FROM subscriptions
WHERE status = 'past_due'
  AND current_period_end < (now() - interval '7 days')
ORDER BY current_period_end ASC;

-- ──────────────────────────────────────────────────────────────
-- 7. Сумма ARR change (только информативно, без денежной транзакции).
--    Сколько недополучим MRR после переключения на $19.99.
--    Активные monthly creator_all × ($34.99 - $19.99) + yearly × ($335.88 - $191.88) / 12
-- ──────────────────────────────────────────────────────────────
SELECT
  SUM(CASE WHEN period = 'month' THEN 1 ELSE 0 END) AS active_monthly,
  SUM(CASE WHEN period = 'year'  THEN 1 ELSE 0 END) AS active_yearly,
  -- MRR delta in USD (negative = revenue we give up; new subs at $19.99 backfill this).
  -- monthly: -$15 per sub. yearly amortized: -$12/mo per sub.
  (SUM(CASE WHEN period = 'month' THEN 1 ELSE 0 END) * -15.00)
   + (SUM(CASE WHEN period = 'year' THEN 1 ELSE 0 END) * -12.00) AS mrr_delta_usd
FROM subscriptions
WHERE plan = 'creator_all'
  AND status IN ('active','trialing');
