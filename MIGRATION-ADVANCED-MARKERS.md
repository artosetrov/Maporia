# Migration Plan: Google Maps Advanced Markers

## Status
⚠️ **Current**: Using deprecated `google.maps.Marker`  
✅ **Target**: Migrate to `google.maps.marker.AdvancedMarkerElement`

## Background
As of February 21st, 2024, `google.maps.Marker` is deprecated. While it will continue to work for at least 12 months, migration to `AdvancedMarkerElement` is recommended for:
- Future compatibility
- Better performance
- Access to new features
- Bug fixes

## Requirements for Migration

### 1. Map ID Configuration
Advanced Markers require cloud-based map styling with a `mapId`:
- Create a map ID in Google Cloud Console
- Add `mapId` to `GoogleMap` component options
- Use `DEMO_MAP_ID` for testing: `"DEMO_MAP_ID"`

### 2. Library Updates
Add `marker` library to `GOOGLE_MAPS_LIBRARIES`:
```typescript
export const GOOGLE_MAPS_LIBRARIES = ["places", "marker"];
```

### 3. Component Changes
Replace `Marker` with `AdvancedMarker`:
```typescript
// Before
import { Marker } from "@react-google-maps/api";
<Marker position={...} icon={...} />

// After
import { AdvancedMarker } from "@react-google-maps/api";
<AdvancedMarker position={...}>
  <Pin />
</AdvancedMarker>
```

## Files to Update

1. **app/config/googleMaps.ts**
   - Add `mapId` configuration
   - Add `"marker"` to `GOOGLE_MAPS_LIBRARIES`

2. **app/map/page.tsx**
   - Replace `Marker` with `AdvancedMarker`
   - Add `mapId` to `GoogleMap` options
   - Update icon configuration (use `Pin` component or custom HTML)

3. **app/explore/page.tsx**
   - Same changes as map/page.tsx

4. **app/id/[id]/page.tsx**
   - Same changes as map/page.tsx

5. **app/places/[id]/edit/location/page.tsx**
   - Same changes as map/page.tsx

6. **app/components/LazyMap.tsx**
   - Update dynamic import to use `AdvancedMarker`

## Migration Steps

### Step 1: Configuration
1. Create map ID in Google Cloud Console (or use `DEMO_MAP_ID` for testing)
2. Update `app/config/googleMaps.ts`:
   ```typescript
   export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
   export const GOOGLE_MAPS_LIBRARIES = ["places", "marker"];
   ```

### Step 2: Update GoogleMap Components
Add `mapId` to all `GoogleMap` components:
```typescript
<GoogleMap
  mapContainerStyle={...}
  options={{
    mapId: GOOGLE_MAPS_MAP_ID,
    // ... other options
  }}
>
```

### Step 3: Replace Marker Components
For each `Marker` usage:
- Replace with `AdvancedMarker`
- Convert icon configuration to `Pin` component or custom HTML
- Update event handlers (they remain the same)

### Step 4: Testing
- Test all map views (map page, explore page, place detail page)
- Verify custom icons (round icons) work correctly
- Test marker interactions (click, hover)
- Verify InfoWindow still works

## Custom Icons Migration

Current implementation uses custom round icons. For AdvancedMarker:
- Option 1: Use `Pin` component with custom colors
- Option 2: Use custom HTML content with images
- Option 3: Use `AdvancedMarker` with `content` prop

## Resources
- [Google Maps Advanced Markers Migration Guide](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration)
- [@react-google-maps/api AdvancedMarker Docs](https://visgl.github.io/react-google-maps/docs/api-reference/components/advanced-marker)
- [Advanced Markers Overview](https://developers.google.com/maps/documentation/javascript/advanced-markers)

## Timeline
- **Priority**: Medium (not urgent, but recommended)
- **Estimated Effort**: 4-6 hours
- **Risk**: Low (can be done incrementally, tested per page)
