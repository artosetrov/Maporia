# Production AbortError Fix - Version 2

## Проблема
На продакшене (maporia.co) все запросы к Supabase прерываются с AbortError, хотя на *.vercel.app все работает.

## Дополнительные исправления

### 1. useUserAccess - Request ID tracking
Добавлен tracking request ID для предотвращения race conditions:
- Каждый запрос получает уникальный ID
- Проверяем, что это все еще актуальный запрос перед обновлением состояния
- Invalidate старые запросы при размонтировании

### 2. HomePage favorites loading
Добавлена защита от отмены запросов при изменении userId.

## Критическая проблема

Если проблема все еще сохраняется, возможно:

1. **Next.js Strict Mode** - В development режиме React Strict Mode вызывает двойной рендер. На продакшене это может вызывать размонтирование компонентов.

2. **Custom domain routing** - На кастомном домене Next.js может работать по-другому, вызывая дополнительные ре-рендеры.

3. **Supabase client AbortController** - Supabase может использовать AbortController внутри, который автоматически отменяет запросы при размонтировании компонента.

## Решение (если проблема сохраняется)

### Вариант 1: Отключить Strict Mode (временно для теста)
В `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  reactStrictMode: false, // Временно отключить для теста
  // ...
};
```

### Вариант 2: Использовать глобальный флаг для продакшена
Создать глобальный флаг, который предотвращает отмену запросов:
```typescript
// app/lib/supabase.ts
if (typeof window !== 'undefined') {
  (window as any).__MAPORIA_DISABLE_ABORT__ = process.env.NODE_ENV === 'production';
}
```

### Вариант 3: Использовать React Query или SWR
Эти библиотеки лучше обрабатывают кеширование и отмену запросов.

## Проверка

После деплоя проверьте:
1. Консоль браузера - не должно быть AbortError
2. Network tab - запросы должны завершаться успешно
3. Контент должен отображаться
