# Logistics Demo

Realtime logistics dispatch demo built with Next.js, React, TypeScript, Tailwind CSS, and Supabase.

## What It Includes

- landing page with demo admin bootstrap
- chat workspace for customer, bot, and driver conversations
- bot-assisted order intake and dispatch flow
- dashboard with analytics, active/completed order views, and CSV export
- driver onboarding modal
- realtime sync for orders and messages

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file from the template:

```bash
copy .env.example .env.local
```

3. Fill in these values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DEFAULT_ADMIN_ID` optional
- `DEFAULT_BUSINESS_NAME` optional

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Vercel Hosting Checklist

The app is ready for Vercel hosting if the following are in place:

1. Your Supabase project is live and the schema in `supabase/schema.sql` has been applied.
2. Realtime is enabled for `orders` and `messages`.
3. The Vercel project has the required environment variables.

### Add These Environment Variables In Vercel

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DEFAULT_ADMIN_ID` optional
- `DEFAULT_BUSINESS_NAME` optional

### Recommended Vercel Settings

- Framework Preset: `Next.js`
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: leave default

## Deploy To Vercel

1. Push the repo to GitHub.
2. Import the repository into Vercel.
3. Add the environment variables listed above.
4. Deploy.

## Notes Before You Go Live

- The app currently uses localStorage for demo session state.
- Data separation is driven by `admin_id` filtering in the app.
- This is suitable for demo hosting, not production-grade tenant security.
- For production isolation, add Supabase Auth or a server-validated session/token flow.

## Validation

Useful commands before deploy:

```bash
npm run lint
npm run build
```
