# Maporia

A Next.js application for discovering and sharing local places, built with Supabase and Google Maps.

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Supabase account and project ([sign up](https://supabase.com))
- Google Maps API key (optional, for address autocomplete)

## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd maporia
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here  # Optional but recommended
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here  # Optional
```

**Where to find these values:**
- Supabase Dashboard → Settings → API
- `NEXT_PUBLIC_SUPABASE_URL`: Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `anon` `public` key
- `SUPABASE_SERVICE_ROLE_KEY`: `service_role` `secret` key (⚠️ Never expose in client code)

### 3. Set Up Supabase CLI (Optional but Recommended)

Install the Supabase CLI:

```bash
# macOS
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Or use npm
npm install -g supabase
```

Link to your remote Supabase project:

```bash
supabase link --project-ref your-project-ref
```

You'll be prompted to enter your database password.

**Get your project ref:**
- Supabase Dashboard → Settings → General → Reference ID

### 4. Pull Database Schema

Pull the current database schema:

```bash
supabase db pull
```

This creates a `supabase/migrations/` directory with your schema.

### 5. Generate TypeScript Types

Generate TypeScript types from your database:

```bash
supabase gen types typescript --linked > app/types/supabase.ts
```

Or if using a local project:

```bash
supabase gen types typescript --local > app/types/supabase.ts
```

**Note:** If you don't have Supabase CLI set up, you can generate types manually:
1. Go to Supabase Dashboard → Settings → API
2. Scroll to "TypeScript types"
3. Copy the generated types to `app/types/supabase.ts`

### 6. Run Database Migrations

If you have migration files in the repo, apply them:

```bash
# Using Supabase CLI (recommended)
supabase db push

# Or manually in Supabase Dashboard → SQL Editor
# Run each .sql file in order
```

**Migration files in this repo:**
- `add-cities-table-and-migration.sql` - Cities table and linking
- `add-user-roles-fields.sql` - User roles and subscription fields
- `add-place-visibility-fields.sql` - Place access control fields
- `rls-role-based-policies.sql` - Row-level security policies
- `create-premium-modal-settings-table.sql` - App settings table
- See all `.sql` files in the root directory

### 7. Set Up Storage Buckets

In Supabase Dashboard → Storage, create these buckets:

1. **`avatars`** - Public bucket for user profile pictures
   - Public: Yes
   - File size limit: 5MB
   - Allowed MIME types: `image/jpeg, image/png, image/webp`

2. **`place-photos`** - Public bucket for place photos
   - Public: Yes
   - File size limit: 10MB
   - Allowed MIME types: `image/jpeg, image/png, image/webp`

**Storage Policies:**
- Upload: Authenticated users only
- Read: Public (for `getPublicUrl`)
- Delete: Owner or admin only

### 8. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
maporia/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── components/        # React components
│   ├── lib/               # Utilities (Supabase client, etc.)
│   ├── types.ts           # TypeScript types
│   └── types/             # Generated Supabase types (create this)
├── supabase/              # Supabase config (created by CLI)
│   └── migrations/        # Database migrations
├── .env.local             # Environment variables (not in git)
├── .env.example           # Example environment file
└── *.sql                  # SQL migration files
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run fix-rls` - Fix RLS policies (requires SUPABASE_SERVICE_ROLE_KEY)

## Database Schema

### Main Tables

- **profiles** - User profiles with roles and subscription status
- **places** - Place listings with access control
- **place_photos** - Place photos (separate table)
- **cities** - City references for places
- **comments** - Place comments
- **reactions** - Place likes/reactions
- **app_settings** - App configuration

See `SUPABASE-AUDIT.md` for detailed schema information.

## Row-Level Security (RLS)

All tables have RLS enabled with role-based policies:
- **Guest** - Can view public places only
- **Standard User** - Can create public places, comment, like
- **Premium User** - Can view premium places, create premium places
- **Admin** - Full access to all content

See `rls-role-based-policies.sql` for policy definitions.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

**Required Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for API routes)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (optional)

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- AWS Amplify
- Self-hosted

## Troubleshooting

### "Missing NEXT_PUBLIC_SUPABASE_URL"

Make sure `.env.local` exists and contains your Supabase credentials.

### RLS Policy Errors

Run the RLS policies migration:
```bash
# In Supabase Dashboard → SQL Editor
# Run: rls-role-based-policies.sql
```

### Type Errors After Schema Changes

Regenerate TypeScript types:
```bash
supabase gen types typescript --linked > app/types/supabase.ts
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)

## Support

For issues and questions, see `SUPABASE-AUDIT.md` for detailed database information.
