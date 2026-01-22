# Setup Guide: Dual Host Support (www + non-www)

## Problem
Desktop users may access via `www.maporia.co` while mobile uses `maporia.co`, causing auth/API issues.

## Solution

### 1. Code Changes (✅ Already Done)

- ✅ `next.config.ts` - Redirects www → non-www (308 permanent)
- ✅ `getAuthRedirectUrl()` - Uses `window.location.origin` (supports both)
- ✅ Production diagnostics - Logs host info for debugging

### 2. Supabase Configuration (Manual)

#### Step 1: Go to Supabase Dashboard
1. Navigate to: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **URL Configuration**

#### Step 2: Update Site URL
Set **Site URL** to canonical (non-www):
```
https://maporia.co
```

#### Step 3: Add Redirect URLs
In **Redirect URLs**, add BOTH:
```
https://maporia.co/**
https://www.maporia.co/**
```

This allows auth redirects from both hosts.

### 3. Google Maps API Configuration (Manual)

#### Step 1: Go to Google Cloud Console
1. Navigate to: https://console.cloud.google.com/
2. Select your project
3. Go to **APIs & Services** → **Credentials**

#### Step 2: Edit API Key
1. Click on your Google Maps API key
2. Scroll to **Application restrictions**
3. Select **HTTP referrers (web sites)**

#### Step 3: Add Both Domains
Add BOTH domains with wildcards:
```
https://maporia.co/*
https://www.maporia.co/*
```

#### Step 4: Save
Click **Save** and wait 1-2 minutes for changes to propagate.

### 4. Vercel Domain Configuration (Manual)

#### Option A: Use Vercel Redirect (Recommended)
1. Go to Vercel Dashboard → Project → Settings → Domains
2. Ensure both domains are added:
   - `maporia.co` (primary)
   - `www.maporia.co` (redirects to primary)

#### Option B: Use Next.js Redirect (Already Done)
The `next.config.ts` already has a redirect rule that redirects `www.maporia.co` → `maporia.co`.

### 5. Testing

After configuration:

1. **Test non-www:**
   - Open `https://maporia.co` on desktop
   - Check console for diagnostics
   - Verify data loads

2. **Test www redirect:**
   - Open `https://www.maporia.co` on desktop
   - Should redirect to `https://maporia.co`
   - Check console for diagnostics
   - Verify data loads

3. **Test auth:**
   - Try signing in from both hosts
   - Verify redirect works correctly
   - Check that session persists

## Console Output (Production)

When you open the app, you should see:

```
🔍 Production Diagnostics
  📍 Location: {
    href: "https://maporia.co/...",
    origin: "https://maporia.co",
    host: "maporia.co",
    ...
  }
  🔐 Environment Variables: {
    hasSupabaseUrl: true,
    hasSupabaseKey: true,
    hasGoogleMapsKey: true,
    nodeEnv: "production"
  }
  🔐 Supabase Status: {
    hasSession: true/false,
    userId: "...",
    email: "..."
  }
  🗺️ Google Maps Status: {
    Loaded: true/false,
    ...
  }
```

If there's a failure:
```
❌ First Request Failure
  URL: https://...
  Status: 403/404/...
  Error: ...
```

## Troubleshooting

### Issue: Auth redirect fails
- **Check:** Supabase Redirect URLs include both domains
- **Check:** `getAuthRedirectUrl()` is using `window.location.origin`

### Issue: Google Maps doesn't load
- **Check:** Google API key referrer restrictions include both domains
- **Check:** Console for Google Maps load error

### Issue: www doesn't redirect
- **Check:** Vercel domain settings
- **Check:** `next.config.ts` redirect rule

### Issue: Service Worker cache
- **Auto-fixed:** Service Workers are automatically unregistered on load
- Page will reload after unregistration

## Files Modified

- ✅ `app/lib/diagnostics.ts` - Diagnostic logging
- ✅ `app/components/ProductionDiagnostics.tsx` - Diagnostic component
- ✅ `app/layout.tsx` - Added diagnostics
- ✅ `app/lib/supabase.ts` - Enhanced `getAuthRedirectUrl()`
- ✅ `next.config.ts` - Added www → non-www redirect
- ✅ `app/map/page.tsx` - Google Maps status logging
- ✅ `app/explore/page.tsx` - Google Maps status logging
