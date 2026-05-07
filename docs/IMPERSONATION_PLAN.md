# Admin Impersonation — план реализации

**Цель.** Админ из списка пользователей (`/profile?section=users` для is_admin) может одной кнопкой «зайти как» под любым пользователем, попасть в его сессию, проверить, что у него на экране, и одним кликом вернуться обратно в свой админский аккаунт. Stripe-операции под impersonation запрещены. Каждая сессия пишется в аудит-лог.

Решения по фичам зафиксированы заранее: **полный доступ** под пользователем (не read-only), **банер в шапке** для возврата, **блокировка Stripe**, **отдельная таблица аудита**.

---

## 1. Архитектура коротко

```
[Admin кликает «Войти как» в /profile users]
        │
        ▼
POST /api/admin/impersonate                                (server)
  ├── проверка is_admin/role у вызывающего
  ├── supabaseAdmin.auth.admin.getUserById(targetId)        ← резолвим email
  ├── supabaseAdmin.auth.admin.generateLink({               ← новый OTP под target
  │     type: 'magiclink', email
  │   })
  ├── INSERT в admin_impersonation_log → log_id
  ├── set HTTP-only cookies:
  │     admin_session_backup     = { access_token, refresh_token } (signed)
  │     impersonation_log_id     = log_id
  └── ответ: { properties: { hashed_token } }
        │
        ▼
client: supabase.auth.verifyOtp({                          (browser)
  type: 'magiclink',
  token_hash: hashed_token
})  → новая сессия в браузере = target user
        │
        ▼
window.location.href = '/'                                 ← начинаем под юзером

[В шапке висит ImpersonationBanner: «Вы вошли как X. Вернуться в админку.»]
        │
        ▼
POST /api/admin/impersonate/exit                           (server)
  ├── читает admin_session_backup
  ├── UPDATE admin_impersonation_log SET ended_at=now() WHERE id=cookie
  ├── возвращает { admin_access_token, admin_refresh_token }
  └── чистит обе cookie
        │
        ▼
client: supabase.auth.setSession({access_token, refresh_token})
        → reload → снова админ
```

**Почему такой механизм.** Supabase v2 не предоставляет «sign in as user by id» напрямую. Единственный безопасный путь, не трогая JWT-секрет, — `auth.admin.generateLink({ type: 'magiclink' })`, который возвращает свежий `hashed_token`. Клиент обменивает его на сессию через `verifyOtp`. Это штатный API, не хак.

**Почему нельзя положить admin токены в localStorage.** localStorage в браузере очищается, как только мы пишем туда новую сессию (target user). HTTP-only signed cookie с server-side не виден из JS — это правильное место для бэкапа.

---

## 2. Миграция `add_admin_impersonation_log`

```sql
create table public.admin_impersonation_log (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references auth.users(id),
  target_id    uuid not null references auth.users(id),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  ip           text,
  user_agent   text,
  reason       text                              -- опционально, на будущее
);

create index admin_impersonation_log_admin_idx  on public.admin_impersonation_log (admin_id, started_at desc);
create index admin_impersonation_log_target_idx on public.admin_impersonation_log (target_id, started_at desc);

alter table public.admin_impersonation_log enable row level security;

-- читать может только admin
create policy "admin_impersonation_log_select_admin"
  on public.admin_impersonation_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.is_admin = true or p.role = 'admin')
    )
  );

-- писать только service_role (через серверные routes)
-- (нет insert/update policy → anon/authenticated не могут)
```

Применить через `mcp__supabase__apply_migration`.

---

## 3. Серверные routes

### `app/api/admin/impersonate/route.ts` (POST)

Body: `{ targetUserId: string }`.

Шаги:
1. Auth: `Authorization: Bearer <session>` → `supabaseAdmin.auth.getUser(token)`.
2. Profile-check: `profiles.is_admin === true || role === 'admin'`. Иначе 403.
3. **Гард**: нельзя impersonate-ить самого себя; нельзя impersonate-ить другого админа без отдельного флага (на сейчас — просто запрет).
4. `supabaseAdmin.auth.admin.getUserById(targetUserId)` → `{ user: { email } }`.
5. `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })` → `{ properties: { hashed_token, action_link } }`.
6. INSERT в `admin_impersonation_log` (admin_id, target_id, ip из `request.headers.get('x-forwarded-for')`, user_agent).
7. Set cookies (через `cookies()` из `next/headers`):
   - `admin_session_backup` = `{ access_token, refresh_token }` админа из тела запроса (клиент шлёт их же в headers/body), **signed** через `crypto.createHmac('sha256', SUPABASE_JWT_SECRET ?? IMPERSONATION_COOKIE_SECRET)`. HttpOnly, Secure, SameSite=Lax.
   - `impersonation_log_id` = log_id. HttpOnly, Secure, SameSite=Lax.
8. Response: `{ tokenHash: hashed_token }`.

### `app/api/admin/impersonate/exit/route.ts` (POST)

1. Прочитать `admin_session_backup` cookie, проверить подпись.
2. UPDATE `admin_impersonation_log SET ended_at = now() WHERE id = impersonation_log_id`.
3. Очистить обе cookies (`Set-Cookie: ...; Max-Age=0`).
4. Response: `{ accessToken, refreshToken }` (тот, что был в backup).

### `app/api/admin/impersonate/status/route.ts` (GET)

Лёгкий эндпоинт для баннера: возвращает `{ active: boolean, targetEmail?: string, startedAt?: string }`. Использует `impersonation_log_id` cookie + JOIN на auth.users.

---

## 4. UI

### Кнопка «Войти как» в `app/(auth)/profile/page.tsx`

В JSX около строки 3656 (рядом с Delete Button), отдельная кнопка:
- иконка `login` или `eye` (надо проверить, есть ли в `Icon` компоненте)
- видна только когда `user.id !== currentUserId && !pendingRoleChanges.has(user.id)` и `!user.is_admin` (нельзя зайти под админом — оставим как future work)
- onClick → `handleImpersonate(userId)` → POST `/api/admin/impersonate` → `verifyOtp` → `window.location.href = '/'`.

Текст — на ховере title `«Войти под этим пользователем»`. Цвет — нейтральный border, не destructive.

### `ImpersonationBanner.tsx` в `app/components/`

- Server-side проверка через `cookies().get('impersonation_log_id')` в `app/layout.tsx` → если есть, рендерим `<ImpersonationBanner targetEmail={...} />`.
- Полоса жёлто-оранжевого цвета (warn-палитра, как `STATUS_COLORS.warn` из health-page) поверх контента, sticky top.
- Текст: «Вы вошли как **<email>**. <button>Вернуться в админку</button>».
- onClick → POST `/api/admin/impersonate/exit` → `supabase.auth.setSession({...})` → `window.location.href = '/profile?section=users'`.

Высота баннера ~44px. Отступ от верха main-контента нужно прибавить в layout, чтобы не уехала вёрстка `/map` и других sticky-headers.

---

## 5. Блокировка Stripe

В `app/api/stripe/checkout/route.ts` и `app/api/stripe/portal/route.ts` в начале handler-а:

```ts
import { cookies } from 'next/headers';
const isImpersonating = !!(await cookies()).get('impersonation_log_id');
if (isImpersonating) {
  return NextResponse.json(
    { error: 'Stripe operations are disabled in impersonation mode' },
    { status: 403 }
  );
}
```

Webhook `/api/stripe/webhook` **не трогаем** — он приходит от Stripe, а не от пользователя.

В UI (`/profile/billing`, `/pricing`, `LimitReachedModal`, `PaywallModal`) добавить серую плашку «В режиме impersonation покупки заблокированы» когда баннер активен. Минимально — пусть просто кнопка «Купить» 403-нится; UX можно полирнуть отдельной задачей.

---

## 6. Безопасность — что важно не упустить

1. **Подпись cookie**. `admin_session_backup` хранит refresh_token админа — без подписи можно подменить и получить чужую сессию. HMAC с серверным секретом.
2. **Запрет «admin → admin»**. Иначе можно спрятать действия за чужим админом.
3. **Запрет «target = self»**. Бессмысленный сценарий, лишний шум в логе.
4. **TTL на impersonation**. Если `started_at` старше 30 минут — серверные routes должны автоматически закрывать сессию (UPDATE ended_at). Защита от забытой вкладки.
5. **Аудит-лог нельзя удалить** — INSERT-only через service_role, RLS не даёт DELETE/UPDATE никому, кроме службы (UPDATE ended_at делается через service_role и через RPC, не напрямую).
6. **Заголовки Stripe-операций** — двойной чек: и cookie, и user_id из логов. Если impersonation активен и кто-то всё-таки дёргает Stripe API — 403.
7. **Не показывать Magic Link в URL/логах**. `hashed_token` отдаём только в JSON-ответе, никаких redirect-параметров.

---

## 7. Что остаётся за рамками этого плана

- Возможность impersonate другого admin (нужен отдельный «super-admin» флаг).
- UI-страница `/admin/impersonation-log` со списком сессий — пока смотрим в SQL.
- Telegram/Slack-уведомление об активной impersonation.
- Read-only режим (отдельный режим, требует совсем другой архитектуры — клиентский guard в SDK).

---

## 8. Файлы, которые меняются

| Файл | Что |
|---|---|
| `supabase/migrations/<ts>_add_admin_impersonation_log.sql` | новая миграция |
| `app/api/admin/impersonate/route.ts` | новый — POST start |
| `app/api/admin/impersonate/exit/route.ts` | новый — POST exit |
| `app/api/admin/impersonate/status/route.ts` | новый — GET для баннера |
| `app/lib/impersonation.ts` | helper: подпись/верификация cookie, isImpersonating(cookies) |
| `app/(auth)/profile/page.tsx` | кнопка «Войти как» в users-секции |
| `app/components/ImpersonationBanner.tsx` | новый компонент |
| `app/layout.tsx` | вкл. `<ImpersonationBanner />` через cookies() |
| `app/api/stripe/checkout/route.ts` | гард |
| `app/api/stripe/portal/route.ts` | гард |
| `app/types/supabase.ts` | тип таблицы admin_impersonation_log |
| `.env.example` | `IMPERSONATION_COOKIE_SECRET=...` |

Объём — около 350–500 строк нового кода + миграция.

---

## 9. Порядок внедрения

1. Миграция + типы.
2. Helper `lib/impersonation.ts` + 3 route-а.
3. Гарды в Stripe.
4. UI-кнопка в profile.
5. Баннер в layout.
6. `npm run check` локально (sandbox не может из-за FUSE).
7. Smoke-test вручную (см. task #6).

---

## 10. Открытые вопросы (не блокеры)

- Нужен ли «admin → admin» вообще? Если да — добавить чекбокс в подтверждении.
- TTL impersonation — 30 минут ок или меньше/больше?
- Нужен ли confirm-диалог перед началом сессии («Вы войдёте как <email>. Все действия будут залогированы.»)?
