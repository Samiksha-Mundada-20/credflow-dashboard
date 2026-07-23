// src/app/login/page.tsx
// Login page. Route: /login
//
// Flow:
// 1. User enters email + password
// 2. We call signIn() from lib/auth.ts
// 3. On success → redirect to /dashboard
// 4. On error → show error message in the form (never in an alert())

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthCard from '@/components/AuthCard'
import FormField from '@/components/FormField'
import SubmitButton from '@/components/SubmitButton'
import { signIn } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  function validate(): string | null {
    if (!email.trim()) return 'Email is required.'
    
    // Strict email format validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email.trim())) {
      return 'Enter a valid email address.'
    }

    if (!password) return 'Password is required.'
    return null
  }

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

    router.push('/dashboard')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignIn()
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your CredFlow account"
    >
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

      <p style={styles.forgotLink}>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>

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
  forgotLink: {
    textAlign: 'right',
    fontSize: '12px',
    marginBottom: '16px',
    marginTop: '-8px',
  },
  switchLink: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
}
