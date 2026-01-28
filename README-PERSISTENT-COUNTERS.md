# Persistent Counters for Places

## Overview

This system implements **persistent counters** in Postgres/Supabase to eliminate runtime `COUNT()` queries. Counters are automatically maintained via database triggers, ensuring correctness and scalability.

## Problem Solved

**Before:** Frontend had to run expensive `COUNT()` queries every time:
- Filtering by city: `SELECT COUNT(*) FROM places WHERE city_id = ?`
- Filtering by category: `SELECT COUNT(*) FROM places WHERE ? = ANY(categories)`

**After:** Counters are pre-computed and stored in the database:
- City counts: `SELECT places_count FROM cities WHERE id = ?`
- Category counts: `SELECT places_count FROM category_counts WHERE category = ?`

## Architecture

### Tables

1. **`cities.places_count`** (INTEGER, default 0)
   - Stores count of places per city
   - Updated automatically when places are inserted/updated/deleted

2. **`category_counts`** table
   - `category` (TEXT, PRIMARY KEY) - Category name (e.g., "🍽 Food & Drinks")
   - `places_count` (INTEGER, default 0) - Number of places with this category
   - `updated_at` (TIMESTAMPTZ) - Last update timestamp

### Functions

1. **`update_city_places_count()`**
   - Trigger function for city counter
   - Handles INSERT, UPDATE, DELETE
   - Prevents negative counts using `GREATEST(0, ...)`

2. **`update_category_places_count()`**
   - Trigger function for category counter
   - Handles array diff on UPDATE (only updates changed categories)
   - Uses `ON CONFLICT` to handle new categories dynamically

### Triggers

- **`trigger_update_city_places_count`**
  - Fires: `AFTER INSERT OR UPDATE OF city_id OR DELETE`
  - Updates `cities.places_count`

- **`trigger_update_category_places_count`**
  - Fires: `AFTER INSERT OR UPDATE OF categories OR DELETE`
  - Updates `category_counts.places_count`

## How It Works

### INSERT Flow

```sql
-- User creates a place with city_id = 'abc-123' and categories = ['🍽 Food & Drinks', '🍸 Bars & Wine']

-- Trigger 1: update_city_places_count()
UPDATE cities SET places_count = places_count + 1 WHERE id = 'abc-123';

-- Trigger 2: update_category_places_count()
INSERT INTO category_counts (category, places_count) VALUES ('🍽 Food & Drinks', 1)
ON CONFLICT (category) DO UPDATE SET places_count = places_count + 1;

INSERT INTO category_counts (category, places_count) VALUES ('🍸 Bars & Wine', 1)
ON CONFLICT (category) DO UPDATE SET places_count = places_count + 1;
```

### UPDATE Flow

```sql
-- User changes place from city_id = 'abc-123' to 'xyz-456'
-- Categories change from ['🍽 Food & Drinks'] to ['🌅 Scenic & Rooftop Views']

-- Trigger 1: update_city_places_count()
UPDATE cities SET places_count = GREATEST(0, places_count - 1) WHERE id = 'abc-123';
UPDATE cities SET places_count = places_count + 1 WHERE id = 'xyz-456';

-- Trigger 2: update_category_places_count()
-- Removed: '🍽 Food & Drinks'
UPDATE category_counts SET places_count = GREATEST(0, places_count - 1) WHERE category = '🍽 Food & Drinks';

-- Added: '🌅 Scenic & Rooftop Views'
INSERT INTO category_counts (category, places_count) VALUES ('🌅 Scenic & Rooftop Views', 1)
ON CONFLICT (category) DO UPDATE SET places_count = places_count + 1;
```

### DELETE Flow

```sql
-- User deletes a place with city_id = 'abc-123' and categories = ['🍽 Food & Drinks']

-- Trigger 1: update_city_places_count()
UPDATE cities SET places_count = GREATEST(0, places_count - 1) WHERE id = 'abc-123';

-- Trigger 2: update_category_places_count()
UPDATE category_counts SET places_count = GREATEST(0, places_count - 1) WHERE category = '🍽 Food & Drinks';
```

## Edge Cases Handled

1. **NULL values**
   - `city_id IS NULL` → No counter update
   - `categories IS NULL` → Treated as empty array

2. **Empty arrays**
   - `categories = ARRAY[]` → No counter updates

3. **Negative counts prevention**
   - Uses `GREATEST(0, places_count - 1)` to prevent negatives
   - Handles race conditions and data inconsistencies

4. **New categories**
   - Automatically creates entries in `category_counts` via `ON CONFLICT`
   - No manual category registration needed

5. **Array diff on UPDATE**
   - Only updates categories that actually changed
   - Compares old vs new arrays to minimize updates

6. **Transactions**
   - All updates happen in the same transaction as the place change
   - Atomic: either all succeed or all fail

## Usage in Frontend

### Before (Slow)
```typescript
// Expensive COUNT query
const { count } = await supabase
  .from('places')
  .select('*', { count: 'exact', head: true })
  .eq('city_id', cityId);
```

### After (Fast)
```typescript
// Simple SELECT from cached counter
const { data } = await supabase
  .from('cities')
  .select('places_count')
  .eq('id', cityId)
  .single();

const count = data?.places_count || 0;
```

### Category Counts
```typescript
// Get count for a category
const { data } = await supabase
  .from('category_counts')
  .select('places_count')
  .eq('category', '🍽 Food & Drinks')
  .single();

const count = data?.places_count || 0;
```

## Performance Benefits

1. **No COUNT queries** - O(1) lookup instead of O(n) scan
2. **Indexed lookups** - `cities.places_count_idx` and `category_counts_places_count_idx`
3. **Reduced database load** - Counters updated once per write, read many times
4. **Scalable** - Performance doesn't degrade as places table grows

## Maintenance

### Initial Population

Counters are automatically initialized when you run the SQL script:
- City counts: `UPDATE cities SET places_count = (SELECT COUNT(*) FROM places WHERE city_id = cities.id)`
- Category counts: Aggregated from all existing places

### Verification

Run verification queries at the end of the SQL script to check for discrepancies:
```sql
-- Find cities with incorrect counts
SELECT c.name, c.places_count, 
       (SELECT COUNT(*) FROM places WHERE city_id = c.id) AS actual_count
FROM cities c
WHERE c.places_count != (SELECT COUNT(*) FROM places WHERE city_id = c.id);
```

### Re-sync Counters (if needed)

If counters get out of sync (shouldn't happen, but just in case):
```sql
-- Re-sync city counts
UPDATE cities
SET places_count = (
    SELECT COUNT(*)
    FROM places
    WHERE places.city_id = cities.id
);

-- Re-sync category counts
WITH category_occurrences AS (
    SELECT unnest(categories) AS category
    FROM places
    WHERE categories IS NOT NULL AND array_length(categories, 1) > 0
)
INSERT INTO category_counts (category, places_count)
SELECT category, COUNT(*)::INTEGER
FROM category_occurrences
WHERE category IS NOT NULL AND TRIM(category) != ''
GROUP BY category
ON CONFLICT (category) DO UPDATE
SET places_count = EXCLUDED.places_count;
```

## Security

- **RLS enabled** on `category_counts` table
- **Read-only** for public users
- **Write access** only via triggers (SECURITY DEFINER)
- **Service role** required for manual updates

## Migration Steps

1. **Run SQL script** in Supabase Dashboard > SQL Editor:
   ```sql
   -- Execute: create-persistent-counters.sql
   ```

2. **Verify initialization**:
   ```sql
   SELECT SUM(places_count) FROM cities;
   SELECT SUM(places_count) FROM category_counts;
   ```

3. **Update frontend code** to use counters instead of COUNT queries

4. **Monitor** for any discrepancies (run verification queries periodically)

## Notes

- Counters are updated **synchronously** with place changes (same transaction)
- No background jobs or async processing needed
- Counters are **always consistent** with actual data
- Handles **concurrent updates** safely (Postgres ACID guarantees)
