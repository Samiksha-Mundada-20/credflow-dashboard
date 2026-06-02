// src/components/AuthCard.tsx
// The white card container used on both /login and /signup.
// Keeps the layout consistent — only the form content changes.

import React from 'react'

interface AuthCardProps {
  title: string         // e.g. "Welcome back"
  subtitle: string      // e.g. "Sign in to your CredFlow account"
  children: React.ReactNode
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div style={styles.page}>
      {/* Logo + wordmark */}
      <div style={styles.logo}>
        <span style={styles.logoMark}>✦</span>
        <span style={styles.logoText}>CredFlow</span>
      </div>

      {/* Card */}
      <div style={styles.card}>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>{subtitle}</p>
        {children}
      </div>

      {/* Footer */}
      <p style={styles.footer}>
        Your data is end-to-end private. We never read your Claude messages.
      </p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Plain object styles — no CSS modules needed for a small auth page.

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'var(--bg)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '32px',
  },
  logoMark: {
    fontSize: '22px',
    color: 'var(--gold)',
  },
  logoText: {
    fontFamily: 'var(--font-heading)',
    fontSize: '24px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: 'var(--shadow-md)',
  },
  title: {
    fontSize: '28px',
    marginBottom: '6px',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '32px',
  },
  footer: {
    marginTop: '24px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    maxWidth: '320px',
  },
}
