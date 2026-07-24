import React, { useState, useEffect } from 'react'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { isLikelyEU } from '@/lib/geo'

// UpgradePromptCard.tsx
// Card shown below the history chart for free users.
// Surfaces the three most compelling Pro features.

const PRO_FEATURES = [
  { icon: '📊', label: '30-day usage history' },
  { icon: '🤖', label: 'ChatGPT tracking' },
  { icon: '📬', label: 'Weekly email digest' },
]

interface UpgradePromptCardProps {
  userId?: string
  userEmail?: string
  onSuccess?: () => void
}

export default function UpgradePromptCard({ userId, userEmail, onSuccess }: UpgradePromptCardProps) {
  const [isEU, setIsEU] = useState(false)

  useEffect(() => {
    setIsEU(isLikelyEU())
  }, [])

  const handleUpgrade = () => {
    openRazorpayCheckout({
      userId,
      userEmail,
      amount: 29900,
      onSuccess: () => {
        if (onSuccess) onSuccess()
        else window.location.reload()
      },
    })
  }

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '16px 20px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E2DC',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p
          style={{
            fontFamily: 'EB Garamond, Georgia, serif',
            fontSize: '16px',
            fontWeight: 600,
            color: '#1A1A1A',
            margin: 0,
          }}
        >
          Unlock Pro
        </p>
        {!isEU && (
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
              color: '#6B6B6B',
              backgroundColor: '#F2F2EF',
              border: '1px solid #E2E2DC',
              borderRadius: '20px',
              padding: '2px 10px',
            }}
          >
            ₹299 / month
          </span>
        )}
      </div>

      {/* Feature list */}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {PRO_FEATURES.map(f => (
          <li
            key={f.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '13px',
              color: '#1A1A1A',
            }}
          >
            <span style={{ fontSize: '14px' }}>{f.icon}</span>
            {f.label}
          </li>
        ))}
      </ul>

      {/* CTA button */}
      {isEU ? (
        <div style={{
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          fontWeight: 600,
          color: '#E83C3C',
          padding: '4px 0'
        }}>
          Pro is not currently available in the EU.
        </div>
      ) : (
        <button
          onClick={handleUpgrade}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            padding: '10px 0',
            backgroundColor: '#FFCC00',
            color: '#1A1A1A',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.01em',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Upgrade to Pro
        </button>
      )}
    </div>
  )
}
