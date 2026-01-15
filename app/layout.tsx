import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '../lib/auth/context'
import { Navigation } from '@/components/Navigation'
import { getBaseUrl } from '@/lib/utils/site-url'

const baseUrl = getBaseUrl()

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'StayInformed.ca - Track Your MP\'s Performance',
  description:
    "Track Canadian MP performance with accountability scores, voting records, and expenses.",
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'StayInformed.ca - Track Your MP\'s Performance',
    description:
      'Find your MP and explore voting records, expenses, and accountability scores.',
    url: baseUrl,
    siteName: 'StayInformed.ca',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StayInformed.ca - Track Your MP\'s Performance',
    description:
      'Find your MP and explore voting records, expenses, and accountability scores.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navigation />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}

