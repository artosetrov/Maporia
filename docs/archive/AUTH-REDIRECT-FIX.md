# Исправление редиректа после логина

## Проблема
После логина пользователь редиректится на production (`https://www.maporia.co`) вместо того, чтобы остаться на текущем хосте (например, `http://localhost:3000`).

## Решение

### 1. Код (✅ Уже исправлено)

Код уже настроен для работы с любым хостом:
- `getAuthRedirectUrl()` использует `window.location.origin` динамически
- `app/auth/page.tsx` проверяет и перехватывает редиректы на другой хост
- Добавлено агрессивное отслеживание изменений origin

### 2. Настройка Supabase Dashboard (⚠️ ТРЕБУЕТСЯ РУЧНАЯ НАСТРОЙКА)

**Это критически важно!** Supabase проверяет redirect URL против списка разрешенных URL. Если `http://localhost:3000/**` не добавлен, Supabase будет использовать Site URL и редиректить на production.

#### Шаги:

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите ваш проект
3. Перейдите в **Authentication** → **URL Configuration**

#### Настройка Site URL:
```
https://maporia.co
```
(Оставьте production URL как основной)

#### Настройка Redirect URLs:
Добавьте **ВСЕ** следующие URL (каждый на новой строке):
```
http://localhost:3000/**
http://localhost:3000/auth
https://maporia.co/**
https://www.maporia.co/**
```

**Важно:** 
- `http://localhost:3000/**` должен быть в списке для разработки
- `**` означает любой путь после этого URL
- Без этого Supabase будет игнорировать наш redirect URL и использовать Site URL

### 3. Проверка работы

После настройки:

1. **На localhost:**
   - Откройте `http://localhost:3000/auth`
   - Введите email и нажмите "Send magic link"
   - Проверьте консоль браузера - должно быть: `[Auth] Redirect URL: http://localhost:3000/`
   - После клика по magic link вы должны остаться на `localhost:3000`

2. **На production:**
   - Откройте `https://maporia.co/auth`
   - После логина вы должны остаться на `maporia.co`

### 4. Отладка

Если редирект все еще не работает:

1. **Проверьте консоль браузера:**
   - Должны быть логи: `[Auth] Stored original origin: ...`
   - Должны быть логи: `[Auth] Redirect URL: ...`
   - Если видите `[Auth] Origin changed!` - значит Supabase редиректит на другой хост

2. **Проверьте Supabase Dashboard:**
   - Убедитесь, что `http://localhost:3000/**` добавлен в Redirect URLs
   - Убедитесь, что нет опечаток в URL

3. **Проверьте magic link:**
   - Откройте magic link в новой вкладке
   - Проверьте, на какой URL вас редиректит Supabase
   - Если это production URL, значит проблема в настройках Supabase

### 5. Альтернативное решение (если ничего не помогает)

Если проблема сохраняется, можно временно изменить Site URL в Supabase на `http://localhost:3000` для разработки, но это не рекомендуется для production.

## Технические детали

- `getAuthRedirectUrl()` всегда использует `window.location.origin` для динамического определения хоста
- `app/auth/page.tsx` отслеживает изменения `window.location.origin` и принудительно редиректит обратно на исходный хост
- Supabase клиент настроен с `flowType: 'pkce'` для лучшего контроля над редиректами
