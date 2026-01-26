# Supabase Sync Summary

## ✅ Completed Actions

### 1. Environment Variables Audit ✅
- ✅ Verified `NEXT_PUBLIC_SUPABASE_URL` usage (no localhost URLs in production)
- ✅ Verified `NEXT_PUBLIC_SUPABASE_ANON_KEY` usage
- ✅ Documented `SUPABASE_SERVICE_ROLE_KEY` usage (with fallback to anon key)
- ✅ Created `.env.example` file with all required variables

### 2. Documentation ✅
- ✅ Updated `README.md` with comprehensive Supabase setup instructions
- ✅ Added Supabase CLI installation and linking instructions
- ✅ Added database migration instructions
- ✅ Added TypeScript type generation instructions
- ✅ Added storage bucket setup instructions
- ✅ Created `SUPABASE-AUDIT.md` with detailed audit findings

### 3. TypeScript Types Setup ✅
- ✅ Created `app/types/supabase.ts` with placeholder structure
- ✅ Added instructions for generating types
- ✅ Updated `app/lib/supabase.ts` to use `Database` type
- ✅ Added npm scripts for type generation:
  - `npm run db:types` - Generate types from linked project
  - `npm run db:types:local` - Generate types from local project

### 4. Package.json Updates ✅
- ✅ Added Supabase CLI scripts:
  - `npm run db:pull` - Pull database schema
  - `npm run db:push` - Push migrations to database
  - `npm run db:types` - Generate TypeScript types

## ⚠️ Remaining Actions (Manual Steps Required)

### 1. Install Supabase CLI
```bash
# macOS
brew install supabase/tap/supabase

# Or npm
npm install -g supabase
```

### 2. Link to Supabase Project
```bash
supabase link --project-ref your-project-ref
```

### 3. Pull Database Schema
```bash
npm run db:pull
# Or: supabase db pull
```

This will create a `supabase/` directory with your schema.

### 4. Generate TypeScript Types
```bash
npm run db:types
# Or: supabase gen types typescript --linked > app/types/supabase.ts
```

**Important:** Replace the placeholder types in `app/types/supabase.ts` with the generated types.

### 5. Audit RLS Policies

Run these queries in Supabase Dashboard → SQL Editor to verify RLS policies:

```sql
-- Check RLS status for all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check policies for each table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Tables to verify:**
- ✅ `places` - Policies defined in `rls-role-based-policies.sql`
- ✅ `profiles` - Policies defined in `rls-role-based-policies.sql`
- ⚠️ `cities` - Need to verify policies
- ⚠️ `comments` - Need to verify policies
- ⚠️ `reactions` - Need to verify policies
- ⚠️ `place_photos` - Need to verify policies
- ⚠️ `app_settings` - Need to verify policies

### 6. Audit Storage Buckets

In Supabase Dashboard → Storage, verify:

**Bucket: `avatars`**
- ✅ Exists
- ✅ Public: Yes
- ✅ Policies:
  - SELECT: Public
  - INSERT: Authenticated users
  - UPDATE: Owner only
  - DELETE: Owner or admin

**Bucket: `place-photos`**
- ✅ Exists
- ✅ Public: Yes
- ✅ Policies:
  - SELECT: Public
  - INSERT: Authenticated users
  - UPDATE: Owner only
  - DELETE: Owner or admin

### 7. Run Production Build

```bash
npm run build
```

Fix any TypeScript errors related to database types.

## 📋 Files Changed

### Created
- ✅ `.env.example` - Environment variables template
- ✅ `app/types/supabase.ts` - TypeScript database types (placeholder)
- ✅ `SUPABASE-AUDIT.md` - Comprehensive audit report
- ✅ `SUPABASE-SYNC-SUMMARY.md` - This file

### Modified
- ✅ `README.md` - Added Supabase setup instructions
- ✅ `app/lib/supabase.ts` - Added Database type
- ✅ `package.json` - Added Supabase CLI scripts

## 🔧 Commands to Run Locally

### Initial Setup
```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 3. Install Supabase CLI (if not already installed)
npm install -g supabase
# Or: brew install supabase/tap/supabase

# 4. Link to your Supabase project
supabase link --project-ref your-project-ref

# 5. Pull database schema
npm run db:pull

# 6. Generate TypeScript types
npm run db:types

# 7. Run migrations (if needed)
# In Supabase Dashboard → SQL Editor, run:
# - add-cities-table-and-migration.sql
# - add-user-roles-fields.sql
# - rls-role-based-policies.sql
# - create-premium-modal-settings-table.sql

# 8. Start development server
npm run dev
```

### Regular Development
```bash
# After schema changes in Supabase Dashboard
npm run db:pull        # Pull latest schema
npm run db:types       # Regenerate types

# After creating new migrations
npm run db:push        # Push migrations to database
```

## 🚀 Deployment Commands

### Vercel
1. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (optional)

2. Deploy:
```bash
vercel --prod
```

### Other Platforms
Ensure all environment variables from `.env.example` are set in your deployment platform.

## 📊 Mismatches Found

### Type Mismatches (After Generating Types)
Once you run `npm run db:types`, compare the generated types with:
- `app/types.ts` - Manual types (may need updates)
- Code using `.from()` queries - May need type assertions

### Schema Mismatches
After pulling schema, verify:
- All tables exist as expected
- All columns match code expectations
- All RPC functions exist:
  - `get_or_create_city`
  - `is_admin`
  - `has_premium_access`
  - `get_user_role`
  - `update_premium_modal_settings`

### RLS Policy Mismatches
Verify policies match product needs:
- Guest users can view public places ✅
- Authenticated users can create places ✅
- Premium users can view premium places ✅
- Admins have full access ✅
- Owners can edit/delete their own places ✅

**Use `SUPABASE-RLS-AUDIT.sql` to check current policies.**

### Storage Policy Mismatches
Verify storage buckets and policies:
- `avatars` bucket exists and is public ✅
- `place-photos` bucket exists and is public ✅
- Upload policies allow authenticated users ✅
- Delete policies allow owners/admins only ✅

**Use `SUPABASE-STORAGE-AUDIT.md` for detailed audit.**

## 🎯 Next Steps

1. **Run Supabase CLI commands** (see above)
2. **Generate actual types** and replace placeholder
3. **Verify RLS policies** for all tables
   - Run queries from `SUPABASE-RLS-AUDIT.sql`
   - Compare with expected policies in the file
4. **Verify storage bucket policies**
   - Follow checklist in `SUPABASE-STORAGE-AUDIT.md`
   - Create buckets if they don't exist
   - Create policies if they don't exist
5. **Run production build** and fix any type errors
6. **Test all CRUD operations** to ensure RLS works correctly
7. **Test storage upload/delete** operations

## 📝 Notes

- The placeholder types in `app/types/supabase.ts` are based on codebase analysis
- Actual types will be more accurate after running `supabase gen types`
- Some tables may have additional fields not captured in the placeholder
- RLS policies are defined in `rls-role-based-policies.sql` but should be verified in production
