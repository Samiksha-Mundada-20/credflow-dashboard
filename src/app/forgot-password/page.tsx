// src/app/forgot-password/page.tsx
// Route: /forgot-password
//
// Flow:
// 1. User enters their email
// 2. We call requestPasswordReset() from lib/auth.ts
// 3. Show a generic success message regardless of whether the email
//    exists — Supabase itself doesn't reveal this, so we don't either.

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import AuthCard from '@/components/AuthCard'
import FormField from '@/components/FormField'
import SubmitButton from '@/components/SubmitButton'
import { requestPasswordReset } from '@/lib/auth'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [sent, setSent] = useState(false)

  function validate(): string | null {
    if (!email.trim()) return 'Email is required.'
    if (!email.includes('@')) return 'Enter a valid email address.'
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
    const result = await requestPasswordReset(email)
    setLoading(false)

    if (!result.success) {
      setErrorMessage(result.error)
      return
    }

    setSent(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="">
        <p style={styles.confirmation}>
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          password reset link. Click the link in that email to set a new
          password.
        </p>
        <p style={styles.switchLink}>
          <Link href="/login">Back to login</Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      {errorMessage && <div style={styles.formError}>{errorMessage}</div>}

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
      </div>

      <SubmitButton
        label="Send reset link"
        loadingLabel="Sending…"
        loading={loading}
        onClick={handleSubmit}
      />

      <p style={styles.switchLink}>
        <Link href="/login">Back to login</Link>
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
  confirmation: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    lineHeight: 1.6,
    marginBottom: '24px',
  },
  switchLink: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
}
