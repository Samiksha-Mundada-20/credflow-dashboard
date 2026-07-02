// src/app/convert/page.tsx
// Markdown file converter — Step 14
// Accepts PDF, DOCX, PPTX, TXT → returns Markdown via Edge Function
// Free: 5 conversions per session (React state only, no DB)
// Pro: unlimited

'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CONVERT_ENDPOINT  = `${SUPABASE_URL}/functions/v1/convert-to-markdown`
const FREE_LIMIT        = 5
const ALLOWED_TYPES     = ['.pdf', '.docx', '.pptx', '.txt']
const ALLOWED_MIME      = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]

type ConvertState = 'idle' | 'converting' | 'done' | 'error'

function getExt(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ConvertPage() {
  const router = useRouter()

  const [user,         setUser]         = useState<User | null>(null)
  const [authLoading,  setAuthLoading]  = useState(true)
  const [isPro,        setIsPro]        = useState(false)
  const [signingOut,   setSigningOut]   = useState(false)

  // Converter state
  const [file,         setFile]         = useState<File | null>(null)
  const [state,        setState]        = useState<ConvertState>('idle')
  const [markdown,     setMarkdown]     = useState<string>('')
  const [errorMsg,     setErrorMsg]     = useState<string>('')
  const [isDragging,   setIsDragging]   = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [claudeToast,  setClaudeToast]  = useState(false)
  const [conversions,  setConversions]  = useState(0) // free-tier counter

  const fileInputRef  = useRef<HTMLInputElement>(null)

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      const u = await getUser()
      if (!u) { router.replace('/login'); return }
      setUser(u)

      // Check plan
      const { data } = await supabase
        .from('user_settings')
        .select('plan')
        .eq('user_id', u.id)
        .single()
      setIsPro(data?.plan === 'pro')
      setAuthLoading(false)
    }
    check()
  }, [router])

  // ── File validation ───────────────────────────────────────────────────────
  function validateFile(f: File): string | null {
    const ext = getExt(f.name)
    if (!ALLOWED_TYPES.includes(ext)) return `Unsupported type: ${ext || 'unknown'}. Use PDF, DOCX, PPTX, or TXT.`
    if (f.size > 20 * 1024 * 1024) return 'File too large. Max 20 MB.'
    return null
  }

  function pickFile(f: File) {
    const err = validateFile(f)
    if (err) { setErrorMsg(err); setState('error'); return }
    setFile(f)
    setMarkdown('')
    setErrorMsg('')
    setState('idle')
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }, [])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  // ── Convert ───────────────────────────────────────────────────────────────
  async function handleConvert() {
    if (!file || !user) return

    // Free tier limit check
    if (!isPro && conversions >= FREE_LIMIT) return

    setState('converting')
    setMarkdown('')
    setErrorMsg('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) { setState('error'); setErrorMsg('Session expired. Please sign in again.'); return }

      const form = new FormData()
      form.append('file', file)
      form.append('filename', file.name)

      const res = await fetch(CONVERT_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      })

      const json = await res.json()

      if (!res.ok) {
        setState('error')
        setErrorMsg(json.error ?? 'Conversion failed. Try again.')
        return
      }

      setMarkdown(json.markdown)
      setState('done')
      if (!isPro) setConversions(c => c + 1)

    } catch (err) {
      setState('error')
      setErrorMsg('Network error. Check your connection and try again.')
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleDownload() {
    if (!markdown) return
    const base = file?.name.replace(/\.[^.]+$/, '') ?? 'converted'
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${base}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopy() {
    if (!markdown) return
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleOpenInClaude() {
    if (!markdown) return
    navigator.clipboard.writeText(markdown).then(() => {
      setClaudeToast(true)
      setTimeout(() => setClaudeToast(false), 4000)
    })
    window.open('https://claude.ai', '_blank')
  }

  function handleReset() {
    setFile(null)
    setMarkdown('')
    setErrorMsg('')
    setState('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSignOut() {
    setSigningOut(true); await signOut(); router.replace('/login')
  }

  const initials      = user?.email?.[0]?.toUpperCase() ?? 'U'
  const atLimit       = !isPro && conversions >= FREE_LIMIT
  const remaining     = FREE_LIMIT - conversions

  if (authLoading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#FAFAF8'}}>
      <span style={{width:24,height:24,border:'2px solid #E2E2DC',borderTopColor:'#5170FF',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#FAFAF8',display:'flex',flexDirection:'column'}}>

      {/* ── TOP NAV ── */}
      <nav style={{background:'#FFFFFF',borderBottom:'1px solid #E2E2DC',height:54,display:'flex',alignItems:'center',padding:'0 20px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginRight:24}}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 .5L9.5 6.5 15.5 8 9.5 9.5 8 15.5 6.5 9.5.5 8 6.5 6.5Z" fill="#FFCC00"/></svg>
          <span style={{fontFamily:'var(--font-heading)',fontSize:16,fontWeight:500,color:'#1A1A1A',letterSpacing:'-0.3px'}}>CredFlow</span>
        </div>
        <div style={{display:'flex',flex:1}}>
          {[
            {label:'Usage',    href:'/dashboard'},
            {label:'Settings', href:'/dashboard'},
            {label:'Convert',  href:'/convert'},
          ].map(item => (
            <a key={item.label} href={item.href} style={{
              padding:'0 14px',height:54,display:'flex',alignItems:'center',fontSize:12,fontWeight:500,
              cursor:'pointer',background:'transparent',border:'none',fontFamily:'Inter,sans-serif',
              textDecoration:'none',
              color: item.label === 'Convert' ? '#1A1A1A' : '#6B6B6B',
              borderBottom: item.label === 'Convert' ? '2px solid #FFCC00' : '2px solid transparent',
              position:'relative',top:1,
            }}>{item.label}</a>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:'#EEF0FF',border:'1.5px solid #5170FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#1800AD'}}>{initials}</div>
          {isPro  && <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,background:'#F3EEFF',color:'#8B5CF6'}}>Pro ✦</span>}
          {!isPro && <button style={{background:'#FFCC00',color:'#1A1A1A',border:'none',borderRadius:8,padding:'5px 11px',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer'}}>Upgrade ✦</button>}
          <button onClick={handleSignOut} disabled={signingOut} style={{background:'transparent',border:'1px solid #E2E2DC',borderRadius:8,padding:'5px 11px',fontSize:11,color:'#6B6B6B',cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* ── BODY ── */}
      <div style={{display:'flex',flex:1,overflow:'hidden',minHeight:0}}>

        {/* Sidebar */}
        <div style={{width:180,background:'#FFFFFF',borderRight:'1px solid #E2E2DC',padding:'12px 10px',display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
          {[
            {label:'Usage',    href:'/dashboard', icon:'📈', active:false},
            {label:'Settings', href:'/dashboard', icon:'⚙️', active:false},
            {label:'Convert',  href:'/convert',   icon:'📄', active:true},
          ].map(item => (
            <a key={item.label} href={item.href} style={{
              display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,
              fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif',
              textDecoration:'none',
              color:   item.active ? '#1A1A1A' : '#6B6B6B',
              background: item.active ? '#FFFBE8' : 'transparent',
              border:  item.active ? '1px solid #FFF0A0' : '1px solid transparent',
            }}>
              <span style={{width:18,height:18,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,background:item.active?'#FFFBE8':'#F2F2EF',flexShrink:0}}>{item.icon}</span>
              {item.label}
            </a>
          ))}
          <div style={{marginTop:'auto'}}>
            <div style={{fontSize:10,color:'#ADADAD',padding:'6px 10px',lineHeight:1.5}}>
              {isPro ? 'Unlimited conversions' : `${remaining} of ${FREE_LIMIT} left this session`}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{flex:1,overflowY:'auto',padding:22}}>

          {/* Header */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:'var(--font-heading)',fontSize:24,fontWeight:400,color:'#1A1A1A',lineHeight:1}}>Convert to Markdown</div>
            <div style={{fontSize:11,color:'#6B6B6B',marginTop:3}}>PDF, DOCX, PPTX, TXT → clean Markdown, ready for Claude</div>
          </div>

          {/* Free tier counter */}
          {!isPro && (
            <div style={{
              background: atLimit ? '#FDECEC' : '#FFFBE8',
              border: `1px solid ${atLimit ? '#E83C3C' : '#FFF0A0'}`,
              borderRadius:10, padding:'10px 14px', marginBottom:16,
              display:'flex', alignItems:'center', justifyContent:'space-between',
            }}>
              <span style={{fontSize:12, color: atLimit ? '#E83C3C' : '#6B6B6B'}}>
                {atLimit
                  ? 'Session limit reached. Upgrade to Pro for unlimited conversions.'
                  : `${conversions} of ${FREE_LIMIT} conversions used this session`}
              </span>
              {atLimit && (
                <a href="https://credflow.vercel.app/#pricing" target="_blank" rel="noreferrer"
                  style={{fontSize:11,fontWeight:700,color:'#1A1A1A',background:'#FFCC00',border:'none',borderRadius:8,padding:'5px 12px',textDecoration:'none',flexShrink:0}}>
                  Upgrade — $4/mo
                </a>
              )}
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns: state === 'done' ? '1fr 1fr' : '1fr',gap:16}}>

            {/* Left column — drop zone + controls */}
            <div style={{display:'flex',flexDirection:'column',gap:12}}>

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !file && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? '#5170FF' : file ? '#2DC07A' : '#E2E2DC'}`,
                  borderRadius:12,
                  padding: '36px 24px',
                  textAlign:'center',
                  cursor: file ? 'default' : 'pointer',
                  background: isDragging ? '#EEF0FF' : file ? '#F0FBF6' : '#FFFFFF',
                  transition:'all .2s',
                }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt"
                  style={{display:'none'}}
                  onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
                />

                {!file ? (
                  <>
                    <div style={{fontSize:32,marginBottom:10}}>📂</div>
                    <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:400,color:'#1A1A1A',marginBottom:5}}>
                      {isDragging ? 'Drop it here' : 'Drop a file or click to browse'}
                    </div>
                    <div style={{fontSize:12,color:'#ADADAD'}}>PDF · DOCX · PPTX · TXT · max 20 MB</div>
                  </>
                ) : (
                  <div style={{display:'flex',alignItems:'center',gap:12,justifyContent:'center'}}>
                    <div style={{fontSize:28}}>{
                      getExt(file.name) === '.pdf'  ? '📕' :
                      getExt(file.name) === '.docx' ? '📘' :
                      getExt(file.name) === '.pptx' ? '📙' : '📄'
                    }</div>
                    <div style={{textAlign:'left'}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#1A1A1A'}}>{file.name}</div>
                      <div style={{fontSize:11,color:'#6B6B6B'}}>{formatBytes(file.size)}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleReset() }} style={{
                      marginLeft:'auto',background:'#F2F2EF',border:'none',borderRadius:6,
                      width:24,height:24,cursor:'pointer',fontSize:13,color:'#6B6B6B',
                      display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                    }}>×</button>
                  </div>
                )}
              </div>

              {/* Error */}
              {state === 'error' && errorMsg && (
                <div style={{background:'#FDECEC',border:'1px solid #E83C3C',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#E83C3C'}}>
                  {errorMsg}
                </div>
              )}

              {/* Convert button */}
              <button
                onClick={handleConvert}
                disabled={!file || state === 'converting' || atLimit}
                style={{
                  width:'100%',padding:'12px 0',borderRadius:10,border:'none',
                  fontFamily:'Inter,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',
                  background: (!file || atLimit) ? '#F2F2EF' : '#1A1A1A',
                  color: (!file || atLimit) ? '#ADADAD' : '#FFFFFF',
                  transition:'all .18s',
                  opacity: state === 'converting' ? 0.7 : 1,
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                }}>
                {state === 'converting' ? (
                  <>
                    <span style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>
                    Converting…
                  </>
                ) : state === 'done' ? '↺ Convert another' : 'Convert to Markdown'}
              </button>

              {/* Action buttons — only shown after successful conversion */}
              {state === 'done' && (
                <div style={{display:'flex',gap:8}}>
                  <button onClick={handleDownload} style={btnStyle('#5170FF','white')}>
                    ↓ Download .md
                  </button>
                  <button onClick={handleCopy} style={btnStyle(copied?'#2DC07A':'#F2F2EF', copied?'white':'#1A1A1A')}>
                    {copied ? '✔ Copied' : '⎘ Copy'}
                  </button>
                  <button onClick={handleOpenInClaude} style={btnStyle('#F2F2EF','#1A1A1A')}>
                    ✦ Open in Claude
                  </button>
                </div>
              )}

              {/* How it works */}
              {state === 'idle' && !file && (
                <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:10,padding:14}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',marginBottom:10}}>How it works</div>
                  {[
                    ['📂','Drop your file','PDF, DOCX, PPTX, or TXT'],
                    ['⚡','Instant conversion','Runs on Supabase Edge, no data stored'],
                    ['✦','Open in Claude','Markdown copied to clipboard automatically'],
                  ].map(([icon,title,sub]) => (
                    <div key={title as string} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:10}}>
                      <span style={{fontSize:16,flexShrink:0}}>{icon}</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:'#1A1A1A'}}>{title}</div>
                        <div style={{fontSize:11,color:'#6B6B6B'}}>{sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right column — markdown preview */}
            {state === 'done' && (
              <div style={{display:'flex',flexDirection:'column',gap:0,background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,overflow:'hidden'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid #E2E2DC',background:'#F2F2EF'}}>
                  <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#6B6B6B'}}>Markdown Preview</span>
                  <span style={{fontSize:10,color:'#ADADAD'}}>{markdown.length.toLocaleString()} chars</span>
                </div>
                <pre style={{
                  flex:1,margin:0,padding:14,
                  fontFamily:'\'Courier New\', Courier, monospace',
                  fontSize:11,lineHeight:1.7,color:'#1A1A1A',
                  overflowY:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',
                  maxHeight:'60vh',
                }}>
                  {markdown}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Claude toast */}
      {claudeToast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background:'#1A1A1A', color:'white', borderRadius:10,
          padding:'12px 20px', fontSize:12, fontWeight:500,
          display:'flex', alignItems:'center', gap:8,
          boxShadow:'0 4px 20px rgba(0,0,0,0.25)', zIndex:999,
          fontFamily:'Inter,sans-serif', whiteSpace:'nowrap',
        }}>
          <span style={{fontSize:16}}>✦</span>
          Markdown copied — paste it into Claude with Ctrl+V
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    flex:1, padding:'9px 0', borderRadius:8, border:'none',
    fontFamily:'Inter,sans-serif', fontSize:11, fontWeight:700,
    cursor:'pointer', background:bg, color, transition:'all .18s',
  }
}
