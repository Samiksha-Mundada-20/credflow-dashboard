// src/components/SubmitButton.tsx
// A full-width button that shows a spinner when loading is true.
// Used in login and signup forms.

import React from 'react'

interface SubmitButtonProps {
  label: string           // Text shown when not loading
  loadingLabel: string    // Text shown when loading
  loading: boolean
  disabled?: boolean
  onClick: () => void
}

export default function SubmitButton({
  label,
  loadingLabel,
  loading,
  disabled,
  onClick,
}: SubmitButtonProps) {
  const isDisabled = loading || disabled

  return (
    <button
      type="button"           // Never type="submit" — we handle submission in JS
      onClick={onClick}
      disabled={isDisabled}
      style={{
        ...styles.button,
        ...(isDisabled ? styles.buttonDisabled : {}),
      }}
    >
      {loading ? (
        <span style={styles.inner}>
          <span style={styles.spinner} />
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    width: '100%',
    padding: '11px 20px',
    background: 'var(--blue)',
    color: '#FFFFFF',
    borderRadius: 'var(--radius)',
    fontSize: '15px',
    fontWeight: 500,
    transition: 'background 0.15s, opacity 0.15s',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    // Note: keyframes can't go in inline styles.
    // We define the animation in globals.css and reference it by name here.
    animation: 'spin 0.7s linear infinite',
  },
}
