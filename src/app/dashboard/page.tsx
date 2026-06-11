'use client'

// src/app/dashboard/page.tsx
// Step 10: Gates 7-day history chart by plan.
// Free users see today's bar + locked overlay on remaining 6.
// Pro users see full 30-day history.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, signOut } from '@/lib/auth'
import { getDashboardData } from '@/lib/data'
import LockedChartOverlay from '@/components/LockedChartOverlay'
import UpgradePromptCard from '@/components/UpgradePromptCard'

// ─── Types ───────────────────────────────────────────────────────────────────

type Snapshot = {
  session_utilization: number
  weekly_utilization: number
  session_reset_at: string
  weekly_reset_at: string
  captured_at: string
}

type DayBar = {
  label: string      // e.g. "Mon", "Tue"
  date: string       // ISO date string
  session: number    // 0–1 utilization
  weekly: number     // 0–1 utilization
  isToday: boolean
}

type DashboardData = {
  latest: Snapshot | null
  history: Snapshot[]          // up to 30 snapshots, one per day
  plan: 'free' | 'pro'
  settings: Record<string, unknown>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildBars(history: Snapshot[], plan: 'free' | 'pro'): DayBar[] {
  // Always show exactly 7 bars (last 7 days)
  const today = new Date()
  const bars: DayBar[] = []

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const isToday = i === 0

    // Find matching snapshot for this date
    const snap = history.find(s => s.captured_at.startsWith(dateStr))

    bars.push({
      label: DAY_LABELS[d.getDay()],
      date: dateStr,
      session: snap?.session_utilization ?? 0,
      weekly: snap?.weekly_utilization ?? 0,
      isToday,
    })
  }

  return bars
}

function formatCountdown(resetAt: string): string {
  const diff = new Date(resetAt).getTime() - Date.now()
  if (diff <= 0) return 'Resetting…'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UsageCard({
  label,
  utilization,
  resetAt,
  color,
  timerColor,
}: {
  label: string
  utilization: number
  resetAt: string
  color: string
  timerColor: string
}) {
  const [countdown, setCountdown] = useState(formatCountdown(resetAt))

  useEffect(() => {
    const id = setInterval(() => setCountdown(formatCountdown(resetAt)), 30_000)
    return () => clearInterval(id)
  }, [resetAt])

  const percentage = Math.round(utilization * 100)

  return (
    <div
      style={{
        flex: 1,
        minWidth: '240px',
        padding: '20px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E2DC',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontFamily: 'EB Garamond, Georgia, serif', fontSize: '15px', fontWeight: 600, color: '#1A1A1A' }}>
          {label}
        </p>
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '20px',
            fontWeight: 700,
            color,
          }}
        >
          {pct(utilization)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: '6px', backgroundColor: '#F2F2EF', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: pct(utilization),
            backgroundColor: color,
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Reset countdown */}
      <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '12px', color: timerColor }}>
        Resets in {countdown}
      </p>
    </div>
  )
}

// ─── 7-day chart ─────────────────────────────────────────────────────────────

function HistoryChart({ bars, plan }: { bars: DayBar[]; plan: 'free' | 'pro' }) {
  // For free users: only today's bar is real, the rest show placeholder heights
  // but are blurred by the overlay
  const isPro = plan === 'pro'

  return (
    <div style={{ position: 'relative' }}>
      {/* Chart title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'EB Garamond, Georgia, serif',
            fontSize: '16px',
            fontWeight: 600,
            color: '#1A1A1A',
          }}
        >
          Usage history
        </p>
        {!isPro && (
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '11px',
              fontWeight: 600,
              color: '#ADADAD',
              backgroundColor: '#F2F2EF',
              border: '1px solid #E2E2DC',
              borderRadius: '20px',
              padding: '2px 10px',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}
          >
            Pro
          </span>
        )}
      </div>

      {/* Bars wrapper — relative so overlay can sit on top */}
      <div style={{ position: 'relative' }}>
        {/* The actual bar chart — always rendered so blur has something to show */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            height: '80px',
            padding: '0 4px 0',
          }}
        >
          {bars.map((bar, idx) => {
            // Free users: only today's bar (idx 6) is real data; others show grey placeholders
            const showReal = isPro || bar.isToday
            const heightPct = showReal
              ? `${Math.max(4, Math.round(bar.session * 100))}%`
              : `${20 + (idx * 8)}%` // ghost heights to give the chart visual texture under blur

            const barColor = showReal
              ? bar.session >= 0.95
                ? '#E83C3C'
                : bar.session >= 0.8
                ? '#F5941F'
                : '#5170FF'
              : '#E2E2DC'

            return (
              <div
                key={bar.date}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}
              >
                <div
                  style={{
                    width: '100%',
                    height: heightPct,
                    backgroundColor: barColor,
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.4s ease',
                    opacity: showReal ? 1 : 0.4,
                  }}
                  title={showReal ? `${bar.label}: ${pct(bar.session)}` : undefined}
                />
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '11px',
                    color: bar.isToday ? '#1A1A1A' : '#ADADAD',
                    fontWeight: bar.isToday ? 600 : 400,
                  }}
                >
                  {bar.label}
                </p>
              </div>
            )
          })}
        </div>

        {/* Lock overlay — only for free users, covers the non-today bars */}
        {!isPro && <LockedChartOverlay />}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'usage' | 'settings'>('usage')

  // Settings form state (mirrors user_settings columns)
  const [sessionThreshold, setSessionThreshold] = useState(80)
  const [secondAlertEnabled, setSecondAlertEnabled] = useState(true)
  const [injectedBarEnabled, setInjectedBarEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const user = await getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const d = await getDashboardData(user.id)
        setData(d)

        // Seed settings form from fetched data
        if (d?.settings) {
          const s = d.settings as Record<string, number | boolean>
          if (typeof s.session_alert_threshold === 'number') {
            setSessionThreshold(Math.round(s.session_alert_threshold * 100))
          }
          if (typeof s.second_alert_enabled === 'boolean') {
            setSecondAlertEnabled(s.second_alert_enabled)
          }
          if (typeof s.injected_bar_enabled === 'boolean') {
            setInjectedBarEnabled(s.injected_bar_enabled)
          }
        }
      } catch (e) {
        setError('Failed to load dashboard. Please refresh.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [router])

  async function handleSaveSettings() {
    if (!data) return
    setSaving(true)
    setSaveMsg('')

    try {
      const user = await getUser()
      if (!user) return

      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON,
            Authorization: `Bearer ${SUPABASE_ANON}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            session_alert_threshold: sessionThreshold / 100,
            second_alert_enabled: secondAlertEnabled,
            injected_bar_enabled: injectedBarEnabled,
            updated_at: new Date().toISOString(),
          }),
        }
      )

      if (!res.ok) throw new Error('Save failed')
      setSaveMsg('Saved ✓')
    } catch (e) {
      setSaveMsg('Error saving. Try again.')
      console.error(e)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={pageStyle}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#6B6B6B' }}>Loading…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={pageStyle}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#E83C3C' }}>
          {error ?? 'Something went wrong.'}
        </p>
      </div>
    )
  }

  const { latest, history, plan } = data
  const bars = buildBars(history, plan)

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      {/* ── Header ── */}
      <header style={headerStyle}>
        <span style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '20px', fontWeight: 600, color: '#1A1A1A' }}>
          CredFlow
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {plan === 'pro' && (
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                fontWeight: 600,
                color: '#FFCC00',
                backgroundColor: '#1A1A1A',
                borderRadius: '20px',
                padding: '3px 10px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Pro
            </span>
          )}
          <button onClick={handleSignOut} style={ghostBtnStyle}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div style={tabBarStyle}>
        {(['usage', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...tabBtnStyle,
              borderBottom: activeTab === tab ? '2px solid #1A1A1A' : '2px solid transparent',
              color: activeTab === tab ? '#1A1A1A' : '#6B6B6B',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Usage tab ── */}
      {activeTab === 'usage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Usage cards */}
          {latest ? (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <UsageCard
                label="Session"
                utilization={latest.session_utilization}
                resetAt={latest.session_reset_at}
                color="#5170FF"
                timerColor="#1800AD"
              />
              <UsageCard
                label="Weekly"
                utilization={latest.weekly_utilization}
                resetAt={latest.weekly_reset_at}
                color="#F5941F"
                timerColor="#C47512"
              />
            </div>
          ) : (
            <div
              style={{
                padding: '20px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E2DC',
                borderRadius: '8px',
              }}
            >
              <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#6B6B6B' }}>
                No data yet. Open Claude.ai to start tracking.
              </p>
            </div>
          )}

          {/* Last captured */}
          {latest && (
            <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#ADADAD' }}>
              Last captured {new Date(latest.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {/* ── 7-day chart (gated) ── */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E2DC',
              borderRadius: '8px',
            }}
          >
            <HistoryChart bars={bars} plan={plan} />
          </div>

          {/* Upgrade prompt card — free users only */}
          {plan === 'free' && <UpgradePromptCard />}
        </div>
      )}

      {/* ── Settings tab ── */}
      {activeTab === 'settings' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '20px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E2DC',
            borderRadius: '8px',
          }}
        >
          <p style={{ margin: 0, fontFamily: 'EB Garamond, Georgia, serif', fontSize: '17px', fontWeight: 600, color: '#1A1A1A' }}>
            Preferences
          </p>

          {/* Alert threshold */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Alert threshold (%)</label>
            <p style={descStyle}>Get notified when session usage reaches this level.</p>
            <input
              type="number"
              min={50}
              max={99}
              value={sessionThreshold}
              onChange={e => setSessionThreshold(Number(e.target.value))}
              style={inputStyle}
            />
          </div>

          {/* Second alert */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Second alert at 95%</label>
            <p style={descStyle}>A second push notification when you're nearly at the limit.</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={secondAlertEnabled}
                onChange={e => setSecondAlertEnabled(e.target.checked)}
                style={{ accentColor: '#5170FF', width: '16px', height: '16px' }}
              />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#1A1A1A' }}>
                Enabled
              </span>
            </label>
          </div>

          {/* Injected bar */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Show usage bar on Claude.ai</label>
            <p style={descStyle}>Injects a live usage bar at the top of the claude.ai interface.</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={injectedBarEnabled}
                onChange={e => setInjectedBarEnabled(e.target.checked)}
                style={{ accentColor: '#5170FF', width: '16px', height: '16px' }}
              />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#1A1A1A' }}>
                Enabled
              </span>
            </label>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              style={{
                padding: '9px 22px',
                backgroundColor: '#1A1A1A',
                color: '#FFFFFF',
                fontFamily: 'Inter, sans-serif',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '6px',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {saveMsg && (
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: saveMsg.startsWith('Error') ? '#E83C3C' : '#2DC07A' }}>
                {saveMsg}
              </span>
            )}
          </div>

          {/* Plan info */}
          <div
            style={{
              marginTop: '8px',
              padding: '14px 16px',
              backgroundColor: '#F2F2EF',
              border: '1px solid #E2E2DC',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>
                {plan === 'pro' ? 'Pro plan' : 'Free plan'}
              </p>
              <p style={{ margin: '2px 0 0', fontFamily: 'Inter, sans-serif', fontSize: '12px', color: '#6B6B6B' }}>
                {plan === 'pro' ? 'All features unlocked.' : 'Upgrade to unlock ChatGPT tracking, history & more.'}
              </p>
            </div>
            {plan === 'free' && (
              <a
                href="https://credflow.vercel.app/#pricing"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '7px 16px',
                  backgroundColor: '#FFCC00',
                  color: '#1A1A1A',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '5px',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Upgrade
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#FAFAF8',
  padding: '0 0 60px',
  maxWidth: '680px',
  margin: '0 auto',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 20px 0',
  marginBottom: '4px',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #E2E2DC',
  marginBottom: '20px',
  padding: '0 20px',
}

const tabBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: '12px 16px 10px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '13px',
  cursor: 'pointer',
  marginBottom: '-1px',
  letterSpacing: '0.01em',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #E2E2DC',
  borderRadius: '5px',
  padding: '6px 12px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '12px',
  color: '#6B6B6B',
  cursor: 'pointer',
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  paddingBottom: '16px',
  borderBottom: '1px solid #F2F2EF',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1A1A1A',
  margin: 0,
}

const descStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: '12px',
  color: '#6B6B6B',
  margin: '0 0 6px',
}

const inputStyle: React.CSSProperties = {
  width: '80px',
  padding: '7px 10px',
  fontFamily: 'Inter, sans-serif',
  fontSize: '13px',
  border: '1px solid #E2E2DC',
  borderRadius: '5px',
  backgroundColor: '#FFFFFF',
  color: '#1A1A1A',
  outline: 'none',
}
