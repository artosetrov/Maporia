# Passwordless Auth — Supabase setup

После перехода `AuthModal.tsx` на 6-значный OTP-код (см. `app/components/AuthModal.tsx`)
необходимо настроить Supabase, иначе пользователи получат только magic-link и
не смогут ввести код.

## 1. Email template — добавить `{{ .Token }}`

Supabase Dashboard → **Authentication** → **Email Templates** → **Magic Link**.

Шаблон по умолчанию содержит только ссылку. Нужно заменить тело письма так,
чтобы в нём фигурировал **и** код, **и** ссылка (ссылка остаётся как fallback —
наш callback её отработает, см. `app/auth/callback/CallbackPageContent.tsx`).

Пример HTML-тела:

```html
<h2>Sign in to Maporia</h2>

<p>Your sign-in code:</p>
<p style="font-size: 28px; font-weight: 600; letter-spacing: 4px;">{{ .Token }}</p>

<p>This code expires in 1 hour.</p>

<hr>

<p>Or click this link to sign in instantly:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to Maporia</a></p>

<p style="color: #888; font-size: 12px;">
  If you didn't request this, you can ignore this email.
</p>
```

Subject: `Your Maporia sign-in code`

## 2. Auth providers — Google enabled

Supabase Dashboard → **Authentication** → **Providers** → **Google** должен быть
включён, OAuth client ID/secret уже настроены (статус: используется в проде).
Менять ничего не надо — `signInWithOAuth({ provider: "google" })` в модалке как был.

## 3. URL Configuration — site URL и redirect URLs

Supabase Dashboard → **Authentication** → **URL Configuration**.

Должны быть добавлены (если ещё не):
- `https://maporia.com/auth/callback`
- `http://localhost:3000/auth/callback`

Этот redirect используется только если пользователь кликает magic-link в
письме (fallback). При вводе 6-значного кода никаких redirect не происходит —
сессия создаётся через `verifyOtp` в той же вкладке.

## 4. Что произойдёт со старыми пользователями (с паролем)

Их аккаунты остаются в БД. При следующем входе они вводят email →
получают код → попадают в свой аккаунт. Пароль больше нигде не используется,
но и не удаляется (можно потом миграцией обнулить, если хочется чистоты).

`/auth/login` (страница логина с паролем) пока не удалена — там есть link на
signup, восстановление пароля и т.д. Если решим выпилить полностью, нужно:
1. Удалить `app/auth/login/`, `app/auth/signup/`, `app/auth/update-password/`.
2. Убрать `getAuthUrl`, `getSignupUrl` из `app/lib/authRedirect.ts`.
3. Поправить `middleware.ts` если он ссылается на эти пути.

## 5. Тест-чеклист после деплоя

- [ ] Открыть модалку (например, кликнуть «Save» на месте, не залогинившись).
- [ ] Ввести email → нажать Continue → должен прийти email с **кодом** (не только ссылкой).
- [ ] Ввести 6 цифр в инпуты → должно автоматически залогинить, модалка закрылась.
- [ ] Ввести неверный код → должна появиться ошибка, инпуты сбросились.
- [ ] Подождать 30 сек → кнопка «Resend code» стала активной.
- [ ] Кликнуть Continue with Google → OAuth-флоу → возврат на `/auth/callback` → залогинен.
- [ ] Кликнуть magic-link в письме (вместо ввода кода) → тоже должен залогинить через callback.
- [ ] Mobile: проверить, что 6 инпутов помещаются по ширине (max-w-md = 448px, 6×48 + gaps).
