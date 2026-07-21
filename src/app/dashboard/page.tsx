// src/app/dashboard/page.tsx
// Dashboard — fully connected to Supabase backend.
// Step 10: 7-day history chart gated by plan.
// Step 14 prep: ChatGPT section added to Detail view below insight strip.
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  getDashboardData,
  saveSettings,
  onePerDay,
  secsUntil,
  pctInt,
  type DashboardData,
  type UsageSnapshot,
} from '@/lib/data'
import { openRazorpayCheckout } from '@/lib/razorpay'
import type { User } from '@supabase/supabase-js'

type Tab       = 'usage' | 'settings'
type UsageView = 'detail' | 'summary'

function fmtHMS(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}
function fmtResets(s: number) {
  return `in ${Math.floor(s/3600)}h ${String(Math.floor((s%3600)/60)).padStart(2,'0')}m`
}
function fmtWeeklyResets(s: number) {
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60)
  return d > 0 ? `in ${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m` : fmtResets(s)
}
function staleness(capturedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(capturedAt).getTime()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`
  return `${Math.floor(secs/3600)}h ago`
}
function dayLabel(isoDate: string): string {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(isoDate).getDay()]
}
function isToday(isoDate: string): boolean {
  return isoDate.slice(0,10) === new Date().toISOString().slice(0,10)
}

export default function DashboardPage() {
  const router = useRouter()
  const [user,              setUser]              = useState<User | null>(null)
  const [authLoading,       setAuthLoading]       = useState(true)
  const [data,              setData]              = useState<DashboardData | null>(null)
  const [dataLoading,       setDataLoading]       = useState(true)
  const [dataError,         setDataError]         = useState<string | null>(null)
  const [activeTab,         setActiveTab]         = useState<Tab>('usage')
  const [usageView,         setUsageView]         = useState<UsageView>('detail')
  const [signingOut,        setSigningOut]        = useState(false)
  const [savingSettings,    setSavingSettings]    = useState(false)
  const [settingsSaved,     setSettingsSaved]     = useState(false)
  const [sessionThreshold,  setSessionThreshold]  = useState(80)
  const [weeklyThreshold,   setWeeklyThreshold]   = useState(75)
  const [secondAlert,       setSecondAlert]       = useState(true)
  const [reminders,         setReminders]         = useState(true)
  const [injectedBar,       setInjectedBar]       = useState(true)
  const [syncFreq,          setSyncFreq]          = useState(5)
  const [sessionSecs,       setSessionSecs]       = useState(0)
  const [weeklySecs,        setWeeklySecs]        = useState(0)
  const [staleLabel,        setStaleLabel]        = useState('')
  // ChatGPT reset countdown — mirrors sessionSecs logic for Claude
  const [chatgptSecs,       setChatgptSecs]       = useState(0)
  const [chartPlatform,     setChartPlatform]     = useState<'claude' | 'chatgpt'>('claude')

  useEffect(() => {
    async function check() {
      const u = await getUser()
      if (!u) { router.replace('/login'); return }
      setUser(u); setAuthLoading(false)
    }
    check()
  }, [router])

  const fetchData = useCallback(async (userId: string, isSilent = false) => {
    if (!isSilent) setDataLoading(true)
    setDataError(null)
    try {
      const result = await getDashboardData(userId)
      setData(result)
      if (result.settings) {
        const s = result.settings
        setSessionThreshold(Math.round(s.session_alert_threshold * 100))
        setWeeklyThreshold(Math.round(s.weekly_alert_threshold * 100))
        setSecondAlert(s.second_alert_enabled)
        setReminders(s.reminders_enabled)
        setInjectedBar(s.injected_bar_enabled)
        setSyncFreq(s.sync_frequency_minutes)
      }
      if (result.latestSnapshot) {
        const snap = result.latestSnapshot
        setSessionSecs(secsUntil(snap.session_reset_at))
        setWeeklySecs(secsUntil(snap.weekly_reset_at))
        setStaleLabel(staleness(snap.captured_at))
      }
      // Populate ChatGPT reset countdown
      if (result.latestChatGPTSnapshot?.session_reset_at) {
        setChatgptSecs(secsUntil(result.latestChatGPTSnapshot.session_reset_at))
      }
    } catch {
      if (!isSilent) setDataError('Could not load data. Check your connection.')
    }
    finally {
      if (!isSilent) setDataLoading(false)
    }
  }, [])

  // Realtime subscription + silent background polling for extension live sync
  useEffect(() => {
    if (authLoading || !user) return

    fetchData(user.id, false)

    // 1. Postgres changes listener + Broadcast listener
    const channel = supabase
      .channel(`credflow-sync-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'usage_snapshots',
        },
        (payload) => {
          if (!payload.new || (payload.new as { user_id?: string }).user_id === user.id) {
            fetchData(user.id, true)
          }
        }
      )
      .on(
        'broadcast',
        { event: 'snapshot-updated' },
        () => {
          fetchData(user.id, true)
        }
      )
      .subscribe()

    // 2. Silent 5-second polling interval to ensure seamless UI sync without flickering
    const pollInterval = setInterval(() => {
      fetchData(user.id, true)
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [authLoading, user, fetchData])

  useEffect(() => {
    const t = setInterval(() => {
      setSessionSecs(s => Math.max(0, s - 1))
      setWeeklySecs(s => Math.max(0, s - 1))
      setChatgptSecs(s => Math.max(0, s - 1))
      if (data?.latestSnapshot) setStaleLabel(staleness(data.latestSnapshot.captured_at))
    }, 1000)
    return () => clearInterval(t)
  }, [data])

  async function handleSaveSettings() {
    if (!user) return
    setSavingSettings(true)
    const result = await saveSettings(user.id, {
      session_alert_threshold: sessionThreshold / 100,
      second_alert_enabled:    secondAlert,
      weekly_alert_threshold:  weeklyThreshold / 100,
      reminders_enabled:       reminders,
      injected_bar_enabled:    injectedBar,
      sync_frequency_minutes:  syncFreq,
    })
    setSavingSettings(false)
    if (result.success) {
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } else {
      alert(result.error ?? 'Could not save settings.')
    }
  }

  async function handleSignOut() {
    setSigningOut(true); await signOut(); router.replace('/login')
  }

  const [clearingHistory, setClearingHistory] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  async function handleClearHistory() {
    if (!user) return
    if (!window.confirm('Are you sure you want to clear all your tracking history?')) return
    setClearingHistory(true)
    try {
      await supabase.from('usage_snapshots').delete().eq('user_id', user.id)
      fetchData(user.id, true)
      alert('Tracking history cleared.')
    } catch {
      alert('Could not clear history. Please try again.')
    } finally {
      setClearingHistory(false)
    }
  }

  async function handleDeleteAccount() {
    if (!user) return
    if (!window.confirm('Are you sure you want to delete your CredFlow account? This action cannot be undone.')) return
    setDeletingAccount(true)
    try {
      await supabase.from('usage_snapshots').delete().eq('user_id', user.id)
      await supabase.from('user_settings').delete().eq('user_id', user.id)
      await signOut()
      router.replace('/login')
    } catch {
      alert('Could not delete account. Please try again.')
      setDeletingAccount(false)
    }
  }

  const handleUpgrade = () => {
    openRazorpayCheckout({
      userId: user?.id,
      userEmail: user?.email,
      amount: 29900,
      onSuccess: () => {
        if (user) fetchData(user.id)
      },
    })
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? 'U'
  const isPro    = data?.settings?.plan === 'pro'

  const chartDays: Array<{ label: string; h: number; today: boolean; val: number }> = (() => {
    const snapshotsByDay = new Map<string, UsageSnapshot>()
    const targetHistory = chartPlatform === 'chatgpt' ? (data?.chatgptHistory ?? []) : (data?.history ?? [])
    if (targetHistory.length) {
      for (const snap of onePerDay(targetHistory)) {
        const dStr = new Date(snap.captured_at).toISOString().slice(0, 10)
        snapshotsByDay.set(dStr, snap)
      }
    }

    const days: Array<{ label: string; h: number; today: boolean; val: number }> = []
    const now = new Date()

    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(now.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const isTod = i === 0
      const label = isTod ? 'Today' : dayLabel(d.toISOString())
      const snap = snapshotsByDay.get(dateStr)
      const val = snap ? pctInt(snap.session_utilization) : 0

      days.push({
        label,
        h: val,
        today: isTod,
        val,
      })
    }

    return days
  })()

  const snap: UsageSnapshot | null = data?.latestSnapshot ?? null
  const sessionResetExpired = snap?.session_reset_at
    ? secsUntil(snap.session_reset_at) === 0
    : false
  const sessionPct = snap ? (sessionResetExpired ? 0 : pctInt(snap.session_utilization)) : null
  const weeklyPct  = snap ? pctInt(snap.weekly_utilization)  : null

  // ChatGPT derived values
  const chatgptSnap: UsageSnapshot | null = data?.latestChatGPTSnapshot ?? null
  const chatgptResetExpired = chatgptSnap?.session_reset_at
    ? secsUntil(chatgptSnap.session_reset_at) === 0
    : false
  const chatgptPct = chatgptSnap ? (chatgptResetExpired ? 0 : pctInt(chatgptSnap.session_utilization)) : null
  const chatgptStale = chatgptSnap ? staleness(chatgptSnap.captured_at) : null

  const rawUtil = chatgptSnap?.session_utilization ?? 0
  let estimatedLimit = 10
  if (rawUtil > 0) {
    for (const testLimit of [25, 10, 80, 160, 15, 40]) {
      const testCount = Math.round(rawUtil * testLimit)
      if (Math.abs((testCount / testLimit) - rawUtil) < 0.025) {
        estimatedLimit = testLimit
        break
      }
    }
  }
  const chatgptLimit = estimatedLimit
  const chatgptUsedMsgs = chatgptSnap && !chatgptResetExpired ? Math.round(rawUtil * chatgptLimit) : 0
  const chatgptMsgsLeft = Math.max(0, chatgptLimit - chatgptUsedMsgs)

  if (authLoading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#FAFAF8'}}>
      <span style={{width:24,height:24,border:'2px solid #E2E2DC',borderTopColor:'#5170FF',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#FAFAF8',display:'flex',flexDirection:'column'}}>

      {/* TOP NAV */}
      <nav style={{background:'#FFFFFF',borderBottom:'1px solid #E2E2DC',height:54,display:'flex',alignItems:'center',padding:'0 20px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginRight:24}}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 .5L9.5 6.5 15.5 8 9.5 9.5 8 15.5 6.5 9.5.5 8 6.5 6.5Z" fill="#FFCC00"/></svg>
          <span style={{fontFamily:'var(--font-heading)',fontSize:16,fontWeight:500,color:'#1A1A1A',letterSpacing:'-0.3px'}}>CredFlow</span>
        </div>
        <div style={{display:'flex',flex:1}}>
          <button onClick={() => setActiveTab('usage')} style={{
            padding:'0 14px',height:54,display:'flex',alignItems:'center',fontSize:12,fontWeight:500,
            cursor:'pointer',background:'transparent',border:'none',fontFamily:'Inter,sans-serif',
            color: activeTab==='usage' ? '#1A1A1A' : '#6B6B6B',
            borderBottom: activeTab==='usage' ? '2px solid #FFCC00' : '2px solid transparent',
            position:'relative',top:1,transition:'all .18s',
          }}>Usage</button>

          <a href="/convert" style={{
            padding:'0 14px',height:54,display:'flex',alignItems:'center',fontSize:12,fontWeight:500,
            cursor:'pointer',background:'transparent',border:'none',fontFamily:'Inter,sans-serif',
            color:'#6B6B6B',borderBottom:'2px solid transparent',
            position:'relative',top:1,textDecoration:'none',transition:'all .18s',
          }}>Convert</a>

          <button onClick={() => setActiveTab('settings')} style={{
            padding:'0 14px',height:54,display:'flex',alignItems:'center',fontSize:12,fontWeight:500,
            cursor:'pointer',background:'transparent',border:'none',fontFamily:'Inter,sans-serif',
            color: activeTab==='settings' ? '#1A1A1A' : '#6B6B6B',
            borderBottom: activeTab==='settings' ? '2px solid #FFCC00' : '2px solid transparent',
            position:'relative',top:1,transition:'all .18s',
          }}>Settings</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <button onClick={() => user && fetchData(user.id)} disabled={dataLoading} title="Refresh" style={{width:28,height:28,borderRadius:8,background:'#F2F2EF',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',opacity:dataLoading?0.5:1}}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{animation:dataLoading?'spin .7s linear infinite':'none'}}>
              <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 3.18 1.32" stroke="#6B6B6B" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M9 1l.7 2.3L7 3.7" stroke="#6B6B6B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{width:28,height:28,borderRadius:'50%',background:'#EEF0FF',border:'1.5px solid #5170FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#1800AD'}}>{initials}</div>
          {!isPro && <button onClick={handleUpgrade} style={{background:'#FFCC00',color:'#1A1A1A',border:'none',borderRadius:8,padding:'5px 11px',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer'}}>Upgrade ✦</button>}
          {isPro  && <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,background:'#F3EEFF',color:'#8B5CF6'}}>Pro ✦</span>}
          <button onClick={handleSignOut} disabled={signingOut} style={{background:'transparent',border:'1px solid #E2E2DC',borderRadius:8,padding:'5px 11px',fontSize:11,color:'#6B6B6B',cursor:'pointer',opacity:signingOut?0.5:1,fontFamily:'Inter,sans-serif'}}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>

        {/* Main */}
        <div style={{flex:1,overflowY:'auto'}}>

          {/* USAGE TAB */}
          {activeTab === 'usage' && (
            <div style={{padding:22,display:'flex',flexDirection:'column',gap:16}}>

              <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontFamily:'var(--font-heading)',fontSize:24,fontWeight:400,color:'#1A1A1A',lineHeight:1}}>Usage Overview</div>
                  <div style={{fontSize:11,color:'#6B6B6B',marginTop:3}}>Real-time limit tracking · Claude.ai</div>
                </div>
                {snap ? (
                  <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,fontWeight:600,color:staleLabel==='Just now'?'#2DC07A':'#F5941F'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:staleLabel==='Just now'?'#2DC07A':'#F5941F',display:'inline-block'}}/>
                    {staleLabel}
                  </div>
                ) : <div style={{fontSize:10,fontWeight:600,color:'#ADADAD'}}>No data yet</div>}
              </div>

              {dataError && (
                <div style={{background:'#FDECEC',border:'1px solid #E83C3C',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#E83C3C'}}>
                  {dataError} <button onClick={() => user && fetchData(user.id)} style={{color:'#E83C3C',fontWeight:700,background:'none',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Retry</button>
                </div>
              )}

              {/* Stale data warning — shown when last sync was more than 2 hours ago */}
              {snap && (() => {
                const ageHours = (Date.now() - new Date(snap.captured_at).getTime()) / (1000 * 60 * 60)
                return ageHours > 2
              })() && (
                <div style={{background:'#FEF3E2',border:'1px solid #F5941F',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#6B6B6B',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                  <span>⚠ Data is <strong style={{color:'#1A1A1A'}}>{staleLabel}</strong> — open Claude.ai with the extension active to get a fresh reading.</span>
                  <button onClick={() => user && fetchData(user.id)} style={{background:'#F5941F',color:'white',border:'none',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',flexShrink:0}}>Refresh</button>
                </div>
              )}

              {/* Tool selector + toggle */}
              <div style={{display:'flex',alignItems:'center',gap:10,background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:'10px 14px'}}>
                <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD'}}>Tool</span>
                <div style={{display:'flex',gap:5,flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:999,fontSize:11,fontWeight:600,border:'1.5px solid #1A1A1A',background:'#1A1A1A',color:'white'}}>
                    <img src="https://www.google.com/s2/favicons?sz=32&domain=claude.ai" width={13} height={13} style={{borderRadius:3}} alt=""/>
                    Claude
                  </div>
                  {['chatgpt.com','gemini.google.com'].map((domain,i) => (
                    <div key={domain} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:999,fontSize:11,fontWeight:600,cursor:'default',border:'1.5px solid #E2E2DC',color:'#6B6B6B',opacity:0.4}}>
                      <img src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`} width={13} height={13} style={{borderRadius:3}} alt=""/>
                      {i===0?'ChatGPT':'Gemini'}
                      <span style={{fontSize:9,background:'#F2F2EF',padding:'1px 5px',borderRadius:999}}>Soon</span>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',background:'#F2F2EF',borderRadius:999,padding:2,gap:2}}>
                  {(['detail','summary'] as UsageView[]).map(v => (
                    <button key={v} onClick={() => setUsageView(v)} style={{
                      padding:'3px 10px',borderRadius:999,fontSize:10,fontWeight:600,cursor:'pointer',border:'none',
                      fontFamily:'Inter,sans-serif',textTransform:'capitalize',
                      background:usageView===v?'#FFFFFF':'transparent',
                      color:usageView===v?'#1A1A1A':'#6B6B6B',
                      boxShadow:usageView===v?'0 1px 3px rgba(0,0,0,.08)':'none',transition:'all .15s',
                    }}>{v}</button>
                  ))}
                </div>
              </div>

              {!dataLoading && !snap && (
                <div style={{background:'#FFFFFF',border:'1.5px dashed #CBCBC4',borderRadius:12,padding:'32px 24px',textAlign:'center'}}>
                  <div style={{fontSize:28,marginBottom:10}}>✦</div>
                  <div style={{fontFamily:'var(--font-heading)',fontSize:18,fontWeight:400,color:'#1A1A1A',marginBottom:6}}>No usage data yet</div>
                  <div style={{fontSize:12,color:'#6B6B6B',lineHeight:1.7,maxWidth:320,margin:'0 auto'}}>Install the CredFlow extension and open Claude.ai to start tracking. Data will appear here automatically after your first session.</div>
                </div>
              )}

              {dataLoading && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:16,minHeight:120}}>
                      <div style={{width:'60%',height:10,background:'#F2F2EF',borderRadius:4,marginBottom:12}}/>
                      <div style={{width:'40%',height:32,background:'#F2F2EF',borderRadius:4,marginBottom:12}}/>
                      <div style={{width:'100%',height:4,background:'#F2F2EF',borderRadius:999}}/>
                    </div>
                  ))}
                </div>
              )}

              {/* DETAIL VIEW */}
              {!dataLoading && snap && usageView === 'detail' && (
                <>
                  {/* ── Claude cards ── */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>

                    {/* Session card */}
                    <div style={{background:'#FFFFFF',border:`1px solid ${sessionPct!>=95?'#E83C3C':sessionPct!>=80?'#F5941F':'#E2E2DC'}`,borderRadius:12,padding:16}}>
                      <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.9px',color:'#ADADAD',fontWeight:700,marginBottom:5}}>Claude · Session</div>
                      <div style={{fontFamily:'var(--font-heading)',fontSize:32,fontWeight:400,lineHeight:1,marginBottom:9,color:sessionPct!>=95?'#E83C3C':sessionPct!>=80?'#F5941F':'#5170FF'}}>
                        {sessionPct}%
                      </div>
                      <div style={{width:'100%',height:4,background:'#F2F2EF',borderRadius:999,overflow:'hidden',marginBottom:6}}>
                        <div style={{height:'100%',borderRadius:999,width:`${sessionPct}%`,background:sessionPct!>=95?'#E83C3C':sessionPct!>=80?'#F5941F':'#5170FF'}}/>
                      </div>
                      <span style={{display:'inline-block',fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:999,background:'#EEF0FF',color:'#1800AD',fontVariantNumeric:'tabular-nums'}}>{fmtHMS(sessionSecs)}</span>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                        <span style={{fontSize:10,color:'#ADADAD'}}>Resets</span>
                        <span style={{fontSize:10,fontWeight:600,color:'#5170FF',fontVariantNumeric:'tabular-nums'}}>{fmtResets(sessionSecs)}</span>
                      </div>
                    </div>

                    {/* Weekly card */}
                    <div style={{background:'#FFFFFF',border:`1px solid ${weeklyPct!>=80?'#F5941F':'#E2E2DC'}`,borderRadius:12,padding:16}}>
                      <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.9px',color:'#ADADAD',fontWeight:700,marginBottom:5}}>Claude · Weekly</div>
                      <div style={{fontFamily:'var(--font-heading)',fontSize:32,fontWeight:400,lineHeight:1,marginBottom:9,color:'#F5941F'}}>{weeklyPct}%</div>
                      <div style={{width:'100%',height:4,background:'#F2F2EF',borderRadius:999,overflow:'hidden',marginBottom:6}}>
                        <div style={{height:'100%',borderRadius:999,background:'#F5941F',width:`${weeklyPct}%`}}/>
                      </div>
                      <span style={{display:'inline-block',fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:999,background:'#FEF3E2',color:'#F5941F',fontVariantNumeric:'tabular-nums'}}>{fmtWeeklyResets(weeklySecs)}</span>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                        <span style={{fontSize:10,color:'#ADADAD'}}>Resets</span>
                        <span style={{fontSize:10,fontWeight:600,color:'#F5941F',fontVariantNumeric:'tabular-nums'}}>{fmtWeeklyResets(weeklySecs)}</span>
                      </div>
                    </div>

                    {/* Last captured card */}
                    <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:16}}>
                      <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'.9px',color:'#ADADAD',fontWeight:700,marginBottom:5}}>Last Captured</div>
                      <div style={{fontFamily:'var(--font-heading)',fontSize:22,fontWeight:400,lineHeight:1.2,marginBottom:9,color:'#1A1A1A'}}>
                        {new Date(snap.captured_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      </div>
                      <div style={{fontSize:11,color:'#6B6B6B',marginBottom:10}}>
                        {new Date(snap.captured_at).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}
                      </div>
                      <span style={{display:'inline-block',fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:999,background:'#E6F9F0',color:'#2DC07A'}}>v{snap.source_version}</span>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                        <span style={{fontSize:10,color:'#ADADAD'}}>Synced</span>
                        <span style={{fontSize:10,fontWeight:600,color:'#2DC07A'}}>{staleLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Insight strip */}
                  {sessionPct!>=80 ? (
                    <div style={{background:'#FEF3E2',borderLeft:'3px solid #F5941F',borderRadius:12,padding:'12px 14px',fontSize:12,color:'#6B6B6B',lineHeight:1.6}}>
                      <strong style={{color:'#1A1A1A',fontWeight:600}}>⚠ Approaching session limit — </strong>
                      you&apos;re at {sessionPct}% of your Claude session. The extension will notify you at {sessionThreshold}%.
                    </div>
                  ) : (
                    <div style={{background:'#FFFBE8',borderLeft:'3px solid #FFCC00',borderRadius:12,padding:'12px 14px',fontSize:12,color:'#6B6B6B',lineHeight:1.6}}>
                      <strong style={{color:'#1A1A1A',fontWeight:600}}>Tip — </strong>
                      you&apos;re at {sessionPct}% of your Claude session. You&apos;ll be notified when you reach {sessionThreshold}%.
                    </div>
                  )}

                  {/* 7-day bar chart — gated by plan */}
                  {chartDays.length > 0 ? (
                    <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:16}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
                        <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'#1A1A1A'}}>
                          7-Day Session History
                        </div>
                        {!isPro && (
                          <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',background:'#F2F2EF',border:'1px solid #E2E2DC',borderRadius:999,padding:'2px 9px'}}>Pro</span>
                        )}
                      </div>
                      <div style={{fontSize:10,color:'#6B6B6B',marginBottom:14}}>Daily peak session utilisation %</div>

                      {/* Chart wrapper — relative so overlay sits on top */}
                      <div style={{position:'relative',minHeight:160}}>
                        <div style={{display:'flex',gap:6,height:130,alignItems:'flex-end'}}>
                          {chartDays.map((bar, idx) => {
                            // Free users: only today's bar shows real data
                            const showReal = isPro || bar.today
                            const displayH = showReal
                              ? (bar.val > 0 ? Math.max(Math.round((bar.val / 100) * 85), 14) : 4)
                              : (15 + (idx * 8))
                            const barBg    = showReal
                              ? (bar.today ? '#5170FF' : bar.val > 0 ? '#C8D0FF' : '#E2E2DC')
                              : '#E2E2DC'
                            return (
                              <div key={`${bar.label}-${idx}`} style={{flex:1,height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                                <span style={{fontSize:9,fontWeight:700,color:showReal?(bar.today?'#5170FF':bar.val>0?'#9BAAE8':'#ADADAD'):'#D0D0D0',fontVariantNumeric:'tabular-nums',flexShrink:0,lineHeight:1}}>
                                  {showReal ? (bar.val > 0 ? `${bar.val}%` : '0%') : '—'}
                                </span>
                                <div style={{width:'100%',flexShrink:0,borderRadius:'4px 4px 0 0',background:barBg,height:`${displayH}px`,opacity:showReal?1:0.45}}/>
                                <div style={{fontSize:9,color: bar.today ? '#1A1A1A' : '#ADADAD',fontWeight: bar.today ? 700 : 400,flexShrink:0,lineHeight:1}}>{bar.label}</div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Lock overlay — free users only */}
                        {!isPro && (
                          <div style={{
                            position:'absolute',inset:0,
                            backdropFilter:'blur(6px)',
                            WebkitBackdropFilter:'blur(6px)',
                            background:'rgba(250,250,248,0.78)',
                            borderRadius:8,
                            display:'flex',flexDirection:'column',
                            alignItems:'center',justifyContent:'center',
                            gap:8,zIndex:10,padding:'16px 20px',
                          }}>
                            <div style={{fontFamily:'var(--font-heading)',fontSize:16,fontWeight:500,color:'#1A1A1A',textAlign:'center'}}>History is a Pro feature</div>
                            <div style={{fontSize:12,color:'#6B6B6B',textAlign:'center',maxWidth:240,lineHeight:1.4}}>See your full 30-day trends, ChatGPT tracking and weekly digest.</div>
                            <button onClick={handleUpgrade} style={{
                              marginTop:4,padding:'8px 20px',
                              background:'#FFCC00',color:'#1A1A1A',
                              fontFamily:'Inter,sans-serif',fontSize:12,fontWeight:700,
                              borderRadius:8,border:'none',cursor:'pointer',
                            }}>
                              Upgrade to Pro — ₹299/mo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:16}}>
                      <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'#1A1A1A',marginBottom:8}}>7-Day Session History · Claude</div>
                      <div style={{fontSize:11,color:'#ADADAD',textAlign:'center',padding:'24px 0'}}>History builds after 2+ days of usage</div>
                    </div>
                  )}
                </>
              )}

              {/* SUMMARY VIEW */}
              {!dataLoading && snap && usageView === 'summary' && (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',padding:'2px 0'}}>All Tools — Combined View</div>
                  <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <div style={{width:24,height:24,borderRadius:5,overflow:'hidden',background:'#F2F2EF',flexShrink:0}}>
                        <img src="https://www.google.com/s2/favicons?sz=32&domain=claude.ai" width={24} height={24} style={{objectFit:'contain'}} alt=""/>
                      </div>
                      <span style={{fontSize:12,fontWeight:600,color:'#1A1A1A'}}>Claude</span>
                      <span style={{marginLeft:'auto',fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:999,background:'#E6F9F0',color:'#2DC07A'}}>Active</span>
                    </div>
                    <div style={{fontFamily:'var(--font-heading)',fontSize:22,fontWeight:400,color:'#1A1A1A',lineHeight:1,marginBottom:6}}>
                      {sessionPct}% <span style={{fontSize:12,color:'#6B6B6B'}}>session</span>
                    </div>
                    <div style={{width:'100%',height:4,background:'#F2F2EF',borderRadius:999,overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:999,background:'#5170FF',width:`${sessionPct}%`}}/>
                    </div>
                    <div style={{fontSize:10,color:'#ADADAD',marginTop:5}}>Weekly: {weeklyPct}% · Resets {fmtWeeklyResets(weeklySecs)}</div>
                  </div>
                  {[{name:'ChatGPT',domain:'chatgpt.com'},{name:'Gemini',domain:'gemini.google.com'}].map(tool => (
                    <div key={tool.name} style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:12,opacity:0.5}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <div style={{width:24,height:24,borderRadius:5,overflow:'hidden',background:'#F2F2EF',flexShrink:0}}>
                          <img src={`https://www.google.com/s2/favicons?sz=32&domain=${tool.domain}`} width={24} height={24} style={{objectFit:'contain'}} alt=""/>
                        </div>
                        <span style={{fontSize:12,fontWeight:600,color:'#1A1A1A'}}>{tool.name}</span>
                        <span style={{marginLeft:'auto',fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:999,background:'#F2F2EF',color:'#ADADAD'}}>Soon</span>
                      </div>
                      <div style={{fontSize:13,color:'#ADADAD',marginBottom:6}}>Not connected</div>
                      <div style={{width:'100%',height:4,background:'#F2F2EF',borderRadius:999}}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div style={{padding:22,display:'flex',flexDirection:'column',gap:14}}>
              <div style={{fontFamily:'var(--font-heading)',fontSize:24,fontWeight:400,color:'#1A1A1A',lineHeight:1,marginBottom:4}}>
                Settings
              </div>

              <SettingsSection title="Account">
                <SettingsRow label="Email address" sub={user?.email??'—'} last={false}>{null}</SettingsRow>
                <SettingsRow label="Current plan" sub={isPro?'Pro · All features unlocked':'Free · Claude only · Up to 3 subscriptions'} last={true}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4,background:'#F2F2EF',borderRadius:999,padding:'3px 9px',fontSize:11,fontWeight:600,color:'#6B6B6B'}}>
                    {isPro?<span style={{color:'#8B5CF6'}}>Pro ✦</span>:<>Free <span onClick={handleUpgrade} style={{color:'#5170FF',cursor:'pointer',fontWeight:600,marginLeft:3}}>Upgrade</span></>}
                  </span>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="">
                <SettingsRow label="Clear all usage history" sub="Permanently delete your Claude tracking history from CredFlow" last={false}>
                  <button onClick={handleClearHistory} disabled={clearingHistory} style={S.dangerBtn}>{clearingHistory ? 'Clearing...' : 'Clear history'}</button>
                </SettingsRow>
                <SettingsRow label="Delete account" sub="Permanently delete your CredFlow account and all associated data" last>
                  <button onClick={handleDeleteAccount} disabled={deletingAccount} style={S.dangerBtn}>{deletingAccount ? 'Deleting...' : 'Delete account'}</button>
                </SettingsRow>
              </SettingsSection>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div onClick={onToggle} style={{width:34,height:19,borderRadius:999,position:'relative',cursor:'pointer',flexShrink:0,background:on?'#2DC07A':'#E2E2DC',transition:'background .2s'}}>
      <div style={{width:13,height:13,borderRadius:'50%',background:'white',position:'absolute',top:3,left:on?18:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
    </div>
  )
}

function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,overflow:'hidden'}}>
      {title ? (
        <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',padding:'10px 16px',borderBottom:'1px solid #E2E2DC',background:'#F2F2EF'}}>{title}</div>
      ) : null}
      {children}
    </div>
  )
}

function SettingsRow({ label, sub, children, last }: { label: string; sub: string; children: React.ReactNode; last: boolean }) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:last?'none':'1px solid #E2E2DC'}}>
      <div>
        <div style={{fontSize:13,fontWeight:500,color:'#1A1A1A'}}>{label}</div>
        <div style={{fontSize:11,color:'#6B6B6B',marginTop:1}}>{sub}</div>
      </div>
      {children}
    </div>
  )
}

function SmallBtn({ children }: { children: React.ReactNode }) {
  return <button style={{background:'#F2F2EF',border:'none',borderRadius:8,padding:'4px 10px',fontFamily:'Inter,sans-serif',fontSize:10,fontWeight:600,color:'#6B6B6B',cursor:'pointer'}}>{children}</button>
}

const S: Record<string, React.CSSProperties> = {
  select:    {height:26,border:'1.5px solid #E2E2DC',borderRadius:8,padding:'0 7px',fontFamily:'Inter,sans-serif',fontSize:11,color:'#1A1A1A',background:'white',outline:'none'},
  dangerBtn: {background:'#FDECEC',color:'#E83C3C',border:'1.5px solid #E83C3C',borderRadius:8,padding:'4px 12px',fontFamily:'Inter,sans-serif',fontSize:10,fontWeight:700,cursor:'pointer'},
}
