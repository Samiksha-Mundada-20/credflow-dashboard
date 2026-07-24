// src/app/convert/page.tsx
// Markdown file converter — Step 14 + multi-file batch addition
// Accepts PDF, DOCX, PPTX, TXT, code files → returns Markdown via Edge Function
// Free: 5 conversions per session (React state only, no DB) — each file in a
// batch counts individually against the 5-file cap.
// Pro: unlimited
// Batch: up to 5 files per conversion, each returned as its own markdown output.

'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isLikelyEU } from '@/lib/geo'
import type { User } from '@supabase/supabase-js'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CONVERT_ENDPOINT  = `${SUPABASE_URL}/functions/v1/convert-to-markdown`
const FREE_LIMIT        = 5
const MAX_FILES         = 5
const CODE_TYPES = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.r', '.m',
  '.sh', '.bash', '.zsh', '.sql', '.html', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.md', '.mdx', '.vue', '.svelte',
  '.dart', '.lua', '.pl', '.ex', '.exs', '.clj', '.hs', '.elm', '.tf', '.env',
]
const ALLOWED_TYPES     = ['.pdf', '.docx', '.pptx', '.txt', ...CODE_TYPES]

type ConvertState = 'idle' | 'converting' | 'done' | 'error'
type FileResult = { filename: string; markdown?: string; error?: string }

function getExt(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function iconFor(filename: string): string {
  const ext = getExt(filename)
  if (ext === '.pdf')  return '📕'
  if (ext === '.docx') return '📘'
  if (ext === '.pptx') return '📙'
  return '📄'
}

function buildCombinedMarkdown(results: FileResult[]): string {
  return results
    .filter(r => r.markdown)
    .map(r => `# ${r.filename}\n\n${r.markdown}`)
    .join('\n\n---\n\n')
}

export default function ConvertPage() {
  const router = useRouter()

  const [user,         setUser]         = useState<User | null>(null)
  const [authLoading,  setAuthLoading]  = useState(true)
  const [isPro,        setIsPro]        = useState(false)
  const [isEU,         setIsEU]         = useState(false)
  const [signingOut,   setSigningOut]   = useState(false)

  // Converter state
  const [files,        setFiles]        = useState<File[]>([])
  const [state,        setState]        = useState<ConvertState>('idle')
  const [results,      setResults]      = useState<FileResult[]>([])
  const [errorMsg,     setErrorMsg]     = useState<string>('')
  const [isDragging,   setIsDragging]   = useState(false)
  const [copiedIndex,  setCopiedIndex]  = useState<number | 'all' | null>(null)
  const [claudeToast,  setClaudeToast]  = useState(false)
  const [conversions,  setConversions]  = useState(0) // free-tier counter

  const fileInputRef  = useRef<HTMLInputElement>(null)

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    setIsEU(isLikelyEU())
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
    if (!ALLOWED_TYPES.includes(ext)) return `Unsupported type: ${ext || 'unknown'}.`
    if (f.size > 50 * 1024 * 1024) return 'File too large. Max 50 MB.'
    return null
  }

  function pickFiles(newFiles: File[]) {
    if (newFiles.length === 0) return

    if (newFiles.length > MAX_FILES) {
      setErrorMsg(`You can convert up to ${MAX_FILES} files at once. You selected ${newFiles.length}.`)
      setState('error')
      return
    }

    const badFiles: string[] = []
    for (const f of newFiles) {
      const err = validateFile(f)
      if (err) badFiles.push(`${f.name} — ${err}`)
    }
    if (badFiles.length > 0) {
      setErrorMsg(badFiles.join(' | '))
      setState('error')
      return
    }

    setFiles(newFiles)
    setResults([])
    setErrorMsg('')
    setState('idle')
  }

  function addFiles(newFiles: File[]) {
    if (files.length + newFiles.length > MAX_FILES) {
      setErrorMsg(`You can convert up to ${MAX_FILES} files at once. You already have ${files.length} selected.`)
      setState('error')
      return
    }
    pickFiles([...files, ...newFiles])
  }

  function removeFile(idx: number) {
    const next = files.filter((_, i) => i !== idx)
    setFiles(next)
    setResults([])
    setErrorMsg('')
    setState('idle')
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length === 0) return
    if (files.length === 0) pickFiles(dropped)
    else addFiles(dropped)
  }, [files])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  // ── Convert ───────────────────────────────────────────────────────────────
  async function handleConvert() {
    if (files.length === 0 || !user) return

    // Free tier limit check — batch must fit in remaining allowance
    if (!isPro && conversions + files.length > FREE_LIMIT) {
      setState('error')
      setErrorMsg(`Not enough conversions left this session. You have ${FREE_LIMIT - conversions} remaining, but selected ${files.length} file${files.length !== 1 ? 's' : ''}.`)
      return
    }

    setState('converting')
    setResults([])
    setErrorMsg('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) { setState('error'); setErrorMsg('Session expired. Please sign in again.'); return }

      const form = new FormData()
      files.forEach(f => form.append('files', f, f.name))

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

      setResults(json.results ?? [])
      setState('done')
      if (!isPro) setConversions(c => c + files.length)

    } catch (err) {
      setState('error')
      setErrorMsg('Network error. Check your connection and try again.')
    }
  }

  // ── Per-file actions ──────────────────────────────────────────────────────
  function handleDownloadOne(r: FileResult) {
    if (!r.markdown) return
    const base = r.filename.replace(/\.[^.]+$/, '')
    const blob = new Blob([r.markdown], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${base}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopyOne(idx: number) {
    const r = results[idx]
    if (!r?.markdown) return
    navigator.clipboard.writeText(r.markdown).then(() => {
      setCopiedIndex(idx)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  // ── Combined actions ──────────────────────────────────────────────────────
  function handleDownloadAll() {
    const combined = buildCombinedMarkdown(results)
    if (!combined) return
    const blob = new Blob([combined], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'converted-batch.md'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopyAll() {
    const combined = buildCombinedMarkdown(results)
    if (!combined) return
    navigator.clipboard.writeText(combined).then(() => {
      setCopiedIndex('all')
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  function handleOpenInClaude() {
    const combined = buildCombinedMarkdown(results)
    if (!combined) return
    navigator.clipboard.writeText(combined).then(() => {
      setClaudeToast(true)
      setTimeout(() => setClaudeToast(false), 4000)
    })
    window.open('https://claude.ai', '_blank')
  }

  function handleReset() {
    setFiles([])
    setResults([])
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
  const successCount  = results.filter(r => r.markdown).length

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
            {label:'Convert',  href:'/convert'},
            {label:'Settings', href:'/dashboard'},
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

        {/* Main content */}
        <div style={{flex:1,overflowY:'auto',padding:22}}>

          {/* Header */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:'var(--font-heading)',fontSize:24,fontWeight:400,color:'#1A1A1A',lineHeight:1}}>Convert to Markdown</div>
            <div style={{fontSize:11,color:'#6B6B6B',marginTop:3}}>PDF, DOCX, PPTX, TXT, and 40+ code formats → clean Markdown, ready for Claude. Up to {MAX_FILES} files at once.</div>
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
                  ? (isEU ? 'Session limit reached. Pro upgrades are not currently available in the EU.' : 'Session limit reached. Upgrade to Pro for unlimited conversions.')
                  : `${conversions} of ${FREE_LIMIT} conversions used this session`}
              </span>
              {atLimit && !isEU && (
                <a href="/upgrade"
                  style={{fontSize:11,fontWeight:700,color:'#1A1A1A',background:'#FFCC00',border:'none',borderRadius:8,padding:'5px 12px',textDecoration:'none',flexShrink:0}}>
                  Upgrade — ₹299/mo
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
                onClick={() => files.length === 0 && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? '#5170FF' : files.length > 0 ? '#2DC07A' : '#E2E2DC'}`,
                  borderRadius:12,
                  padding: '28px 24px',
                  textAlign:'center',
                  cursor: files.length > 0 ? 'default' : 'pointer',
                  background: isDragging ? '#EEF0FF' : files.length > 0 ? '#F0FBF6' : '#FFFFFF',
                  transition:'all .2s',
                }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.txt,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.swift,.kt,.sh,.sql,.html,.css,.json,.yaml,.yml,.md,.vue,.svelte,.dart,.lua,.xml,.toml"
                  style={{display:'none'}}
                  onChange={e => {
                    const picked = Array.from(e.target.files ?? [])
                    if (picked.length === 0) return
                    if (files.length === 0) pickFiles(picked)
                    else addFiles(picked)
                  }}
                />

                {files.length === 0 ? (
                  <>
                    <div style={{fontSize:32,marginBottom:10}}>📂</div>
                    <div style={{fontFamily:'var(--font-heading)',fontSize:17,fontWeight:400,color:'#1A1A1A',marginBottom:5}}>
                      {isDragging ? 'Drop it here' : 'Drop files or click to browse'}
                    </div>
                    <div style={{fontSize:12,color:'#ADADAD'}}>PDF · DOCX · PPTX · TXT · Code files · max 50 MB each · up to {MAX_FILES} files</div>
                  </>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:8}} onClick={e => e.stopPropagation()}>
                    {files.map((f, i) => (
                      <div key={`${f.name}-${i}`} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:8,textAlign:'left'}}>
                        <div style={{fontSize:20,flexShrink:0}}>{iconFor(f.name)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:'#1A1A1A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                          <div style={{fontSize:10,color:'#6B6B6B'}}>{formatBytes(f.size)}</div>
                        </div>
                        <button onClick={() => removeFile(i)} style={{
                          background:'#F2F2EF',border:'none',borderRadius:6,
                          width:22,height:22,cursor:'pointer',fontSize:12,color:'#6B6B6B',
                          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                        }}>×</button>
                      </div>
                    ))}
                    {files.length < MAX_FILES && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{fontSize:11,color:'#5170FF',background:'none',border:'1px dashed #5170FF',borderRadius:8,padding:'7px 0',cursor:'pointer'}}>
                        + Add another file ({files.length}/{MAX_FILES})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Error */}
              {state === 'error' && errorMsg && (
                <div style={{background:'#FDECEC',border:'1px solid #E83C3C',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#E83C3C'}}>
                  {errorMsg}
                </div>
              )}

              {/* Convert button — fixed: "Convert another" now resets instead of re-running on stale file state */}
              <button
                onClick={state === 'done' ? handleReset : handleConvert}
                disabled={state === 'converting' || (state !== 'done' && (files.length === 0 || atLimit))}
                style={{
                  width:'100%',padding:'12px 0',borderRadius:10,border:'none',
                  fontFamily:'Inter,sans-serif',fontSize:13,fontWeight:700,cursor:'pointer',
                  background: (state !== 'done' && (files.length === 0 || atLimit)) ? '#F2F2EF' : '#1A1A1A',
                  color: (state !== 'done' && (files.length === 0 || atLimit)) ? '#ADADAD' : '#FFFFFF',
                  transition:'all .18s',
                  opacity: state === 'converting' ? 0.7 : 1,
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                }}>
                {state === 'converting' ? (
                  <>
                    <span style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>
                    Converting…
                  </>
                ) : state === 'done' ? '↺ Convert another batch' : `Convert ${files.length > 1 ? `${files.length} files` : 'to Markdown'}`}
              </button>

              {/* Combined action buttons — only shown after successful conversion */}
              {state === 'done' && successCount > 0 && (
                <div style={{display:'flex',gap:8}}>
                  <button onClick={handleDownloadAll} style={btnStyle('#5170FF','white')}>
                    ↓ Download all
                  </button>
                  <button onClick={handleCopyAll} style={btnStyle(copiedIndex==='all'?'#2DC07A':'#F2F2EF', copiedIndex==='all'?'white':'#1A1A1A')}>
                    {copiedIndex==='all' ? '✔ Copied' : '⎘ Copy all'}
                  </button>
                  <button onClick={handleOpenInClaude} style={btnStyle('#F2F2EF','#1A1A1A')}>
                    ✦ Open in Claude
                  </button>
                </div>
              )}

              {/* How it works */}
              {state === 'idle' && files.length === 0 && (
                <div style={{background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:10,padding:14}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'#ADADAD',marginBottom:10}}>How it works</div>
                  {[
                    ['📂','Drop up to 5 files','PDF, DOCX, PPTX, TXT, or code'],
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

            {/* Right column — per-file markdown results */}
            {state === 'done' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {results.map((r, i) => (
                  <div key={`${r.filename}-${i}`} style={{display:'flex',flexDirection:'column',background:'#FFFFFF',border:'1px solid #E2E2DC',borderRadius:12,overflow:'hidden'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid #E2E2DC',background: r.error ? '#FDECEC' : '#F2F2EF'}}>
                      <span style={{fontSize:11,fontWeight:700,color: r.error ? '#E83C3C' : '#1A1A1A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.filename}</span>
                      {!r.error && <span style={{fontSize:10,color:'#ADADAD',flexShrink:0,marginLeft:8}}>{(r.markdown?.length ?? 0).toLocaleString()} chars</span>}
                    </div>

                    {r.error ? (
                      <div style={{padding:14,fontSize:12,color:'#E83C3C'}}>{r.error}</div>
                    ) : (
                      <>
                        <pre style={{
                          margin:0,padding:14,
                          fontFamily:'\'Courier New\', Courier, monospace',
                          fontSize:11,lineHeight:1.7,color:'#1A1A1A',
                          overflowY:'auto',whiteSpace:'pre-wrap',wordBreak:'break-word',
                          maxHeight:'40vh',
                        }}>
                          {r.markdown}
                        </pre>
                        <div style={{display:'flex',gap:8,padding:'8px 14px',borderTop:'1px solid #E2E2DC'}}>
                          <button onClick={() => handleCopyOne(i)} style={btnStyle(copiedIndex===i?'#2DC07A':'#F2F2EF', copiedIndex===i?'white':'#1A1A1A')}>
                            {copiedIndex===i ? '✔ Copied' : '⎘ Copy'}
                          </button>
                          <button onClick={() => handleDownloadOne(r)} style={btnStyle('#5170FF','white')}>
                            ↓ Download .md
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
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
