// src/components/FormField.tsx
// A label + input pair with optional error display.
// Used in both login and signup forms.

import React from 'react'

interface FormFieldProps {
  id: string
  label: string
  type: string                      // 'email' | 'password' | 'text'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string                    // If present, input turns red and message shows below
  disabled?: boolean
  autoComplete?: string
}

export default function FormField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  autoComplete,
}: FormFieldProps) {
  return (
    <div style={styles.wrapper}>
      <label htmlFor={id} style={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{
          ...styles.input,
          ...(error ? styles.inputError : {}),
          ...(disabled ? styles.inputDisabled : {}),
        }}
      />
      {error && <p style={styles.error}>{error}</p>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '18px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  input: {
    padding: '10px 14px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    fontSize: '15px',
    transition: 'border-color 0.15s',
    width: '100%',
  },
  inputError: {
    borderColor: 'var(--red)',
  },
  inputDisabled: {
    background: 'var(--muted)',
    color: 'var(--text-muted)',
    cursor: 'not-allowed',
  },
  error: {
    fontSize: '12px',
    color: 'var(--red)',
  },
}
