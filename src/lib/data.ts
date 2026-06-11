// src/lib/data.ts
// Fetches dashboard data from Supabase.
// Step 10: getDashboardData now returns plan alongside latest + history.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Types ────────────────────────────────────────────────────────────────────

export type Snapshot = {
  session_utilization: number
  weekly_utilization: number
  session_reset_at: string
  weekly_reset_at: string
  captured_at: string
}

export type UserSettings = {
  plan: 'free' | 'pro'
  session_alert_threshold: number
  second_alert_enabled: boolean
  weekly_alert_threshold: number
  reminders_enabled: boolean
  injected_bar_enabled: boolean
  sync_frequency_minutes: number
}

export type DashboardData = {
  latest: Snapshot | null
  history: Snapshot[]
  plan: 'free' | 'pro'
  settings: UserSettings | null
}

// ─── getDashboardData ─────────────────────────────────────────────────────────
// Called once on dashboard load.
// Makes two parallel requests to Supabase:
//   1. usage_snapshots — last 30 rows ordered by captured_at desc
//   2. user_settings   — single row for this user (contains plan)
//
// Both requests add .eq('user_id', userId) — enforced by RLS too.

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
  }

  // Run both fetches in parallel — faster than sequential
  const [snapshotsRes, settingsRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/usage_snapshots` +
        `?user_id=eq.${userId}` +
        `&order=captured_at.desc` +
        `&limit=30` +
        `&select=session_utilization,weekly_utilization,session_reset_at,weekly_reset_at,captured_at`,
      { headers }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/user_settings` +
        `?user_id=eq.${userId}` +
        `&select=plan,session_alert_threshold,second_alert_enabled,weekly_alert_threshold,reminders_enabled,injected_bar_enabled,sync_frequency_minutes` +
        `&limit=1`,
      { headers }
    ),
  ])

  if (!snapshotsRes.ok) {
    throw new Error(`Snapshots fetch failed: ${snapshotsRes.status}`)
  }
  if (!settingsRes.ok) {
    throw new Error(`Settings fetch failed: ${settingsRes.status}`)
  }

  const snapshots: Snapshot[] = await snapshotsRes.json()
  const settingsArr: UserSettings[] = await settingsRes.json()
  const settings = settingsArr[0] ?? null

  // Plan defaults to 'free' if no row exists yet
  const plan: 'free' | 'pro' = settings?.plan ?? 'free'

  // Latest = most recent snapshot (already ordered desc)
  const latest = snapshots[0] ?? null

  // History = all snapshots (already newest-first; chart reverses to oldest-first)
  const history = snapshots

  return { latest, history, plan, settings }
}
