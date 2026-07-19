// src/app/reset-password/page.tsx
// Route: /reset-password
//
// This is where Supabase's password-reset email link lands. The link
// carries a temporary recovery session in the URL, which the Supabase
// client picks up automatically on load (detectSessionInUrl is on by
// default). We just wait for that, then let the user set a new password
// via updatePassword() from lib/auth.ts.
//
// IMPORTANT: this route's full URL (origin + /reset-password) must be
// added to Supabase Dashboard → Authentication → URL Configuration →
// Redirect URLs, or Supabase will refuse to redirect here after the
// email link is clicked.

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthCard from '@/components/AuthCard'
import FormField from '@/components/FormField'
import SubmitButton from '@/components/SubmitButton'
import { supabase } from '@/lib/supabase'
import { updatePassword } from '@/lib/auth'

type SessionState = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [done, setDone] = useState(false)

  // Wait for Supabase to parse the recovery token from the URL and
  // establish a session. onAuthStateChange fires PASSWORD_RECOVERY when
  // that happens; we also check getSession() directly in case the event
  // already fired before this listener attached.
  useEffect(() => {
    let settled = false

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        settled = true
        setSessionState('ready')
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (settled) return
      if (data.session) {
        setSessionState('ready')
      } else {
        // Give the URL-parsing a moment before giving up — it runs
        // asynchronously on page load.
        setTimeout(() => {
          if (settled) return
          supabase.auth.getSession().then(({ data: retry }) => {
            setSessionState(retry.session ? 'ready' : 'invalid')
          })
        }, 1500)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  function validate(): string | null {
    if (!password) return 'Password is required.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    return null
  }

  async function handleSubmit() {
    setErrorMessage('')

    const validationError = validate()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setLoading(true)
    const result = await updatePassword(password)
    setLoading(false)

    if (!result.success) {
      setErrorMessage(result.error)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/login'), 2000)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  if (sessionState === 'checking') {
    return (
      <AuthCard title="Verifying link" subtitle="">
        <p style={styles.message}>One moment…</p>
      </AuthCard>
    )
  }

  if (sessionState === 'invalid') {
    return (
      <AuthCard title="Link expired" subtitle="">
        <p style={styles.message}>
          This reset link is invalid or has expired. Request a new one from
          the login page.
        </p>
        <p style={styles.switchLink}>
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="">
        <p style={styles.message}>
          Your password has been changed. Redirecting you to login…
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your account">
      {errorMessage && <div style={styles.formError}>{errorMessage}</div>}

      <div onKeyDown={handleKeyDown}>
        <FormField
          id="password"
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Min. 8 characters"
          disabled={loading}
          autoComplete="new-password"
        />

        <FormField
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repeat your password"
          disabled={loading}
          autoComplete="new-password"
        />
      </div>

      <SubmitButton
        label="Update password"
        loadingLabel="Updating…"
        loading={loading}
        onClick={handleSubmit}
      />
    </AuthCard>
  )
}

const styles: Record<string, React.CSSProperties> = {
  formError: {
    background: 'rgba(232,60,60,0.06)',
    border: '1px solid rgba(232,60,60,0.3)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--red)',
    marginBottom: '20px',
  },
  message: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    lineHeight: 1.6,
  },
  switchLink: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
}
