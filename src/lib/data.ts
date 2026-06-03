// src/lib/data.ts
// All Supabase data queries for the dashboard.
// Every query adds .eq('user_id', userId) alongside RLS — double protection.
// No query here reads message content — only utilization floats and timestamps.

import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

// One row from usage_snapshots — exactly what the extension writes
export type UsageSnapshot = {
  id: string
  user_id: string
  platform: string
  session_utilization: number    // 0.0 – 1.0  e.g. 0.43 = 43%
  weekly_utilization: number     // 0.0 – 1.0
  session_reset_at: string       // ISO timestamp
  weekly_reset_at: string        // ISO timestamp
  captured_at: string            // ISO timestamp
  source_version: string
}

// One row from user_settings
export type UserSettings = {
  id: string
  user_id: string
  plan: 'free' | 'pro'
  session_alert_threshold: number   // 0.0 – 1.0  default 0.80
  second_alert_enabled: boolean
  weekly_alert_threshold: number    // 0.0 – 1.0  default 0.75
  reminders_enabled: boolean
  injected_bar_enabled: boolean
  sync_frequency_minutes: number
  consent_given_at: string | null
  created_at: string
  updated_at: string
}

// Shape returned by getDashboardData
export type DashboardData = {
  latestSnapshot: UsageSnapshot | null    // Most recent capture from extension
  history: UsageSnapshot[]               // Last 7 days of snapshots for chart
  settings: UserSettings | null
}

// ─── getDashboardData ─────────────────────────────────────────────────────────
// Main fetch — called on dashboard mount.
// Returns latest snapshot, 7-day history, and user settings in one go.

export async function getDashboardData(userId: string): Promise<DashboardData> {
  // Run all three queries in parallel — faster than sequential awaits
  const [snapshotResult, historyResult, settingsResult] = await Promise.all([

    // Latest snapshot for Claude
    // platform is saved as "claude" by the extension (not "claude.ai")
    supabase
      .from('usage_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'claude')
      .order('captured_at', { ascending: false })
      .limit(1),

    // Last 7 days of snapshots for the chart
    // Fetch up to 50 — onePerDay() picks the best one per day below
    supabase
      .from('usage_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'claude')
      .gte('captured_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('captured_at', { ascending: false })
      .limit(50),

    // User settings
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single(),

  ])

  return {
    latestSnapshot: snapshotResult.data?.[0] ?? null,
    history: historyResult.data ?? [],
    settings: settingsResult.data ?? null,
  }
}

// ─── saveSettings ─────────────────────────────────────────────────────────────
// Saves changed settings back to Supabase.
// Only updates the fields we expose in the UI — nothing else is touched.

export type SettingsUpdate = {
  session_alert_threshold?: number
  second_alert_enabled?: boolean
  weekly_alert_threshold?: number
  reminders_enabled?: boolean
  injected_bar_enabled?: boolean
  sync_frequency_minutes?: number
}

export async function saveSettings(
  userId: string,
  updates: SettingsUpdate
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('user_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Given an array of snapshots, return the best one per day.
// "Best" = highest session_utilization that is <= 1.0
// Values over 1.0 are reset artifacts (SSE captured after window reset) — skip them.
// Used to build the 7-day bar chart.
export function onePerDay(snapshots: UsageSnapshot[]): UsageSnapshot[] {
  const dayMap = new Map<string, UsageSnapshot>()

  for (const snap of snapshots) {
    const day      = snap.captured_at.slice(0, 10)  // "2026-06-03"
    const snapVal  = snap.session_utilization
    const existing = dayMap.get(day)
    const existVal = existing?.session_utilization ?? -1

    if (!existing) {
      // First snapshot seen for this day — use it regardless
      dayMap.set(day, snap)
    } else if (snapVal <= 1.0 && snapVal > existVal) {
      // Higher valid value found for this day — use it
      dayMap.set(day, snap)
    } else if (existVal > 1.0 && snapVal <= 1.0) {
      // Current best is a reset artifact — replace with any valid value
      dayMap.set(day, snap)
    }
  }

  // Sort oldest first for the chart (left = oldest, right = today)
  return Array.from(dayMap.values())
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
    .slice(-7)
}

// Seconds until a UTC ISO timestamp.
// Returns 0 if the timestamp is in the past.
export function secsUntil(isoTimestamp: string): number {
  const target = new Date(isoTimestamp).getTime()
  const now    = Date.now()
  return Math.max(0, Math.floor((target - now) / 1000))
}

// Convert utilization float (0.43) to display percentage string ("43%")
// Caps at 100% — values over 1.0 are reset artifacts, never show > 100
export function pct(utilization: number): string {
  return `${Math.round(Math.min(utilization, 1.0) * 100)}%`
}

// Convert utilization float (0.43) to integer (43)
// Caps at 100 — same reason as above
export function pctInt(utilization: number): number {
  return Math.round(Math.min(utilization, 1.0) * 100)
}
