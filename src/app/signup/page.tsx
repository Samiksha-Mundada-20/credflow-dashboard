// src/app/signup/page.tsx
// Signup page. Route: /signup
//
// Flow:
// 1. User enters email + password + checks consent
// 2. We call signUp() from lib/auth.ts
// 3. Email confirmation is OFF — user is signed in immediately
// 4. On success → redirect to /dashboard
// 5. On error → show error in form
//
// Consent checkbox is required — matches the extension's consent_given_at field.

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthCard from '@/components/AuthCard'
import FormField from '@/components/FormField'
import SubmitButton from '@/components/SubmitButton'
import { signUp } from '@/lib/auth'

export default function SignupPage() {
  const router = useRouter()

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [consent, setConsent] = useState(false)      // Must be true to proceed
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ─── Validation ─────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!email.trim()) return 'Email is required.'
    if (!email.includes('@')) return 'Enter a valid email address.'
    if (!password) return 'Password is required.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    if (!consent) return 'You must accept the privacy policy to continue.'
    return null
  }

  // ─── Submit handler ──────────────────────────────────────────────────────────
  async function handleSignUp() {
    setErrorMessage('')

    const validationError = validate()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setLoading(true)

    const result = await signUp(email, password)

    setLoading(false)

    if (!result.success) {
      setErrorMessage(result.error)
      return
    }

    // Success — go to dashboard
    router.push('/dashboard')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignUp()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <AuthCard
      title="Create your account"
      subtitle="Start tracking your Claude.ai usage limits"
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
          placeholder="Min. 8 characters"
          disabled={loading}
          autoComplete="new-password"
        />

        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repeat your password"
          disabled={loading}
          autoComplete="new-password"
        />
      </div>

      {/* Consent checkbox — required field */}
      <label style={styles.consentLabel}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={loading}
          style={styles.checkbox}
        />
        <span style={styles.consentText}>
          I agree to the{' '}
          <Link href="/privacy">Privacy Policy</Link>
          {' '}and{' '}
          <Link href="/terms">Terms of Service</Link>.
          I understand CredFlow only reads usage percentage numbers — never message content.
        </span>
      </label>

      <div style={{ marginTop: '24px' }}>
        <SubmitButton
          label="Create account"
          loadingLabel="Creating account…"
          loading={loading}
          onClick={handleSignUp}
        />
      </div>

      <p style={styles.switchLink}>
        Already have an account?{' '}
        <Link href="/login">Sign in</Link>
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
  consentLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: '2px',
    width: '15px',
    height: '15px',
    flexShrink: 0,
    accentColor: 'var(--blue)',
    cursor: 'pointer',
  },
  consentText: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  switchLink: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
}
