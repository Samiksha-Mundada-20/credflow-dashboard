// src/app/layout.tsx
// Root layout. Wraps every page.
// Imports global CSS and sets HTML metadata.

import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'CredFlow',
  description: 'Track your Claude.ai usage limits in real time.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
