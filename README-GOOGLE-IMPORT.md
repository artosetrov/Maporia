# Google Maps Import Feature

This feature allows users to import business/place information from Google Maps into their profile.

## Setup Instructions

### 1. Database Migration

Run the SQL migration to add Google-related fields to the `profiles` table:

```bash
# Execute in Supabase Dashboard > SQL Editor
add-profile-google-fields.sql
```

This adds the following fields:
- `google_place_id` - Google Places API place_id
- `google_maps_url` - Original Google Maps URL used for import
- `google_rating` - Google Places rating (0-5)
- `google_reviews_count` - Number of Google reviews
- `google_opening_hours` - Opening hours (JSONB)
- `website` - Business website URL
- `phone` - Business phone number
- `address` - Business address

### 2. Environment Variables

Add the following environment variable to your `.env.local` file:

```bash
# Server-side Google Maps API key (NOT NEXT_PUBLIC)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

**Important:** 
- This should be a **server-side only** key (not `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
- Enable the following APIs in Google Cloud Console:
  - Places API (New)
  - Places API (if using legacy endpoints)

### 3. API Key Restrictions

For security, restrict your API key:
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Edit your API key
3. Set "Application restrictions" to "HTTP referrers" and add your domain
4. Set "API restrictions" to only allow:
   - Places API (New)
   - Places API

## Usage

### For Users

1. Navigate to Profile > Edit
2. Click "Import from Google" or use the import field on individual edit pages
3. Paste a Google Maps business/place URL
4. Click "Import" or let it auto-import on blur
5. Review and edit the imported data as needed
6. Save your profile

### Supported URL Formats

- `https://www.google.com/maps/place/Name/@lat,lng`
- `https://maps.google.com/?cid=...`
- `https://goo.gl/maps/...`
- Any Google Maps place URL

## Architecture

### API Route

**Endpoint:** `POST /api/google/place-import`

**Request:**
```json
{
  "google_url": "https://www.google.com/maps/place/...",
  "access_token": "supabase_session_token"
}
```

**Response:**
```json
{
  "business_name": "Business Name",
  "formatted_address": "123 Main St, City, State",
  "website": "https://example.com",
  "phone": "+1234567890",
  "rating": 4.5,
  "reviews_count": 100,
  "opening_hours": {...},
  "category": "restaurant",
  "types": ["restaurant", "food", "point_of_interest"],
  "place_id": "ChIJ...",
  "google_maps_url": "https://...",
  "photo_urls": [...]
}
```

### Data Mapping

The imported data maps to profile fields as follows:

- `business_name` → `display_name`
- `formatted_address` → `address`
- `website` → `website`
- `phone` → `phone`
- `rating` → `google_rating`
- `reviews_count` → `google_reviews_count`
- `opening_hours` → `google_opening_hours`
- `place_id` → `google_place_id`
- `google_maps_url` → `google_maps_url`
- `bio` → Generated from `category` + `city` (only if bio is empty)

### Rate Limiting

The API includes basic rate limiting:
- 10 requests per minute per user
- In-memory storage (for production, use Redis or similar)

### Error Handling

The API handles:
- Invalid Google Maps URLs
- Place not found
- API quota/billing errors
- Authentication errors
- Network errors

All errors are returned with appropriate HTTP status codes and error messages.

## Components

### GoogleImportField

Reusable component for importing Google data.

**Props:**
- `userId: string` - User ID for authentication
- `onImportSuccess?: (data) => void` - Callback when import succeeds
- `compact?: boolean` - Use compact UI (default: false)

**Usage:**
```tsx
<GoogleImportField
  userId={user.id}
  onImportSuccess={(data) => {
    // Handle imported data
  }}
  compact={true}
/>
```

## Security

- API key is stored server-side only
- All API calls are authenticated via Supabase session
- Rate limiting prevents abuse
- Input validation on both client and server

## Future Enhancements

- Photo import (avatar/cover suggestions)
- Batch import for multiple places
- Import history
- Sync with Google Places (periodic updates)
