# CredFlow Dashboard

Next.js web dashboard for CredFlow — tracks Claude.ai usage limits.

## Stack
- Next.js 14 (App Router)
- TypeScript
- Supabase (same project as the extension — same users, same JWT)
- Vercel (deploy target)

## Local setup

```bash
cd credflow-dashboard
npm install
npm run dev
```

Open http://localhost:3000. It redirects to /login.

## Environment variables

The `.env.local` file is pre-filled with the CredFlow Supabase project credentials.
Never commit this file. It's in .gitignore.

```
NEXT_PUBLIC_SUPABASE_URL=https://mktqccyyzfdutipqlomm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import the repo in vercel.com/new
3. In Vercel project settings → Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Copy values from .env.local)
4. Deploy — Vercel auto-detects Next.js

## Routes

| Route        | What it does                               |
|--------------|--------------------------------------------|
| /            | Redirects to /dashboard or /login          |
| /login       | Sign in with email + password              |
| /signup      | Create account with consent checkbox       |
| /dashboard   | Protected — redirects to /login if no JWT  |

## Auth flow

- Reuses the same Supabase project as the Chrome extension
- A user who signs up via the extension can log in here with the same credentials
- Email confirmation is OFF in Supabase → users are signed in immediately on signup
- Sessions are stored by Supabase in localStorage (browser, not chrome.storage)

## File structure

```
src/
├── app/
│   ├── layout.tsx          ← Root layout, imports globals.css
│   ├── page.tsx            ← Redirects to /login or /dashboard
│   ├── login/page.tsx      ← Login form
│   ├── signup/page.tsx     ← Signup form + consent checkbox
│   └── dashboard/page.tsx  ← Protected dashboard (skeleton)
├── components/
│   ├── AuthCard.tsx        ← Shared card shell for auth pages
│   ├── FormField.tsx       ← Label + input + error display
│   └── SubmitButton.tsx    ← Loading-aware submit button
├── lib/
│   ├── supabase.ts         ← Supabase client singleton
│   └── auth.ts             ← signUp, signIn, signOut, getSession, getUser
└── styles/
    └── globals.css         ← Design tokens + base styles
```

## What's next (Step 8 continued)

- Usage history charts from usage_snapshots table
- GET /functions/v1/get-dashboard-data edge function
- Settings page (alert thresholds, bar toggle, plan display)
