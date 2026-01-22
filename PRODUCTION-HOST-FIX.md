# Production Host Fix - Desktop vs Mobile

## Problem
Desktop doesn't work, mobile works. Likely due to www vs non-www host differences.

## Solution Implemented

### 1. Runtime Diagnostics (Production Only)
Added `ProductionDiagnostics` component that logs:
- ✅ `window.location.href`, `origin`, `host`
- ✅ Environment variables (boolean only, no values)
- ✅ Supabase session status
- ✅ Google Maps loading status
- ✅ First failing request + URL + status
- ✅ Service Worker detection and unregistration

### 2. Canonical Host Redirect
Added redirect in `next.config.ts`:
- ✅ Redirects `www.maporia.co` → `maporia.co` (308 permanent)
- ✅ Ensures consistent host across all requests

### 3. Dynamic Auth Redirects
Updated `getAuthRedirectUrl()`:
- ✅ Always uses `window.location.origin` (not hardcoded)
- ✅ Supports both www and non-www automatically
- ✅ Logs redirect URL in production for debugging

### 4. Service Worker Cache Bust
- ✅ Automatically unregisters Service Workers on load
- ✅ Reloads page after unregistration to clear cache

## Required Manual Configuration

See `SETUP-DUAL-HOST.md` for detailed step-by-step instructions.

### Quick Checklist

1. **Supabase Auth Settings**
   - Site URL: `https://maporia.co` (canonical)
   - Redirect URLs: Add both `https://maporia.co/**` and `https://www.maporia.co/**`

2. **Google Maps API Key**
   - HTTP referrers: Add both `https://maporia.co/*` and `https://www.maporia.co/*`

3. **Vercel Domain Settings**
   - Ensure both domains are configured
   - `www.maporia.co` should redirect to `maporia.co` (handled by `next.config.ts`)

## Files Modified

- ✅ `app/lib/diagnostics.ts` - Diagnostic logging functions
- ✅ `app/components/ProductionDiagnostics.tsx` - Diagnostic component
- ✅ `app/layout.tsx` - Added diagnostics component
- ✅ `app/lib/supabase.ts` - Enhanced `getAuthRedirectUrl()` with logging
- ✅ `next.config.ts` - Added www → non-www redirect
- ✅ `app/map/page.tsx` - Added Google Maps status logging
- ✅ `app/explore/page.tsx` - Added Google Maps status logging

## Testing

After deployment:
1. Open `https://maporia.co` on desktop
2. Open `https://www.maporia.co` on desktop
3. Check console for diagnostics output
4. Verify both hosts work correctly
5. Check that www redirects to non-www

## Console Output (Production)

You should see:
```
🔍 Production Diagnostics
  📍 Location: { href, origin, host, ... }
  🔐 Environment Variables: { hasSupabaseUrl: true, ... }
  🔐 Supabase Status: { hasSession: true/false, ... }
  🗺️ Google Maps Status: { Loaded: true/false, ... }
```

If there's a failure:
```
❌ First Request Failure
  URL: https://...
  Status: 403/404/...
  Error: ...
```
