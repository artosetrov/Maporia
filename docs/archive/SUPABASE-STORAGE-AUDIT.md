# Supabase Storage Buckets Audit

## Required Buckets

### 1. `avatars` Bucket

**Purpose:** User profile pictures

**Configuration:**
- **Public:** Yes (for `getPublicUrl()`)
- **File size limit:** 5MB (recommended)
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`

**Used in:**
- `app/profile/page.tsx` - Profile avatar upload
- `app/profile/edit/avatar/page.tsx` - Avatar editing

**Operations:**
- `upload()` - Authenticated users upload their own avatar
- `getPublicUrl()` - Public read access
- `remove()` - Users delete their own avatar

**Required Policies:**

```sql
-- Policy: Public read access
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Policy: Authenticated users can upload
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own avatar, admins can delete any
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_admin = TRUE OR role = 'admin')
    )
  )
);
```

**File Path Structure:**
- `{user_id}/{filename}.{ext}`
- Example: `550e8400-e29b-41d4-a716-446655440000/avatar.jpg`

### 2. `place-photos` Bucket

**Purpose:** Place photos

**Configuration:**
- **Public:** Yes (for `getPublicUrl()`)
- **File size limit:** 10MB (recommended)
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`

**Used in:**
- `app/places/[id]/edit/photos/page.tsx` - Place photo upload

**Operations:**
- `upload()` - Place owners upload photos
- `getPublicUrl()` - Public read access
- `remove()` - Place owners or admins delete photos

**Required Policies:**

```sql
-- Policy: Public read access
CREATE POLICY "Place photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'place-photos');

-- Policy: Place owners can upload photos
CREATE POLICY "Place owners can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'place-photos'
  AND EXISTS (
    SELECT 1 FROM places
    WHERE id::text = (storage.foldername(name))[1]
    AND created_by = auth.uid()
  )
);

-- Policy: Admins can upload photos to any place
CREATE POLICY "Admins can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'place-photos'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR role = 'admin')
  )
);

-- Policy: Place owners can update their photos
CREATE POLICY "Place owners can update their photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'place-photos'
  AND EXISTS (
    SELECT 1 FROM places
    WHERE id::text = (storage.foldername(name))[1]
    AND created_by = auth.uid()
  )
);

-- Policy: Place owners and admins can delete photos
CREATE POLICY "Place owners and admins can delete photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'place-photos'
  AND (
    EXISTS (
      SELECT 1 FROM places
      WHERE id::text = (storage.foldername(name))[1]
      AND created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_admin = TRUE OR role = 'admin')
    )
  )
);
```

**File Path Structure:**
- `places/{place_id}/{filename}.{ext}`
- Example: `places/550e8400-e29b-41d4-a716-446655440000/photo1.jpg`

## Audit Checklist

### In Supabase Dashboard → Storage

1. **Verify Buckets Exist:**
   - [ ] `avatars` bucket exists
   - [ ] `place-photos` bucket exists

2. **Verify Bucket Settings:**
   - [ ] `avatars` is public
   - [ ] `place-photos` is public
   - [ ] File size limits are set appropriately
   - [ ] MIME type restrictions are set (optional but recommended)

3. **Verify Storage Policies:**
   - [ ] Run the SQL queries below to check policies
   - [ ] Policies match the requirements above

## SQL Queries to Check Storage Policies

```sql
-- Check all storage policies
SELECT 
  name as "Policy Name",
  bucket_id as "Bucket",
  operation as "Operation",
  definition as "Policy Definition",
  check_definition as "Check Definition"
FROM storage.policies
ORDER BY bucket_id, operation;

-- Check policies for avatars bucket
SELECT 
  name,
  operation,
  definition,
  check_definition
FROM storage.policies
WHERE bucket_id = 'avatars'
ORDER BY operation;

-- Check policies for place-photos bucket
SELECT 
  name,
  operation,
  definition,
  check_definition
FROM storage.policies
WHERE bucket_id = 'place-photos'
ORDER BY operation;

-- Check if buckets exist
SELECT 
  id as "Bucket ID",
  name as "Bucket Name",
  public as "Is Public",
  file_size_limit as "File Size Limit",
  allowed_mime_types as "Allowed MIME Types"
FROM storage.buckets
WHERE name IN ('avatars', 'place-photos')
ORDER BY name;
```

## Setup Instructions

### Create Buckets

1. Go to Supabase Dashboard → Storage
2. Click "New bucket"
3. Create `avatars` bucket:
   - Name: `avatars`
   - Public: ✅ Yes
   - File size limit: 5MB
   - Allowed MIME types: `image/jpeg, image/png, image/webp`
4. Create `place-photos` bucket:
   - Name: `place-photos`
   - Public: ✅ Yes
   - File size limit: 10MB
   - Allowed MIME types: `image/jpeg, image/png, image/webp`

### Create Policies

Run the policy SQL above in Supabase Dashboard → SQL Editor.

**Note:** The file path structure in policies assumes:
- Avatars: `{user_id}/{filename}`
- Place photos: `places/{place_id}/{filename}`

If your code uses a different structure, adjust the policies accordingly.

## Testing

### Test Avatar Upload
1. Sign in as a user
2. Go to profile edit page
3. Upload an avatar
4. Verify it's accessible via public URL
5. Try to upload as another user (should fail)
6. Delete your own avatar (should succeed)

### Test Place Photo Upload
1. Sign in as a user
2. Create or edit a place
3. Upload photos
4. Verify they're accessible via public URL
5. Try to upload to another user's place (should fail)
6. Delete photos from your place (should succeed)

## Issues Found

### Current Implementation
- ✅ Buckets are referenced in code (`avatars`, `place-photos`)
- ⚠️ Storage policies need to be verified/created
- ⚠️ File path structure may need verification

### Recommendations
1. Verify bucket policies match the requirements above
2. Test upload/delete operations with different user roles
3. Consider adding file validation on the client side
4. Consider adding image optimization/resizing before upload
