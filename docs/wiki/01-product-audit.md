# Product Audit

Последнее обновление: 2026-05-07.

## Позиционирование

Maporia сейчас выглядит как local discovery marketplace:

- Для путешественников и локальных пользователей: найти места, hidden gems, подборки, premium locations.
- Для creator/provider пользователей: публиковать locations, services и experiences.
- Для админа: управлять коллекциями, тегами, billing-настройками, impersonation и health.

Продуктовая модель уже шире, чем базовый "places catalog": в коде есть три типа карточек, разные категории, price/schedule fields, creator-планы и лимиты публикации.

## Основные Пользовательские Сценарии

| Сценарий | Статус по коду | Ключевые файлы |
| --- | --- | --- |
| Смотреть главную с секциями и табами Locations / Experiences / Services | Реализовано | `app/page.tsx`, `app/constants/homeSections.ts` |
| Смотреть каталог списком или картой | Реализовано | `app/map/page.tsx`, `app/explore/page.tsx` |
| Смотреть карточку места/офера | Реализовано | `app/id/[id]/page.tsx`, `app/id/[id]/_views/OfferPlaceView.tsx` |
| Добавлять location/service/experience | Реализовано через wizard и edit pages | `app/(auth)/add/page.tsx`, `app/(auth)/places/[id]/edit/**` |
| Импортировать место из Google | Реализовано | `app/(auth)/add/google/**`, `app/api/google-import/**`, `app/api/google/place-import/route.ts` |
| Premium paywall для скрытых мест | Реализовано | `app/lib/access.ts`, `app/hooks/usePremiumGate.ts`, `app/components/PremiumUpsellModal.tsx` |
| Оплата Premium/creator/add-on | Реализовано на уровне Stripe API | `app/lib/plans.ts`, `app/api/stripe/**` |
| Сохраненные места / реакции / комментарии | Реализовано | `app/(auth)/saved/page.tsx`, `app/id/[id]/page.tsx`, `app/components/FavoriteIcon.tsx` |
| Админские коллекции и настройки | Реализовано | `app/(auth)/admin/**`, `app/api/admin/**` |

## Монетизация

Источник правды: `app/lib/plans.ts`.

| План | Цена | Право доступа | Право публикации |
| --- | ---: | --- | --- |
| `free` | $0 | public locations | нет публикации через текущий `canUserAddPlace` |
| `premium_viewer` | $35 one-time | premium locations | no new creator publishing in v2 |
| `creator_location` | $9.99/mo | premium included | до 5 locations |
| `creator_service` | $14.99/mo | premium included | до 5 services + locations |
| `creator_experience` | $14.99/mo | premium included | до 5 experiences + locations |
| `creator_all` | $34.99/mo | premium included | 10 combined services/experiences + locations |
| extra listing | $2.99 one-time | не меняет план | +1 bonus listing credit |

Важный аудитный вывод: billing env и Stripe setup должны оставаться синхронизированы с текущей pricing-моделью: `STRIPE_PRICE_PREMIUM_ONETIME`, `STRIPE_PRICE_CREATOR_LOCATION_MONTH`, `STRIPE_PRICE_CREATOR_SERVICE_MONTH`, `STRIPE_PRICE_CREATOR_EXPERIENCE_MONTH`, `STRIPE_PRICE_CREATOR_ALL_MONTH`, `STRIPE_PRICE_EXTRA_LISTING`. `STRIPE_PRICE_ID` нужен только как legacy fallback для старого Premium checkout.

## Продуктовая Ясность

Сильные стороны:

- Продукт уже имеет понятные verticals: locations, services, experiences.
- Есть premium-модель и creator-модель, а не только donation/paywall.
- Есть админские инструменты и health-check система.
- В коде много production-focused fixes: auth redirect, Supabase stale tokens, lazy modals, batch loading в некоторых местах.

Неясности, которые стоит решить продуктово:

- Можно ли free-пользователю публиковать public locations? Комментарии в `access.ts` говорят, что free видит public, но `canUserAddPlace` сейчас разрешает добавление только premium/admin.
- Какой экран является каноническим каталогом: `/`, `/map`, `/explore`, `/feed`. Сейчас несколько entry points дублируют каталог.
- Нужно ли services/experiences показывать как marketplace с booking intent или как информационные карточки с contact CTA.
- Какие города являются launch-scope: в constants есть 4 города, а home sections жестко сфокусированы на Fort Lauderdale.

## Приоритеты На 2 Недели

1. Синхронизировать billing env и Stripe docs с текущей тарифной сеткой.
2. Закрыть access-level warnings на public routes `/feed` и `/places/[id]/settings`.
3. Свести каталог к понятной навигационной модели: главная, discovery list/map, коллекции.
4. Централизовать карточные batch loaders и модалки, чтобы не плодить разный behavior между `/map`, `/explore`, collections и profile.
5. Обновить `.env.example` и README под реальные API/env.
