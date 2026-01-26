# Supabase Audit & Sync Report

## 1. Environment Variables Audit ✅

### Required Variables

**Client-side (NEXT_PUBLIC_*):**
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Validated in `app/lib/supabase.ts`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Validated in `app/lib/supabase.ts`

**Server-side (API routes):**
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` - Used in:
  - `app/api/admin/premium-modal-settings/route.ts`
  - `app/api/cities/resolve/route.ts`
  - Falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` if not set (not ideal for production)

### Localhost URL Check ✅

**No localhost URLs found in production code:**
- ✅ `app/lib/supabase.ts` uses `window.location.origin` dynamically (supports both localhost and production)
- ✅ All SVG xmlns attributes are standard (not URLs)
- ✅ No hardcoded localhost Supabase URLs

### Issues Found

1. **Service Role Key Fallback**: API routes fall back to anon key if service role key is missing. This should be required for admin operations.
2. **Missing .env.example**: No example environment file for developers.

## 2. Database Tables Used

Based on codebase analysis, the following tables are used:

### Core Tables
- `profiles` - User profiles
- `places` - Place listings
- `place_photos` - Place photos (separate table)
- `cities` - City references
- `comments` - Place comments
- `reactions` - Place likes/reactions
- `favorites` - User favorite places (if exists)
- `app_settings` - App configuration (premium modal settings)

### Storage Buckets
- `avatars` - User profile avatars
- `place-photos` - Place photos

## 3. RLS Policies Status

### Existing Policy Files
- `rls-role-based-policies.sql` - Comprehensive role-based policies
- `fix-rls-policies.sql` - Policy fixes
- `fix-rls-update-policies.sql` - Update policy fixes

### Tables with RLS
- `places` - ✅ Policies defined
- `profiles` - ✅ Policies defined (in rls-role-based-policies.sql)
- `cities` - ⚠️ Need to verify
- `comments` - ⚠️ Need to verify
- `reactions` - ⚠️ Need to verify
- `place_photos` - ⚠️ Need to verify
- `app_settings` - ⚠️ Need to verify

## 4. Storage Buckets

### Buckets Used
1. **`avatars`** - User profile pictures
   - Used in: `app/profile/page.tsx`, `app/profile/edit/avatar/page.tsx`
   - Operations: upload, getPublicUrl, remove

2. **`place-photos`** - Place photos
   - Used in: `app/places/[id]/edit/photos/page.tsx`
   - Operations: upload, getPublicUrl, remove

### Storage Policies Needed
- ✅ Public read access for avatars (getPublicUrl used)
- ✅ Public read access for place-photos (getPublicUrl used)
- ⚠️ Upload policies need verification (authenticated users only?)
- ⚠️ Delete policies need verification (owners/admins only?)

## 5. TypeScript Types Status

### Current State
- ❌ No generated database types from Supabase
- ✅ Manual types in `app/types.ts` (Profile, Place, etc.)
- ⚠️ Types may not match actual database schema

### Needed
- Generate types using `supabase gen types typescript`
- Refactor `app/lib/supabase.ts` to use `Database` type
- Update all `.from()` calls to use typed tables

## 6. Migration Files Status

### Existing SQL Files (16 files)
1. `add-all-place-fields.sql`
2. `add-cities-table-and-migration.sql`
3. `add-comments-enabled-field.sql`
4. `add-place-visibility-fields.sql`
5. `add-profile-google-fields.sql`
6. `add-user-roles-fields.sql`
7. `create-premium-modal-settings-table.sql`
8. `fix-premium-places-on-map.sql`
9. `fix-production-loading-issues.sql`
10. `fix-rls-policies.sql`
11. `fix-rls-update-policies.sql`
12. `rls-role-based-policies.sql`
13. `set-admin-xdegonx.sql`
14. `setup-admin.sql`
15. `update-edit-pages-for-admin.sql`
16. `delete-test-place.sql`

### Issues
- ⚠️ Migrations are not organized in a migrations folder
- ⚠️ No migration tracking/versioning
- ⚠️ Some migrations may have been run manually in Supabase dashboard

## 7. Supabase CLI Status

### Current State
- ❌ No Supabase CLI setup documented
- ❌ No `supabase/` directory
- ❌ No `supabase/config.toml`
- ❌ No local development setup

### Needed
- Install Supabase CLI
- Link to remote project: `supabase link`
- Pull schema: `supabase db pull`
- Generate types: `supabase gen types typescript`

## 8. Action Items

### High Priority
1. ✅ Verify env vars (done - no localhost URLs found)
2. ⚠️ Create `.env.example` file
3. ⚠️ Add Supabase CLI setup to README
4. ⚠️ Pull database schema
5. ⚠️ Generate TypeScript types
6. ⚠️ Refactor supabase client with Database typing
7. ⚠️ Audit and document RLS policies for all tables
8. ⚠️ Audit and document Storage bucket policies

### Medium Priority
9. Organize migration files into `supabase/migrations/` folder
10. Set up local Supabase development environment
11. Add migration versioning/tracking

### Low Priority
12. Add database schema documentation
13. Add RLS policy testing
14. Add storage policy testing
