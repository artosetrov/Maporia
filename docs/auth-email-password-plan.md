# Email + пароль: план интеграции

**Цель:** добавить регистрацию и вход через email+пароль поверх текущего auth-стека (Supabase Auth, magic link, Google OAuth). Magic link оставляем как альтернативу. Reset-password — в этом же подходе.

**Стек, что уже есть:**
- `app/lib/supabase.ts` — клиент с `flowType: 'pkce'`, `detectSessionInUrl: true`. Подходит для всех flow без правок.
- `app/auth/page.tsx` — единственная страница входа. Magic link + Google.
- `app/components/AuthModal.tsx` — модалка с тем же набором.
- `app/lib/authRedirect.ts` — `getAuthUrl(from)` возвращает `/auth?from=...`. После добавления `/login` и `/signup` поправим.
- `app/contexts/UserAccessContext.tsx` + `useUserAccess` — слушают `onAuthStateChange`, профили, доступы. Менять не надо.

---

## 1. Настройки Supabase Dashboard (без кода)

`project_id = owgqntmgavexijwozyyx`

1. **Authentication → Providers → Email**
   - Enable Email provider — ON.
   - Confirm email — **ON** (по решению Артёма).
   - Secure email change — ON.
   - Minimum password length — `8`.
2. **Authentication → URL Configuration**
   - Site URL: `https://maporia.co` (если ещё не стоит).
   - Redirect URLs (добавить если их нет):
     - `https://maporia.co/auth/callback`
     - `https://www.maporia.co/auth/callback`
     - `http://localhost:3000/auth/callback`
3. **Authentication → Email Templates**
   - "Confirm signup" — переписать текст под Maporia (RU/EN, единый стиль).
   - "Reset password" — то же.
   - В обоих шаблонах целевой URL формата `{{ .SiteURL }}/auth/callback?next=/`.

> Эти настройки делает пользователь руками в дашборде. Я делаю через MCP только то, что касается БД (миграции). Тут SQL не нужен — всё через UI.

---

## 2. Роутинг

| Path | Что делает |
|---|---|
| `/login` | Email + пароль, кнопка "Sign in", ссылка "Forgot password?", divider, "Continue with Google", внизу — "New here? Create account" → `/signup`. Доп. ссылка "Sign in with magic link" откроет fallback-режим. |
| `/signup` | Email + пароль + (опц.) confirm-password, кнопка "Create account", divider, Google, внизу — "Already have an account? Sign in" → `/login`. После сабмита показываем экран "Check your inbox" (так же как сейчас в `sent` state). |
| `/auth/reset` | Email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: …/auth/callback?next=/auth/update-password })`. После — экран "Check your inbox". |
| `/auth/update-password` | Поле "New password" + confirm. Доступно только когда есть активная recovery-сессия (Supabase ставит её через `detectSessionInUrl`). Шлёт `supabase.auth.updateUser({ password })`. |
| `/auth/callback` | Тонкая страница: ждёт, пока SDK подхватит токен из URL, читает `?next=` и редиректит. Решает race condition, который сейчас лечится самописным интервалом `setInterval(checkOrigin, 100)` в `/auth/page.tsx`. |
| `/auth` | Оставляем как redirect → `/login` (для обратной совместимости с `getAuthUrl`). |

**Все 5 страниц — `"use client"`**, но **тонкие**: бизнес-логика выносится в один общий компонент `AuthForm`, страницы просто передают `mode: "login" | "signup" | "reset" | "updatePassword"`. Это уменьшает дублирование и не раздувает client-bundle (страницы практически пустые).

---

## 3. Компоненты

```
app/
├── (auth-public)/                 ← новая route group, БЕЗ middleware-гарда
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── auth/
│       ├── reset/page.tsx
│       ├── update-password/page.tsx
│       └── callback/page.tsx
├── components/
│   └── auth/
│       ├── AuthForm.tsx           ← общая форма, mode-driven
│       ├── PasswordField.tsx      ← input + show/hide + caps lock hint
│       └── AuthFooterLinks.tsx    ← нижние ссылки между страницами
└── lib/
    └── auth/
        ├── signUp.ts              ← обёртка над supabase.auth.signUp
        ├── signInWithPassword.ts
        ├── requestPasswordReset.ts
        └── updatePassword.ts
```

`AuthModal.tsx` менять минимально: добавить кнопку **"Sign in with email and password"**, которая закрывает модалку и `router.push(getAuthUrl(redirectPath))` ведёт на `/login`. Не тащим всю форму внутрь модалки — фокус на одной точке правды.

---

## 4. Логика Supabase Auth (примерные сигнатуры)

```ts
// signUp.ts
export async function signUp({ email, password }) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl("/auth/callback?next=/"),
    },
  });
  // Если confirm email = ON, data.session = null,
  // user попадает в pending-состояние до клика по письму.
}
```

```ts
// signInWithPassword.ts
export async function signInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Возможные ошибки, которые надо красиво показать:
  //   "Invalid login credentials"     → "Wrong email or password"
  //   "Email not confirmed"           → отдельный CTA "Resend confirmation"
  return { data, error };
}
```

```ts
// requestPasswordReset.ts
export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl("/auth/callback?next=/auth/update-password"),
  });
}
```

```ts
// updatePassword.ts
export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}
```

---

## 5. Email-not-confirmed: важный edge case

Когда у юзера `Email not confirmed`, `signInWithPassword` возвращает ошибку. На `/login` нужно:
1. Поймать именно этот код ошибки (`error.code === "email_not_confirmed"` или сообщение).
2. Показать инлайн-блок с кнопкой **"Resend confirmation email"** → `supabase.auth.resend({ type: 'signup', email })`.
3. Не давать спамить — disable кнопку на 60 сек после клика.

Без этого юзер, которому пропало письмо, тупо застрянет.

---

## 6. Что меняется в коде

| Файл | Изменение |
|---|---|
| `app/lib/authRedirect.ts` | Добавить `BLOCKED_REDIRECT_PATHS`: `/login`, `/signup`, `/auth/reset`, `/auth/update-password`, `/auth/callback`. Опц. экспорт `getLoginUrl(from)`. |
| `app/auth/page.tsx` | Превращается в редирект → `/login` (оставляем для совместимости со старыми ссылками в письмах magic link). |
| `app/components/AuthModal.tsx` | Добавить primary CTA "Sign in with email and password" → `/login?from=…`. Magic link и Google остаются как сейчас. |
| `app/components/AuthCTA.tsx` | Если ведёт на `/auth` — поменять на `/login`. |
| `middleware.ts` (или эквивалент в `app/`) | Убедиться, что `/login`, `/signup`, `/auth/*` — публичные. По CLAUDE.md гард сейчас на `/profile`, `/add`, `/saved`, `/admin`, `/places/:id/edit/...` — значит правок не нужно, но проверить. |
| `app/auth/page.tsx` self-host watchdog (`setInterval(checkOrigin, 100)`) | Можно выпилить — `/auth/callback` решит ту же задачу чище. (Но это отдельный вопрос, не критично для этого PR.) |

---

## 7. Acceptance criteria

1. `/signup` с валидным email + паролем ≥ 8 → письмо приходит → клик по ссылке → юзер залогинен и на `/`.
2. `/login` с правильным паролем → залогинен. С неправильным → `Wrong email or password`.
3. `/login` для неподтверждённого email → инлайн-блок с "Resend".
4. `/auth/reset` → письмо → клик → `/auth/update-password` открывается, можно поменять пароль → редирект на `/login` с тостом "Password updated".
5. Magic link продолжает работать со страницы `/login` (через ссылку "Send magic link instead") и из `AuthModal`.
6. Google OAuth продолжает работать.
7. `getAuthUrl(from)` теперь ведёт на `/login?from=…`.
8. Существующие protected paths (`/profile`, `/add`, `/saved`, `/admin`) — без регрессий.
9. SSR: страницы `/login`, `/signup` — лёгкие, не тащат `googleMaps` и тяжёлые модалки. Цель — < 30 KB client bundle на каждую.

---

## 8. Риски и неочевидное

- **Email rate limit на Supabase.** Free tier — 2 письма/час с дефолтного домена. Для прода нужен SMTP-провайдер (Resend / Postmark / SendGrid), иначе `Resend confirmation` и `Reset password` начнут молча проваливаться. Вынести как отдельную задачу в трекер.
- **Race condition с `onAuthStateChange`.** Уже есть watchdog-интервал в `/auth/page.tsx`. На новых страницах его повторять не надо — `/auth/callback` решает это явно через `getSession()` + `setTimeout(0)`.
- **Password leak prevention в Supabase.** В Auth → Settings есть тогл "Leaked password protection" (HIBP). Включить — стоит ли, решает Артём; рекомендую да.
- **`UserAccessContext` дёргает профиль каждый раз.** Это известный TODO (см. memory `maporia_project.md`). Email/пароль не делает хуже, но и не чинит. Скоуп этого PR — auth, не рефакторинг контекста.
- **CSS/токены.** Использовать те же цвета, что в существующих `/auth` и `AuthModal` (`#8F9E4F`, `#FAFAF7`, `#ECEEE4`, `#1F2A1F`, `#A8B096`, `#C96A5B` для error). Чтобы не отрывалось визуально — не вводить новые цвета.

---

## 9. Порядок работы (предлагаемый)

1. Дашборд: включить confirm email, добавить redirect URLs, обновить шаблоны писем.
2. `app/lib/auth/*.ts` — четыре функции-обёртки + типы ошибок.
3. `AuthForm.tsx` + `PasswordField.tsx`.
4. Страницы: `/login`, `/signup`, `/auth/reset`, `/auth/update-password`, `/auth/callback`.
5. `app/auth/page.tsx` → редирект на `/login`.
6. `AuthModal.tsx` — добавить CTA на `/login`.
7. Локальный smoke-test всех 4 flow на `localhost:3000`.
8. SMTP-провайдер для прода — отдельным тикетом, до релиза.

---

**Что в этом плане ещё не зафиксировано, потому что зависит от UX-решения:**
- Нужны ли соцпровайдеры на `/signup` (помимо Google) — Apple, Facebook?
- Нужна ли галочка "Remember me" (Supabase JS SDK уже делает persistSession=true, поэтому скорее декоративная).
- Тексты писем — RU/EN/обе?
