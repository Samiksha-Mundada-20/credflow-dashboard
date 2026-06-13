// src/app/dashboard/page.tsx
// Dashboard — fully connected to Supabase backend.
// Step 10: 7-day history chart gated by plan.
// Free users see lock overlay. Pro users see full chart.
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, signOut } from '@/lib/auth'
import {
  getDashboardData,
  saveSettings,
  onePerDay,
  secsUntil,
  pctInt,
  type DashboardData,
  type UsageSnapshot,
} from '@/lib/data'
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

  useEffect(() => {
    async function check() {
      const u = await getUser()
      if (!u) { router.replace('/login'); return }
      setUser(u); setAuthLoading(false)
    }
    check()
  }, [router])

  const fetchData = useCallback(async (userId: string) => {
    setDataLoading(true); setDataError(null)
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
    } catch { setDataError('Could not load data. Check your connection.') }
    finally { setDataLoading(false) }
  }, [])

  useEffect(() => { if (!authLoading && user) fetchData(user.id) }, [authLoading, user, fetchData])

  useEffect(() => {
    const t = setInterval(() => {
      setSessionSecs(s => Math.max(0, s - 1))
      setWeeklySecs(s => Math.max(0, s - 1))
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
    if (result.success) { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2500) }
  }

  async function handleSignOut() {
    setSigningOut(true); await signOut(); router.replace('/login')
  }

  const initials = user?.email?.[0]?.toUpperCase() ?? 'U'
  const isPro    = data?.settings?.plan === 'pro'

  const chartDays: Array<{ label: string; h: number; today: boolean }> = (() => {
    if (!data?.history.length) return []
    return onePerDay(data.history).map(snap => ({
      label: isToday(snap.captured_at) ? 'Today' : dayLabel(snap.captured_at),
      h:     Math.max(pctInt(snap.session_utilization), 24),
      today: isToday(snap.captured_at),
    }))
  })()

  const snap: UsageSnapshot | null = data?.latestSnapshot ?? null
  const sessionPct = snap ? pctInt(snap.session_utilization) : null
  const weeklyPct  = snap ? pctInt(snap.weekly_utilization)  : null

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
          {(['usage','settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding:'0 14px',height:54,display:'flex',alignItems:'center',fontSize:12,fontWeight:500,
              cursor:'pointer',background:'transparent',border:'none',fontFamily:'Inter,sans-serif',
              color: activeTab===t ? '#1A1A1A' : '#6B6B6B',
              borderBottom: activeTab===t ? '2px solid #FFCC00' : '2px solid transparent',
              position:'relative',top:1,transition:'all .18s',textTransform:'capitalize',
            }}>{t}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <button onClick={() => user && fetchData(user.id)} disabled={dataLoading} title="Refresh" style={{width:28,height:28,borderRadius:8,background:'#F2F2EF',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',opacity:dataLoading?0.5:1}}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{animation:dataLoading?'spin .7s linear infinite':'none'}}>
              <path d="M11 6.5A4.5 4.5 0 1 1 6.5 2a4.5 4.5 0 0 1 3.18 1.32" stroke="#6B6B6B" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M9 1l.7 2.3L7 3.7" stroke="#6B6B6B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{width:28,height:28,borderRadius:'50%',background:'#EEF0FF',border:'1.5px solid #5170FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#1800AD'}}>{initials}</div>
          {!isPro && <button style={{background:'#FFCC00',color:'#1A1A1A',border:'none',borderRadius:8,padding:'5px 11px',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer'}}>Upgrade ✦</button>}
          {isPro  && <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,background:'#F3EEFF',color:'#8B5CF6'}}>Pro ✦</span>}
          <button onClick={handleSignOut} disabled={signingOut} style={{background:'transparent',border:'1px solid #E2E2DC',borderRadius:8,padding:'5px 11px',fontSize:11,color:'#6B6B6B',cursor:'pointer',opacity:signingOut?0.5:1,fontFamily:'Inter,sans-serif'}}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* BODY */}
      <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>

        {/* Sidebar */}
        <div style={{width:180,background:'#FFFFFF',borderRight:'1px solid #E2E2DC',padding:'12px 10px',display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
          {([
            {id:'usage'    as Tab, icon:'📈', activeBg:'#FFFBE8', activeBorder:'#FFF0A0'},
            {id:'settings' as Tab, icon:'⚙️', activeBg:'#F2F2EF', activeBorder:'#E2E2DC'},
          ]).map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={{
              display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,
              fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif',
              color: activeTab===item.id ? '#1A1A1A' : '#6B6B6B',
              background: activeTab===item.id ? item.activeBg : 'transparent',
              border: activeTab===item.id ? `1px solid ${item.activeBorder}` : '1px solid transparent',
              transition:'all .15s',textTransform:'capitalize',
            }}>
              <span style={{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,background:item.activeBg,flexShrink:0}}>{item.icon}</span>
              {item.id}
            </button>
          ))}
          <button style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,fontSize:12,color:'#6B6B6B',fontWeight:500,cursor:'pointer',border:'1px solid transparent',background:'transparent',marginTop:'auto',fontFamily:'Inter,sans-serif'}}>
            <span style={{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,background:'#F2F2EF',flexShrink:0}}>?</span>
            Help
          </button>
        </div>

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
                        <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'#1A1A1A'}}>7-Day Session History · Claude</div>
                        {!isPro && (
                          <span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',background:'#F2F2EF',border:'1px solid #E2E2DC',borderRadius:999,padding:'2px 9px'}}>Pro</span>
                        )}
                      </div>
                      <div style={{fontSize:10,color:'#6B6B6B',marginBottom:14}}>Daily peak session utilisation %</div>

                      {/* Chart wrapper — relative so overlay sits on top */}
                      <div style={{position:'relative'}}>
                        <div style={{display:'flex',gap:6,height:130,alignItems:'flex-end'}}>
                          {chartDays.map((bar, idx) => {
                            // Free users: only today's bar shows real data
                            const showReal = isPro || bar.today
                            const displayH = showReal ? bar.h : 20 + (idx * 10)
                            const barBg    = showReal
                              ? (bar.today ? '#5170FF' : '#C8D0FF')
                              : '#E2E2DC'
                            return (
                              <div key={bar.label} style={{flex:1,height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                                <span style={{fontSize:9,fontWeight:700,color:showReal?(bar.today?'#5170FF':'#9BAAE8'):'#D0D0D0',fontVariantNumeric:'tabular-nums',flexShrink:0,lineHeight:1}}>
                                  {showReal ? `${displayH}%` : '—'}
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
                            backdropFilter:'blur(5px)',
                            WebkitBackdropFilter:'blur(5px)',
                            background:'rgba(250,250,248,0.72)',
                            borderRadius:8,
                            display:'flex',flexDirection:'column',
                            alignItems:'center',justifyContent:'center',
                            gap:10,zIndex:10,
                          }}>
                            <div style={{width:36,height:36,borderRadius:'50%',background:'#F2F2EF',border:'1px solid #E2E2DC',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🔒</div>
                            <div style={{fontFamily:'var(--font-heading)',fontSize:16,fontWeight:500,color:'#1A1A1A',textAlign:'center'}}>History is a Pro feature</div>
                            <div style={{fontSize:12,color:'#6B6B6B',textAlign:'center',maxWidth:200,lineHeight:1.5}}>See your full 30-day trends, ChatGPT tracking and weekly digest.</div>
                            <a href="https://credflow.vercel.app/#pricing" target="_blank" rel="noreferrer" style={{
                              marginTop:4,padding:'8px 20px',
                              background:'#FFCC00',color:'#1A1A1A',
                              fontFamily:'Inter,sans-serif',fontSize:12,fontWeight:700,
                              borderRadius:8,textDecoration:'none',
                            }}>
                              Upgrade to Pro — $4/mo
                            </a>
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

                  {/* Upgrade prompt card — free users only */}
                  {!isPro && (
                    <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,padding:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
                      <div>
                        <div style={{fontFamily:'var(--font-heading)',fontSize:15,fontWeight:500,color:'#1A1A1A',marginBottom:4}}>Unlock Pro</div>
                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                          {['📊 30-day usage history','🤖 ChatGPT tracking','📬 Weekly email digest'].map(f => (
                            <div key={f} style={{fontSize:12,color:'#6B6B6B'}}>{f}</div>
                          ))}
                        </div>
                      </div>
                      <a href="https://credflow.vercel.app/#pricing" target="_blank" rel="noreferrer" style={{
                        flexShrink:0,padding:'9px 20px',
                        background:'#FFCC00',color:'#1A1A1A',
                        fontFamily:'Inter,sans-serif',fontSize:12,fontWeight:700,
                        borderRadius:8,textDecoration:'none',whiteSpace:'nowrap',
                      }}>
                        Upgrade — $4/mo
                      </a>
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
                        <span style={{marginLeft:'auto',fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:999,background:'#F2F2EF',color:'#ADADAD'}}>Phase 2</span>
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
              <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontFamily:'var(--font-heading)',fontSize:24,fontWeight:400,color:'#1A1A1A',lineHeight:1}}>Settings</div>
                  <div style={{fontSize:11,color:'#6B6B6B',marginTop:3}}>Changes save to your account and sync to the extension</div>
                </div>
                <button onClick={handleSaveSettings} disabled={savingSettings} style={{background:settingsSaved?'#2DC07A':'#1A1A1A',color:'white',border:'none',borderRadius:8,padding:'7px 16px',fontFamily:'Inter,sans-serif',fontSize:12,fontWeight:600,cursor:'pointer',transition:'background .2s',opacity:savingSettings?0.7:1}}>
                  {savingSettings?'Saving…':settingsSaved?'✔ Saved':'Save changes'}
                </button>
              </div>

              <SettingsSection title="Account">
                <SettingsRow label="Email address" sub={user?.email??'—'} last={false}><SmallBtn>Edit</SmallBtn></SettingsRow>
                <SettingsRow label="Current plan" sub={isPro?'Pro · All features unlocked':'Free · Claude only · Up to 3 subscriptions'} last={false}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4,background:'#F2F2EF',borderRadius:999,padding:'3px 9px',fontSize:11,fontWeight:600,color:'#6B6B6B'}}>
                    {isPro?<span style={{color:'#8B5CF6'}}>Pro ✦</span>:<>Free <span style={{color:'#5170FF',cursor:'pointer',fontWeight:600,marginLeft:3}}>Upgrade</span></>}
                  </span>
                </SettingsRow>
                <SettingsRow label="Password" sub="Change your account password" last><SmallBtn>Change</SmallBtn></SettingsRow>
              </SettingsSection>

              <SettingsSection title="Claude Usage Alerts">
                <SettingsRow label="Enable usage alerts" sub="Chrome push notification when you approach your session limit" last={false}>
                  <Toggle on={sessionThreshold>0} onToggle={() => setSessionThreshold(v => v>0?0:80)}/>
                </SettingsRow>
                <SettingsRow label="Session alert threshold" sub={`Notify when Claude session usage reaches ${sessionThreshold}%`} last={false}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input type="range" min={50} max={99} value={sessionThreshold} onChange={e => setSessionThreshold(Number(e.target.value))} style={{width:80,accentColor:'#5170FF'}}/>
                    <span style={{fontSize:11,fontWeight:600,color:'#1A1A1A',minWidth:32}}>{sessionThreshold}%</span>
                  </div>
                </SettingsRow>
                <SettingsRow label="Second alert at 95%" sub="Send a follow-up alert when you're almost out" last={false}>
                  <Toggle on={secondAlert} onToggle={() => setSecondAlert(v => !v)}/>
                </SettingsRow>
                <SettingsRow label="Weekly alert threshold" sub={`Notify when weekly Claude usage reaches ${weeklyThreshold}%`} last>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input type="range" min={50} max={99} value={weeklyThreshold} onChange={e => setWeeklyThreshold(Number(e.target.value))} style={{width:80,accentColor:'#F5941F'}}/>
                    <span style={{fontSize:11,fontWeight:600,color:'#1A1A1A',minWidth:32}}>{weeklyThreshold}%</span>
                  </div>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="Subscription Reminders">
                <SettingsRow label="Enable payment reminders" sub="Chrome notification before subscription renewals" last={false}>
                  <Toggle on={reminders} onToggle={() => setReminders(v => !v)}/>
                </SettingsRow>
                <SettingsRow label="Default reminder time" sub="When to notify before renewal" last>
                  <select style={S.select} defaultValue="1"><option value="1">Day before</option><option value="0">Same day</option><option value="2">2 days before</option></select>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="Extension">
                <SettingsRow label="Show injected bar in Claude" sub="Display CredFlow usage bar below the composer in claude.ai" last={false}>
                  <Toggle on={injectedBar} onToggle={() => setInjectedBar(v => !v)}/>
                </SettingsRow>
                <SettingsRow label="Background sync frequency" sub="How often the extension syncs usage data to your account" last={false}>
                  <select style={S.select} value={syncFreq} onChange={e => setSyncFreq(Number(e.target.value))}>
                    <option value={1}>Every message</option>
                    <option value={5}>Every 5 minutes</option>
                    <option value={10}>Every 10 minutes</option>
                  </select>
                </SettingsRow>
                <SettingsRow label="Data retention" sub={isPro?'Pro tier: 1 year history kept':'Free tier: 7 days history kept'} last>
                  <select style={S.select} disabled><option>{isPro?'1 year (Pro)':'7 days (Free)'}</option></select>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="Danger Zone">
                <SettingsRow label="Clear all usage history" sub="Permanently delete your Claude tracking history from CredFlow" last={false}>
                  <button style={S.dangerBtn}>Clear history</button>
                </SettingsRow>
                <SettingsRow label="Delete account" sub="Permanently delete your CredFlow account and all associated data" last>
                  <button style={S.dangerBtn}>Delete account</button>
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

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,overflow:'hidden'}}>
      <div style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',padding:'10px 16px',borderBottom:'1px solid #E2E2DC',background:'#F2F2EF'}}>{title}</div>
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
