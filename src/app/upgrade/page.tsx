'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { openRazorpayCheckout } from '@/lib/razorpay'

function UpgradeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [uid, setUid] = useState('')
  const [email, setEmail] = useState('')
  const [loadingUser, setLoadingUser] = useState(true)
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function loadUser() {
      // 1. Check URL query parameters first (passed from Extension)
      const queryUid = searchParams.get('uid') || ''
      const queryEmail = searchParams.get('email') || ''

      if (queryUid && queryEmail) {
        setUid(queryUid)
        setEmail(queryEmail)
        setLoadingUser(false)
        return
      }

      // 2. Fallback: Check existing Supabase session
      try {
        const currentUser = await getUser()
        if (currentUser) {
          setUid(currentUser.id)
          setEmail(currentUser.email || '')
        }
      } catch (err) {
        console.error('Failed to get current user session:', err)
      } finally {
        setLoadingUser(false)
      }
    }

    loadUser()
  }, [searchParams])

  const handleUpgrade = () => {
    if (!uid) {
      router.push(`/login?redirectTo=${encodeURIComponent('/upgrade')}`)
      return
    }

    setErrorMsg('')
    setPaying(true)

    openRazorpayCheckout({
      userId: uid,
      userEmail: email,
      amount: 29900,
      onSuccess: () => {
        setPaying(false)
        setSuccess(true)
      },
      onCancel: () => {
        setPaying(false)
      },
      onError: (msg) => {
        setPaying(false)
        setErrorMsg(msg)
      },
    })
  }

  if (loadingUser) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#FAF9F6',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #E2E2DC',
            borderTopColor: '#4F46E5',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#6B6B6B', fontSize: '14px' }}>Verifying your session...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#FAF9F6',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Inter, sans-serif'
    }}>
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Main container */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E2DC',
        borderRadius: '16px',
        padding: '36px 32px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
        textAlign: 'center'
      }}>
        {success ? (
          <div>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#E6F9F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '32px'
            }}>
              🎉
            </div>
            <h1 style={{
              fontFamily: 'EB Garamond, Georgia, serif',
              fontSize: '28px',
              fontWeight: 500,
              color: '#1A1A1A',
              margin: '0 0 12px 0'
            }}>
              Upgrade Successful!
            </h1>
            <p style={{
              color: '#6B6B6B',
              fontSize: '15px',
              lineHeight: '1.6',
              margin: '0 0 28px 0'
            }}>
              Your account has been upgraded to <strong>CredFlow Pro</strong>. Enjoy unrestricted 30-day history, ChatGPT tracking, and weekly digests.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                width: '100%',
                padding: '12px 0',
                backgroundColor: '#4F46E5',
                color: '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#4F46E5',
              textTransform: 'uppercase',
              marginBottom: '8px'
            }}>
              CredFlow Premium
            </div>
            
            <h1 style={{
              fontFamily: 'EB Garamond, Georgia, serif',
              fontSize: '32px',
              fontWeight: 500,
              color: '#1A1A1A',
              margin: '0 0 8px 0',
            }}>
              Upgrade to Pro
            </h1>

            <p style={{
              color: '#6B6B6B',
              fontSize: '14px',
              margin: '0 0 24px 0',
              lineHeight: '1.5'
            }}>
              {email ? (
                <span>Upgrading account: <strong>{email}</strong></span>
              ) : (
                <span>Log in to complete your upgrade subscription.</span>
              )}
            </p>

            {errorMsg && (
              <div style={{
                backgroundColor: '#FDECEC',
                color: '#E83C3C',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '16px',
                textAlign: 'left'
              }}>
                {errorMsg}
              </div>
            )}

            {/* Price section */}
            <div style={{
              backgroundColor: '#FAF9F6',
              border: '1px solid #E2E2DC',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '13px', color: '#6B6B6B' }}>Billing Plan</span>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1A1A1A', marginTop: '2px' }}>Pro Monthly</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '24px', fontWeight: 700, color: '#1A1A1A' }}>₹299</span>
                <span style={{ fontSize: '13px', color: '#6B6B6B' }}>/mo</span>
              </div>
            </div>

            {/* Features list */}
            <div style={{
              textAlign: 'left',
              marginBottom: '28px'
            }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#ADADAD', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 12px 0' }}>Included Features</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { icon: '📊', text: '30-day complete usage history' },
                  { icon: '🤖', text: 'Real-time ChatGPT quota tracking' },
                  { icon: '📬', text: 'Weekly email performance digests' }
                ].map((feat, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#3A3A3A' }}>
                    <span style={{ fontSize: '16px' }}>{feat.icon}</span>
                    <span>{feat.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleUpgrade}
              disabled={paying}
              style={{
                width: '100%',
                padding: '14px 0',
                backgroundColor: '#FFCC00',
                color: '#1A1A1A',
                fontSize: '15px',
                fontWeight: 700,
                borderRadius: '8px',
                border: 'none',
                cursor: paying ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'opacity 0.15s'
              }}
              onMouseEnter={e => { if (!paying) e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={e => { if (!paying) e.currentTarget.style.opacity = '1' }}
            >
              {paying ? (
                <>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #1A1A1A',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Processing Checkout...
                </>
              ) : (
                uid ? 'Upgrade to Pro' : 'Log In to Upgrade'
              )}
            </button>

            <div style={{
              marginTop: '16px',
              fontSize: '12px',
              color: '#ADADAD'
            }}>
              Secured by Razorpay. Cancel anytime.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function UpgradePage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#FAF9F6',
        fontFamily: 'Inter, sans-serif'
      }}>
        <p style={{ color: '#6B6B6B', fontSize: '14px' }}>Loading Upgrade Page...</p>
      </div>
    }>
      <UpgradeContent />
    </Suspense>
  )
}
