# Feature Map

Последнее обновление: 2026-05-24.

## Public Routes

| Route | Назначение | Основные зависимости |
| --- | --- | --- |
| `/` | Главная discovery-страница с tabs `location/service/experience`, home sections, search/filter; reflects `?city=`, `?q=`, `?categories=`, `?tags=` in the hero/search state | `app/page.tsx`, `HOME_SECTIONS`, `HomeSection`, `SearchModal`, `FiltersModal` |
| `/map` | Каталог: list/map view, filters, Google Map, markers, premium gating; default listing is `kind=location`, services/experiences require explicit TYPE/`?kinds=` selection; offer cards without their own coordinates can use an active linked host location for map markers; `?categories=` accepts canonical emoji labels and plain category/tag aliases like `Coffee` | `app/map/page.tsx`, `GoogleMapsProvider`, `MarkerClusterer` |
| `/explore` | Альтернативный discovery экран с list/map, city/category query params | `app/explore/page.tsx` |
| `/feed` | Лента places | `app/feed/page.tsx` |
| `/id/[id]` | Детальная карточка place/service/experience, comments, photos, favorite, map | `app/id/[id]/page.tsx` |
| `/collections` | Список коллекций | `app/collections/page.tsx` |
| `/collections/[id]` | Детали коллекции и места внутри нее | `app/collections/[id]/page.tsx` |
| `/pricing` | Тарифы и checkout entry | `app/pricing/page.tsx`, `app/lib/plans.ts` |
| `/auth`, `/login`, `/signup`, `/auth/reset`, `/auth/update-password`, `/auth/callback` | Unified auth flows: `/login` and `/signup` start with Google/email-code auth; password sign-in remains a secondary legacy path via `method=password` | `app/components/auth/**`, `app/lib/auth/**` |
| `/brand-guide` | Визуальный бренд-гайд внутри приложения | `app/brand-guide/page.tsx`, `docs/BRAND-GUIDE.md` |

## Authenticated Routes

| Route | Назначение |
| --- | --- |
| `/profile` | Профиль пользователя, его places, premium/provider actions |
| `/profile/billing` | Billing status/actions |
| `/profile/edit/*` | Редактирование name, username, bio, avatar, interests |
| `/profile/elements/tags` | Пользовательские/профильные tags |
| `/saved` | Сохраненные/favorite places |
| `/settings`, `/settings/email` | Настройки аккаунта |
| `/add` | Выбор и создание draft location/service/experience |
| `/add/google`, `/add/google/preview` | Google import flow |
| `/places/[id]/edit` | Главный редактор карточки: Google import, admin owner transfer, next-best-step guidance, type-aware checklist, preview, Save draft / explicit Publish |
| `/places/[id]/edit/title` | Название |
| `/places/[id]/edit/description` | Описание |
| `/places/[id]/edit/location` | Адрес, координаты, карта |
| `/places/[id]/edit/photos` | Фото |
| `/places/[id]/edit/categories` | Категории и теги |
| `/places/[id]/edit/access` | Public/premium access |
| `/places/[id]/edit/contacts` | Phone, website, socials |
| `/places/[id]/edit/details` | Service/experience детали |
| `/places/[id]/edit/price` | Цена |
| `/places/[id]/edit/schedule` | Расписание |
| `/places/[id]/edit/host` | Host/provider info |
| `/places/[id]/edit/required` | Included/bring/cancellation fields |
| `/places/[id]/edit/collections` | Привязка к коллекциям |
| `/id/[id]/edit` | Legacy edit route |
| `/places/[id]/settings` | Settings для place |

## Admin Routes

| Route | Назначение |
| --- | --- |
| `/admin/billing` | Billing/admin subscription view |
| `/admin/collections` | Управление коллекциями |
| `/admin/collections/new` | Создание коллекции |
| `/admin/collections/[id]/edit` | Редактирование коллекции |
| `/admin/health` | Product health dashboard |
| `/admin/impersonation-log` | Журнал impersonation |

## API Routes

| API | Назначение |
| --- | --- |
| `GET /api/health` | Runtime health and DB checks |
| `GET /api/tags` | Public tags |
| `/api/admin/tags` | Admin tags |
| `/api/admin/premium-modal-settings` | Настройки premium modal |
| `/api/admin/users/[id]/role` | Admin manual plan/admin assignment through service-role API |
| `/api/admin/users/[id]/auth` | Admin email/password/reset/magic-link management |
| `/api/admin/users/search` | Admin user lookup for assignment tools |
| `/api/admin/places/[id]/owner` | Admin place owner transfer endpoint |
| `/api/admin/impersonate/*` | Start/status/exit/log/cleanup impersonation |
| `/api/ai/generate-description` | AI description generation через OpenAI |
| `/api/cities/resolve` | City resolve/normalization |
| `/api/collections/[id]/places` | Places внутри коллекции |
| `/api/google/place-import` | Google place import |
| `/api/google/photo` | Google photo image proxy; streams Places photos without exposing Google API key |
| `/api/google-import/search` | Google import search |
| `/api/google-import/import` | Google import commit |
| `POST /api/place-links` | Create location ↔ service/experience links through service-role API after Bearer ownership/admin verification |
| `PATCH /api/place-links/[id]` | Approve or reject pending place links as location owner/admin |
| `DELETE /api/place-links/[id]` | Remove a place link as either listing owner/admin |
| `PATCH /api/places/[id]/photos` | Save place photo order/cover/video through service-role API after owner/admin Bearer verification |
| `/api/places/resolve-place-id` | Resolve internal/external place id |
| `PATCH /api/profile` | Current-user profile field updates through service-role API |
| `/api/stripe/checkout` | Создание checkout session |
| `/api/stripe/portal` | Stripe customer portal |
| `/api/stripe/verify` | Verify checkout result |
| `/api/stripe/webhook` | Stripe webhook and plan updates |
| `/api/maintenance/cleanup-drafts` | Cron/admin cleanup for abandoned empty `/add` drafts |

## Компонентные Узлы

| Компонент | Роль |
| --- | --- |
| `TopBar` | Верхняя навигация, search/auth entry, modals |
| `PlaceCard` | Универсальная карточка place в списках |
| `HomeSection` | Горизонтальные секции главной |
| `SearchModal`, `SearchBar`, `FiltersModal` | Discovery controls |
| `FavoriteIcon` | Favorite/reaction action |
| `PremiumUpsellModal`, `LockedPlaceOverlay`, `PremiumBadge` | Premium UX |
| `GoogleImportField`, `UnifiedGoogleImportField`, `ImportPreviewCard` | Google import UX |
| `CityAutocomplete`, `AddressAutocomplete` | Location inputs |
| `DesktopMosaic`, `MobileCarousel` | Детальная страница photos |
| `GlobalModals` | Намеченная центральная точка для модалок |
| `ProductionDiagnostics` | Диагностика production проблем |

## Search Keywords

Используй эти слова в `rg`, когда нужно быстро найти домен:

```bash
rg "canUserCreate|checkQuota|PLAN_CONFIG" app
rg "access_level|premium_only|is_premium|visibility" app
rg "google_place_id|googleImport|place-import" app
rg "stripe|checkout|subscription|bonus_listing_credits" app
rg "impersonate|admin_impersonation_log" app
rg "MarkerClusterer|AdvancedMarker|google.maps.Marker" app
rg "HomeSection|PlaceCard|useBatchPlaceData" app
```
