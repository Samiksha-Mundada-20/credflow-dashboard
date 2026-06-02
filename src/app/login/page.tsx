// src/app/login/page.tsx
// Login page. Route: /login
//
// Flow:
// 1. User enters email + password
// 2. We call signIn() from lib/auth.ts
// 3. On success → redirect to /dashboard
// 4. On error → show error message in the form (never in an alert())

'use client'   // This page uses React state — must be a Client Component

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthCard from '@/components/AuthCard'
import FormField from '@/components/FormField'
import SubmitButton from '@/components/SubmitButton'
import { signIn } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')   // Form-level error

  // ─── Validation ─────────────────────────────────────────────────────────────
  // Simple client-side checks before hitting Supabase.
  function validate(): string | null {
    if (!email.trim()) return 'Email is required.'
    if (!email.includes('@')) return 'Enter a valid email address.'
    if (!password) return 'Password is required.'
    return null
  }

  // ─── Submit handler ──────────────────────────────────────────────────────────
  async function handleSignIn() {
    setErrorMessage('')

    const validationError = validate()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setLoading(true)

    const result = await signIn(email, password)

    setLoading(false)

    if (!result.success) {
      // Supabase returns "Invalid login credentials" for wrong email/password.
      // We show it as-is — it's already user-friendly.
      setErrorMessage(result.error)
      return
    }

    // Success — go to dashboard
    router.push('/dashboard')
  }

  // Allow Enter key to submit from any field
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignIn()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your CredFlow account"
    >
      {/* Form-level error (not tied to a specific field) */}
      {errorMessage && (
        <div style={styles.formError}>
          {errorMessage}
        </div>
      )}

      <div onKeyDown={handleKeyDown}>
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          disabled={loading}
          autoComplete="email"
        />

        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          disabled={loading}
          autoComplete="current-password"
        />
      </div>

      <SubmitButton
        label="Sign in"
        loadingLabel="Signing in…"
        loading={loading}
        onClick={handleSignIn}
      />

      <p style={styles.switchLink}>
        Don&apos;t have an account?{' '}
        <Link href="/signup">Create one</Link>
      </p>
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
  switchLink: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
}
