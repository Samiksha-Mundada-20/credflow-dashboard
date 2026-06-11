'use client'

// LockedChartOverlay.tsx
// Shown over the 7-day history chart for free users.
// Blurs the chart and shows an upgrade prompt.

export default function LockedChartOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        // Blur the chart beneath
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
      {/* Lock icon */}
      <div
        style={{
          width: '40px',
          height: '40px',
          backgroundColor: '#F2F2EF',
          border: '1px solid #E2E2DC',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
        }}
      >
        🔒
      </div>

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
      <a
        href="https://credflow.vercel.app/#pricing"
        target="_blank"
        rel="noreferrer"
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
          textDecoration: 'none',
          letterSpacing: '0.01em',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Upgrade to Pro — $4/mo
      </a>
    </div>
  )
}
