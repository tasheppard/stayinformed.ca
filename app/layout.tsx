import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}

