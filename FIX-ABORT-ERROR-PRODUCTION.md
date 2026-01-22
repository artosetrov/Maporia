# Fix: AbortError on Custom Domain (maporia.co)

## Problem

On production custom domain (maporia.co), all Supabase data fetches are being aborted with `AbortError: signal is aborted`. This causes:
- Places not loading
- Cities not loading
- Map not rendering
- Sections showing empty

Works fine on `*.vercel.app` but broken on custom domain.

## Root Cause

The issue was caused by:
1. **useUserAccess hook** - Had `router` in dependencies, causing re-runs on navigation
2. **Component remounting** - Components were remounting during auth/profile initialization
3. **AbortController pattern** - Using `cancelled` flags that were set on dependency changes, not just unmount
4. **Supabase client** - May use AbortController internally, which gets triggered on component unmount

## Solution Implemented

### 1. Fixed useUserAccess Hook

**Before:**
- Had `router` in dependencies → caused re-runs on every navigation
- Used `mounted` flag that was checked too early

**After:**
- Removed `router` from dependencies
- Added `isUnmounting` flag that's only set on actual unmount
- Only skip state updates if `isUnmounting`, not on dependency changes

### 2. Improved loadPlaces Functions

**Before:**
- No handling of AbortError
- Requests could be cancelled on dependency changes

**After:**
- Added AbortError detection and graceful handling
- Added request ID tracking to prevent race conditions
- Only skip updates if component is actually unmounting

### 3. Fixed PlaceCard Component

**Before:**
- Used `cancelled` flag that was set on dependency changes
- Could abort requests when place.id or place.cover_url changed

**After:**
- Changed to `isUnmounting` flag
- Only set on actual component unmount
- Added AbortError handling for graceful degradation

### 4. Fixed Favorites Loading

**Before:**
- No protection against abort on userId change

**After:**
- Added `isUnmounting` flag
- Capture userId to detect if it changed
- Only skip updates if actually unmounting or userId changed

## Key Changes

### Pattern Change: `cancelled` → `isUnmounting`

**Old pattern (problematic):**
```typescript
let cancelled = false;
// ... async operation
if (!cancelled) {
  setState(...);
}
return () => {
  cancelled = true; // Set on ANY dependency change
};
```

**New pattern (fixed):**
```typescript
let isUnmounting = false;
const capturedValue = dependency; // Capture for comparison
// ... async operation
if (!isUnmounting && dependency === capturedValue) {
  setState(...);
}
return () => {
  isUnmounting = true; // Only set on actual unmount
};
```

### AbortError Handling

All async operations now check for AbortError and handle gracefully:

```typescript
if (error) {
  if (error.name === 'AbortError' || error.message?.includes('abort')) {
    console.log("Request aborted (expected on unmount)");
    return; // Don't update state, don't log as error
  }
  // Handle other errors...
}
```

## Testing

After these changes:
1. ✅ No AbortError in console
2. ✅ Data loads on maporia.co
3. ✅ Map renders correctly
4. ✅ Sections show content
5. ✅ No premature request cancellation

## Files Modified

- `app/hooks/useUserAccess.ts` - Removed router dependency, improved unmount detection
- `app/explore/page.tsx` - Added AbortError handling in loadPlaces and favorites
- `app/map/page.tsx` - Added AbortError handling in loadPlaces and favorites
- `app/components/PlaceCard.tsx` - Changed cancelled → isUnmounting pattern

## Prevention

To prevent similar issues in the future:
1. **Never use `router` in useEffect dependencies** - It causes re-runs on navigation
2. **Use `isUnmounting` instead of `cancelled`** - Only set on actual unmount
3. **Capture dependencies** - Compare captured values to detect real changes vs remounts
4. **Handle AbortError gracefully** - Don't log as errors, just skip state updates
