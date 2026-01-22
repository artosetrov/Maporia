# City Resolution and Auto-Linking

This feature automatically creates cities in the database and links places to them via `city_id` foreign key.

## Problem Solved

Previously, places stored city as plain text (`city` field). This caused issues:
- Cities didn't appear in filters if no Cities row existed
- Duplicate cities with different casing ("Davie" vs "davie")
- No way to link places to normalized city data

## Solution

1. **Cities Table**: Stores normalized city data with unique constraints
2. **city_id Foreign Key**: Places reference cities via `city_id`
3. **Auto-creation**: Cities are automatically created when places are saved
4. **Backward Compatibility**: `city` and `city_name_cached` fields maintained for existing code

## Database Schema

### Cities Table
- `id` (UUID, PK)
- `name` (TEXT, required) - Normalized city name
- `slug` (TEXT, unique) - URL-friendly identifier
- `state` (TEXT, optional)
- `country` (TEXT, optional)
- `lat` / `lng` (DOUBLE PRECISION, optional)
- Unique constraint on `(LOWER(name), state, country)`

### Places Table Updates
- `city_id` (UUID, FK → cities.id) - **Primary field for filtering**
- `city_name_cached` (TEXT) - Cached city name for display
- `city` (TEXT) - Legacy field, kept for backward compatibility

## Migration Steps

1. **Run SQL Migration**:
   ```sql
   -- Execute in Supabase Dashboard > SQL Editor
   add-cities-table-and-migration.sql
   ```

   This will:
   - Create `cities` table
   - Add `city_id` and `city_name_cached` to `places`
   - Create RPC function `get_or_create_city`
   - Migrate existing places to use city_id
   - Set up RLS policies

2. **Verify Migration**:
   ```sql
   -- Check cities created
   SELECT COUNT(*) FROM cities;
   
   -- Check places with city_id
   SELECT COUNT(*) FROM places WHERE city_id IS NOT NULL;
   ```

## How It Works

### When Saving a Place

1. **City Name Provided**: User enters city name or Google import provides it
2. **City Resolution**: System calls `/api/cities/resolve` with city name
3. **Get or Create**: RPC function `get_or_create_city`:
   - Normalizes city name (trim, collapse spaces)
   - Searches for existing city (case-insensitive)
   - Creates new city if not found
   - Returns `city_id`
4. **Save Place**: Place is saved with `city_id` and `city_name_cached`

### RPC Function: `get_or_create_city`

```sql
SELECT get_or_create_city(
  p_name := 'Davie',
  p_state := 'FL',
  p_country := 'USA',
  p_lat := 26.0629,
  p_lng := -80.2331
);
-- Returns: city_id UUID
```

**Features**:
- Idempotent: calling twice with same name returns same city_id
- Case-insensitive matching
- Handles duplicates via unique constraint
- Normalizes city names automatically

### API Endpoint: `/api/cities/resolve`

**POST** `/api/cities/resolve`

**Request**:
```json
{
  "name": "Davie",
  "state": "FL",
  "country": "USA",
  "lat": 26.0629,
  "lng": -80.2331
}
```

**Response**:
```json
{
  "city_id": "uuid-here",
  "name": "Davie",
  "slug": "davie",
  "state": "FL",
  "country": "USA",
  "lat": 26.0629,
  "lng": -80.2331
}
```

## Code Integration

### Place Save Logic

All place create/update operations now:
1. Extract city name from input
2. Call `resolveCity()` utility
3. Save place with `city_id` and `city_name_cached`

**Example**:
```typescript
import { resolveCity } from "../lib/cityResolver";

const cityData = await resolveCity(cityName, state, country, lat, lng);
if (cityData) {
  await supabase.from("places").update({
    city_id: cityData.city_id,
    city_name_cached: cityData.name,
    city: cityData.name, // Backward compatibility
    // ... other fields
  });
}
```

### Filtering Places by City

Filters now support both `city_id` (preferred) and `city` (backward compatibility):

```typescript
// Filter by city name (works with both city_id and city)
query = query.or(`city_name_cached.eq.${cityName},city.eq.${cityName}`);
```

### Loading Cities for Filters

```typescript
import { getCitiesWithPlaces } from "../lib/cities";

const cities = await getCitiesWithPlaces();
// Returns only cities that have places
```

## Google Import Integration

When importing from Google Maps:
1. Google Places API provides address components
2. System extracts city using `extractCityFromAddressComponents()`:
   - Prefers `locality`
   - Fallback to `postal_town`
   - Fallback to `sublocality`
3. Also extracts `state` and `country` if available
4. Resolves city with full context (name, state, country, coordinates)
5. Saves place with `city_id`

## Edge Cases Handled

1. **Missing City Name**: If no city provided, `city_id` remains null
2. **Duplicate Cities**: Unique constraint prevents duplicates
3. **Case Variations**: "Davie" and "davie" resolve to same city_id
4. **Google Address Components**: Properly extracts locality vs administrative_area
5. **Backward Compatibility**: Old places without city_id still work via `city` field

## Testing

After migration, test:

1. **Create new place with city "Davie"**:
   - Check `cities` table has "Davie" row
   - Check `places.city_id` is set
   - Check city appears in filters

2. **Import from Google Maps**:
   - Paste Google Maps URL
   - Verify city is extracted and resolved
   - Verify `city_id` is set

3. **Filter by city**:
   - Select "Davie" in city filter
   - Verify places with `city_id` pointing to Davie appear

## RLS Policies

- **Read**: Anyone can read cities (for filters, autocomplete)
- **Insert**: Authenticated users can insert via RPC function
- **Update/Delete**: Only service role (via RPC function)

## Future Improvements

- Add city slugs for URL-friendly city pages
- Add city coordinates for map centering
- Add city metadata (population, timezone, etc.)
- Migrate all existing places to use city_id
- Remove `city` field once all places migrated
