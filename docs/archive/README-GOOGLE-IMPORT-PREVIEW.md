# Google Maps Import with Preview

## Overview

This feature allows users to import places from Google Maps with a preview and selective field import. Users can choose which fields to import (title, address, description, photos) before creating the place.

## Setup

### 1. Database Migration

Run the SQL migration to add the `status` field to the `places` table:

```sql
-- Execute add-place-status-field.sql in Supabase Dashboard > SQL Editor
```

This adds a `status` column with values `'draft'` or `'published'`.

### 2. Environment Variables

Ensure you have the Google Maps API key configured:

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
```

Or for development:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Usage

### For Users

1. Navigate to `/add/google`
2. Enter a Google Maps URL or address in the search field
3. Click "Search"
4. Review the preview card with checkboxes for each field:
   - **Title**: Place name
   - **Address**: Full address
   - **Description**: Place types/categories (collapsed to 3 lines, expandable)
   - **Photos**: Grid of 3-6 photos (each selectable)
5. Select which fields to import using checkboxes
6. Click "Import Selected"
7. Redirected to `/places/{id}/edit` to continue editing

### For Developers

#### Component Usage

```tsx
import GoogleImportField from "@/components/GoogleImportField";

<GoogleImportField userId={user.id} />
```

#### API Endpoints

**POST `/api/google-import/search`**

Search for a place by URL or address.

Request:
```json
{
  "query": "Google Maps URL or address",
  "access_token": "supabase_session_token"
}
```

Response:
```json
{
  "title": "Place Name",
  "address": "Full Address",
  "description": "Place types",
  "photos": [
    {
      "id": "photo_0",
      "url": "https://...",
      "reference": "..."
    }
  ],
  "lat": 55.7558,
  "lng": 37.6173,
  "google_place_id": "ChIJ...",
  "google_maps_url": "https://..."
}
```

**POST `/api/google-import/import`**

Import selected fields as a draft place.

Request:
```json
{
  "google_place_id": "ChIJ...",
  "selectedFields": {
    "lat": 55.7558,
    "lng": 37.6173,
    "google_maps_url": "https://...",
    "title": true,
    "titleData": "Place Name",
    "address": true,
    "addressData": "Full Address",
    "description": true,
    "descriptionData": "Place types",
    "photos": [
      {
        "id": "photo_0",
        "url": "https://..."
      }
    ]
  },
  "access_token": "supabase_session_token"
}
```

Response:
```json
{
  "place_id": "uuid",
  "success": true
}
```

Or if duplicate:
```json
{
  "error": "Place already exists",
  "code": "DUPLICATE_PLACE",
  "existing_place_id": "uuid",
  "existing_title": "Place Name"
}
```

## Features

### ✅ Implemented

- [x] Search by Google Maps URL or free text
- [x] Preview card with checkboxes for each field
- [x] Selective import (title, address, description, photos)
- [x] Photo selection (individual photos can be selected/deselected)
- [x] Description collapse/expand (3 lines default)
- [x] Loading skeleton during search
- [x] Error handling (not found, invalid link, API errors)
- [x] Duplicate detection by `google_place_id`
- [x] Always includes coordinates, `google_place_id`, and `google_maps_url`
- [x] Creates place as `draft` status
- [x] Redirects to edit page after import
- [x] Google attribution footer
- [x] Response caching (1 hour)

### 🔄 Edge Cases Handled

- Partial data → Shows only available fields
- No photos → Hides photos block
- Invalid input → Inline validation and error messages
- API errors → Friendly error messages
- Duplicate places → Redirects to existing place
- Authentication → Requires valid session

## Database Schema

### Places Table

The `places` table should have:

- `id`: UUID (primary key)
- `title`: TEXT (required)
- `address`: TEXT (nullable)
- `description`: TEXT (nullable)
- `lat`: DOUBLE PRECISION (nullable)
- `lng`: DOUBLE PRECISION (nullable)
- `google_place_id`: TEXT (nullable, unique)
- `link`: TEXT (nullable, stores `google_maps_url`)
- `status`: TEXT (nullable, 'draft' or 'published')
- `created_by`: UUID (user ID)
- `created_at`: TIMESTAMPTZ

### Place Photos Table

Photos are stored in `place_photos` table:

- `id`: UUID (primary key)
- `place_id`: UUID (foreign key to places)
- `user_id`: UUID (foreign key to users)
- `url`: TEXT (photo URL)
- `sort`: INTEGER (order)
- `is_cover`: BOOLEAN (first photo is cover)

## Caching

Search results are cached in memory for 1 hour by `place_id` to reduce API calls.

## Security

- Requires authentication (Supabase session)
- Rate limiting (10 requests per minute per user)
- Server-side API key (not exposed to client)
- User can only import places they create

## Future Improvements

- [ ] Redis cache for production
- [ ] Re-import option on edit screen
- [ ] Batch import multiple places
- [ ] Import history
- [ ] Undo import
