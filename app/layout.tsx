import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '../lib/auth/context'

export const metadata: Metadata = {
  title: 'StayInformed.ca - Track Your MP\'s Performance',
  description: 'The easiest way for Canadians to track their MP\'s performance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}

