# Администратор может редактировать и удалять любые места

## Что было сделано:

### 1. RLS Политики (уже настроены)
- ✅ `"Admins can update any place"` - администраторы могут обновлять любые места
- ✅ `"Admins can delete any place"` - администраторы могут удалять любые места

### 2. UI Обновления

#### Страница места (`/app/id/[id]/page.tsx`)
- ✅ Добавлена проверка `isAdmin` через `isUserAdmin(access)`
- ✅ Создана переменная `canEdit = isOwner || isAdmin`
- ✅ Все кнопки "Edit" теперь показываются для администраторов

#### Страница настроек места (`/app/places/[id]/settings/page.tsx`)
- ✅ Добавлена проверка администратора при загрузке страницы
- ✅ Администраторы могут удалять любые места
- ✅ Администраторы могут изменять видимость любых мест

#### Главная страница редактирования (`/app/places/[id]/edit/page.tsx`)
- ✅ Добавлена проверка администратора
- ✅ Администраторы могут открывать редактор для любых мест

#### Страница редактирования доступа (`/app/places/[id]/edit/access/page.tsx`)
- ✅ Добавлена проверка администратора
- ✅ Администраторы могут изменять access_level любых мест

#### Страница редактирования названия (`/app/places/[id]/edit/title/page.tsx`)
- ✅ Добавлена проверка администратора
- ✅ Администраторы могут изменять название любых мест

### 3. Остальные страницы редактирования

Нужно обновить следующие страницы аналогичным образом:
- `/app/places/[id]/edit/description/page.tsx`
- `/app/places/[id]/edit/location/page.tsx`
- `/app/places/[id]/edit/categories/page.tsx`
- `/app/places/[id]/edit/photos/page.tsx`
- `/app/places/[id]/edit/required/page.tsx`

**Паттерн для обновления:**

1. Добавить импорт:
```typescript
import { isUserAdmin } from "../../../../lib/access";
```

2. Получить доступ:
```typescript
const { loading: accessLoading, user, access } = useUserAccess(true, false);
const isAdmin = isUserAdmin(access);
```

3. Обновить проверку владельца:
```typescript
// Было:
if (data.created_by !== user.id) {
  router.push(`/id/${placeId}`);
  return;
}

// Стало:
const isOwner = data.created_by === user.id;
if (!isOwner && !isAdmin) {
  router.push(`/id/${placeId}`);
  return;
}
```

4. Обновить запросы на обновление:
```typescript
// Было:
.eq("created_by", user.id)

// Стало:
const updateQuery = supabase.from("places").update(payload).eq("id", placeId);
if (!isAdmin) {
  updateQuery.eq("created_by", user.id);
}
```

## Проверка

Чтобы проверить, что администратор может редактировать и удалять любые места:

1. Войдите как администратор
2. Откройте любое место (не ваше)
3. Должна быть видна кнопка "Edit"
4. При нажатии на "Edit" должен открыться редактор
5. В настройках места должна быть доступна кнопка "Delete place"

## SQL Проверка

Выполните `update-edit-pages-for-admin.sql` для проверки RLS политик.
