import { NextResponse } from 'next/server'
import { getUserWithPremium } from '@/lib/auth/get-user-with-premium'

export async function GET() {
  const { user, isPremium } = await getUserWithPremium()

  if (!user) {
    return NextResponse.json({ isPremium: false }, { status: 401 })
  }

  return NextResponse.json({ isPremium })
}

