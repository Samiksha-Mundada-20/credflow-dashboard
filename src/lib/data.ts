// src/lib/data.ts
// All Supabase data queries for the dashboard.
// Step 10: DashboardData now includes plan field for chart gating.
// Step 14 prep: DashboardData now includes latestChatGPTSnapshot and chatgptHistory.
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
// Step 10 addition: plan field for chart gating (derived from settings.plan)
// Step 14 prep addition: latestChatGPTSnapshot and chatgptHistory
export type DashboardData = {
  latestSnapshot: UsageSnapshot | null
  history: UsageSnapshot[]
  settings: UserSettings | null
  plan: 'free' | 'pro'                        // Step 10: convenience field, mirrors settings.plan
  latestChatGPTSnapshot: UsageSnapshot | null  // Step 14 prep: most recent ChatGPT sync
  chatgptHistory: UsageSnapshot[]              // Step 14 prep: last 7 days of ChatGPT snapshots
}

// ─── getDashboardData ─────────────────────────────────────────────────────────
// Main fetch — called on dashboard mount.
// Returns latest snapshot, 7-day history, user settings, and ChatGPT data in one go.

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    snapshotResult,
    historyResult,
    settingsResult,
    chatgptSnapResult,
    chatgptHistoryResult,
  ] = await Promise.all([

    // Latest Claude snapshot
    supabase
      .from('usage_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'claude')
      .order('captured_at', { ascending: false })
      .limit(1),

    // Last 7 days of Claude snapshots for the chart
    supabase
      .from('usage_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'claude')
      .gte('captured_at', sevenDaysAgo)
      .order('captured_at', { ascending: false })
      .limit(50),

    // User settings
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single(),

    // Latest ChatGPT snapshot
    supabase
      .from('usage_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'chatgpt')
      .order('captured_at', { ascending: false })
      .limit(1),

    // Last 7 days of ChatGPT snapshots
    supabase
      .from('usage_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'chatgpt')
      .gte('captured_at', sevenDaysAgo)
      .order('captured_at', { ascending: false })
      .limit(50),
  ])

  const settings = settingsResult.data ?? null

  return {
    latestSnapshot:        snapshotResult.data?.[0]       ?? null,
    history:               historyResult.data              ?? [],
    settings,
    plan:                  settings?.plan                  ?? 'free',
    latestChatGPTSnapshot: chatgptSnapResult.data?.[0]    ?? null,
    chatgptHistory:        chatgptHistoryResult.data       ?? [],
  }
}

// ─── saveSettings ─────────────────────────────────────────────────────────────
// Saves changed settings back to Supabase.

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
export function onePerDay(snapshots: UsageSnapshot[]): UsageSnapshot[] {
  const dayMap = new Map<string, UsageSnapshot>()

  for (const snap of snapshots) {
    const day      = snap.captured_at.slice(0, 10)
    const snapVal  = snap.session_utilization
    const existing = dayMap.get(day)
    const existVal = existing?.session_utilization ?? -1

    if (!existing) {
      dayMap.set(day, snap)
    } else if (snapVal <= 1.0 && snapVal > existVal) {
      dayMap.set(day, snap)
    } else if (existVal > 1.0 && snapVal <= 1.0) {
      dayMap.set(day, snap)
    }
  }

  return Array.from(dayMap.values())
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
    .slice(-7)
}

// Seconds until a UTC ISO timestamp. Returns 0 if in the past.
export function secsUntil(isoTimestamp: string): number {
  const target = new Date(isoTimestamp).getTime()
  const now    = Date.now()
  return Math.max(0, Math.floor((target - now) / 1000))
}

// Convert utilization float to display percentage string. Caps at 100%.
export function pct(utilization: number): string {
  return `${Math.round(Math.min(utilization, 1.0) * 100)}%`
}

// Convert utilization float to integer. Caps at 100.
export function pctInt(utilization: number): number {
  return Math.round(Math.min(utilization, 1.0) * 100)
}
