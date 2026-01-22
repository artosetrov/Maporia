# User Roles and Access Control Implementation

This document describes the implementation of the role-based access control system for Maporia.

## User Roles

Maporia has exactly four user types:

### 1. Guest
- **Description**: User is not authenticated
- **Permissions**:
  - Can view public places only
  - Can browse map, lists, and public place detail pages
- **Restrictions**:
  - Cannot like, comment, or save places
  - Cannot add places
  - Cannot view premium places
- **UX**: Any restricted action opens an auth modal (sign up / login)

### 2. Standard User
- **Description**: Authenticated user without an active subscription
- **Permissions**:
  - All Guest permissions
  - Like places
  - Comment on places
  - Add new places (public only)
  - View own profile
- **Restrictions**:
  - Cannot view premium-only places
  - Cannot add or edit premium places
- **UX**: Premium content is visually locked with upgrade-to-premium CTA

### 3. Premium User
- **Description**: Authenticated user with an active paid subscription
- **Conditions**: `subscription_status = 'active'`
- **Permissions**:
  - All Standard User permissions
  - View premium-only places
  - Access premium collections and routes
  - Save premium places
  - Create premium places
- **Restrictions**: No admin privileges

### 4. Admin
- **Description**: Platform administrator
- **Permissions**:
  - Full access to all content
  - View, create, edit, delete any place
  - Mark places as public or premium
  - Moderate comments and users
  - Access admin-only UI and tools
- **Restrictions**: None

## Database Schema

### Profiles Table Fields

The following fields are required in the `profiles` table:

- `role` (TEXT): User role - `'guest'`, `'standard'`, `'premium'`, or `'admin'`
- `subscription_status` (TEXT): Subscription status - `'active'` or `'inactive'`
- `is_admin` (BOOLEAN): Indicates if user is an administrator

### Migration

Run the SQL script to add these fields:

```bash
# Execute in Supabase Dashboard > SQL Editor
add-user-roles-fields.sql
```

This script:
1. Adds `role` field with default `'standard'`
2. Adds `subscription_status` field with default `'inactive'`
3. Ensures `is_admin` field exists
4. Creates helper functions for role checks
5. Updates existing profiles to have correct roles

## Access Control Logic

### Role Determination

The `getUserAccess()` function in `app/lib/access.ts` determines user role:

1. **Guest**: No profile or no authenticated user
2. **Admin**: `profile.is_admin === true` OR `profile.role === 'admin'`
3. **Premium**: `profile.subscription_status === 'active'` (and not admin)
4. **Standard**: Authenticated but no active subscription

### Premium Access Check

Premium access is granted if:
- `user.role === "premium"` OR
- `user.role === "admin"` OR
- `user.subscription_status === "active"`

### Admin Bypass

Admin users bypass all permission checks and have full access.

## Implementation Files

### Core Access Control

- **`app/lib/access.ts`**: Role utilities and permission checks
  - `getUserAccess()`: Determines user role and access level
  - `canUserViewPlace()`: Checks if user can view a place
  - `canUserCreatePremiumPlace()`: Checks if user can create premium places
  - `canUserInteract()`: Checks if user can like/comment/save
  - `canUserAddPlace()`: Checks if user can add places
  - `isUserAdmin()`: Checks if user is admin

### Hooks

- **`app/hooks/useUserAccess.ts`**: React hook for accessing user role and permissions
  - Returns: `{ loading, user, profile, access }`
  - `access` contains: `{ role, hasPremium, isAdmin, subscriptionStatus }`

### Middleware

- **`middleware.ts`**: Next.js middleware for route protection
  - Protects routes: `/profile`, `/saved`, `/add`, `/places`
  - Redirects unauthenticated users to `/auth` with return URL

### Database Policies

- **`rls-role-based-policies.sql`**: Supabase RLS policies
  - Places: Public places viewable by everyone, premium places require premium access
  - Reactions: Only authenticated users can like/save
  - Comments: Only authenticated users can comment
  - Profiles: Users can update their own profile (but not role/is_admin)

### UI Components

- **`app/components/AuthModal.tsx`**: Modal for authentication (sign up / login)
  - Opens when guests try to perform restricted actions
  - Supports email magic link and Google OAuth

- **`app/components/LockedPlaceOverlay.tsx`**: Overlay for locked premium places
  - Shows blurred preview with upgrade CTA

- **`app/components/UpgradeCTA.tsx`**: Call-to-action for upgrading to Premium

## Usage Examples

### Check User Role

```typescript
import { useUserAccess } from '@/hooks/useUserAccess';
import { canUserInteract, canUserViewPlace } from '@/lib/access';

function MyComponent() {
  const { access, loading } = useUserAccess();
  
  if (loading) return <Loading />;
  
  // Check if user can interact
  if (!canUserInteract(access)) {
    return <AuthModal isOpen={true} />;
  }
  
  // Check if user can view premium place
  if (!canUserViewPlace(access, place)) {
    return <LockedPlaceOverlay placeTitle={place.title} />;
  }
}
```

### Protect Routes

Routes are automatically protected by middleware. For additional protection:

```typescript
export default function ProtectedPage() {
  const { user, loading } = useUserAccess(true); // requireAuth = true
  
  if (loading) return <Loading />;
  if (!user) return null; // Will redirect to /auth
  
  return <PageContent />;
}
```

### Check Premium Access

```typescript
import { canUserCreatePremiumPlace } from '@/lib/access';

function AccessEditor() {
  const { access } = useUserAccess();
  const canCreatePremium = canUserCreatePremiumPlace(access);
  
  return (
    <div>
      <button 
        disabled={!canCreatePremium}
        onClick={() => setAccessLevel('premium')}
      >
        Make Premium
      </button>
      {!canCreatePremium && <UpgradeCTA />}
    </div>
  );
}
```

## RLS Policies

The RLS policies enforce access control at the database level:

### Places Table

- **SELECT**: 
  - Public places: Everyone can view
  - Premium places: Only premium users, admins, and owners can view
  - Users can always view their own places

- **INSERT**:
  - Authenticated users can create public places
  - Only premium users and admins can create premium places

- **UPDATE**:
  - Users can update their own places
  - Standard users cannot upgrade places to premium
  - Admins can update any place

- **DELETE**:
  - Users can delete their own places
  - Admins can delete any place

### Reactions Table

- Only authenticated users can create/delete reactions (likes/favorites)

### Comments Table

- Only authenticated users can create comments
- Everyone can view comments on public places
- Premium users can view comments on premium places
- Users can update/delete their own comments
- Admins can delete any comment

## Testing

### Test User Roles

1. **Guest**: Log out and verify:
   - Can browse public places
   - Cannot like/comment
   - Auth modal opens on restricted actions

2. **Standard User**: Create account and verify:
   - Can like/comment on public places
   - Cannot view premium places
   - Cannot create premium places
   - Upgrade CTA shown on locked content

3. **Premium User**: Set `subscription_status = 'active'` and verify:
   - Can view premium places
   - Can create premium places
   - Full access to all features

4. **Admin**: Set `is_admin = true` and verify:
   - Can view/edit/delete any place
   - Can mark places as premium
   - Full access to all features

## Migration Checklist

1. ✅ Run `add-user-roles-fields.sql` in Supabase
2. ✅ Run `rls-role-based-policies.sql` in Supabase
3. ✅ Update existing profiles with correct roles
4. ✅ Test each user role
5. ✅ Verify RLS policies work correctly
6. ✅ Test middleware route protection
7. ✅ Verify UI components show correct restrictions

## Notes

- Guest users are not stored in the database - they are determined by the absence of a session
- Role is determined dynamically based on `is_admin` and `subscription_status`
- Admin users automatically have premium access
- All role checks should use the utility functions in `app/lib/access.ts` for consistency
