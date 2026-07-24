import React, { useState, useEffect } from 'react'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { isLikelyEU } from '@/lib/geo'

interface LockedChartOverlayProps {
  userId?: string
  userEmail?: string
  onSuccess?: () => void
}

export default function LockedChartOverlay({ userId, userEmail, onSuccess }: LockedChartOverlayProps) {
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
        position: 'absolute',
        inset: 0,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        backgroundColor: 'rgba(250, 250, 248, 0.75)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        zIndex: 10,
      }}
    >
      {/* Headline */}
      <p
        style={{
          fontFamily: 'EB Garamond, Georgia, serif',
          fontSize: '17px',
          fontWeight: 600,
          color: '#1A1A1A',
          margin: 0,
          textAlign: 'center',
        }}
      >
        30-day history is a Pro feature
      </p>

      {/* Sub-text */}
      <p
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          color: '#6B6B6B',
          margin: 0,
          textAlign: 'center',
          maxWidth: '220px',
          lineHeight: '1.5',
        }}
      >
        See your full usage trends, ChatGPT tracking, and weekly email digests.
      </p>

      {/* Upgrade CTA */}
      {isEU ? (
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          fontWeight: 600,
          color: '#E83C3C',
          textAlign: 'center',
          marginTop: '4px'
        }}>
          Pro is not currently available in the EU.
        </div>
      ) : (
        <button
          onClick={handleUpgrade}
          style={{
            display: 'inline-block',
            marginTop: '4px',
            padding: '9px 22px',
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
          Upgrade to Pro — ₹299/mo
        </button>
      )}
    </div>
  )
}
