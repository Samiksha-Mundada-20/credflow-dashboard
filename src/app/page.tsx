// src/app/page.tsx
// Root route. Just redirects.
// Logged-in users go to /dashboard. Everyone else goes to /login.
// We check session server-side here to avoid a flash of wrong content.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export default async function RootPage() {
  // We check the session by reading the auth cookie that Supabase sets.
  // If it's present, the user is likely logged in — send them to dashboard.
  // The dashboard page does its own full session check, so this is just a UX shortcut.
  const cookieStore = cookies()
  const authCookie = cookieStore.get('sb-mktqccyyzfdutipqlomm-auth-token')

  if (authCookie) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
