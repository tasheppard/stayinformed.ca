import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Email is required for Stripe subscriptions and our database schema
    if (!user.email) {
      return NextResponse.json(
        { error: 'Email address is required to create a subscription. Please add an email to your account.' },
        { status: 400 }
      )
    }

    // Get or create Stripe customer
    // Use atomic database operations to prevent race conditions:
    // 1. Try to get existing customer ID
    // 2. If not found, create Stripe customer
    // 3. Use atomic UPDATE with WHERE stripe_customer_id IS NULL to prevent overwrites
    // 4. Use INSERT ... ON CONFLICT for new users
    
    let userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    let customerId: string
    if (userRecord.length > 0 && userRecord[0].stripeCustomerId) {
      customerId = userRecord[0].stripeCustomerId
    } else {
      // Create Stripe customer first
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = customer.id

      if (userRecord.length > 0) {
        // User exists - use atomic UPDATE with WHERE clause to only update if customer_id is NULL
        // This prevents race conditions: if another request already set it, this update does nothing
        const updateResult = await db.execute(sql`
          UPDATE users
          SET stripe_customer_id = ${customerId},
              updated_at = NOW()
          WHERE id = ${user.id}
            AND stripe_customer_id IS NULL
        `)
        
        // Check if update actually happened (another request may have set it first)
        const recheck = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
        
        if (recheck.length > 0 && recheck[0].stripeCustomerId && recheck[0].stripeCustomerId !== customerId) {
          // Another request already set a different customer ID
          // Use the existing one (the one we created will be orphaned, but that's acceptable)
          console.warn(`Race condition: User ${user.id} already has customer ${recheck[0].stripeCustomerId}, created ${customerId}`)
          customerId = recheck[0].stripeCustomerId
        }
      } else {
        // User doesn't exist - use INSERT ... ON CONFLICT to handle race conditions
        // If user was created by another request, use their customer ID if set, otherwise use ours
        await db.execute(sql`
          INSERT INTO users (id, email, stripe_customer_id, created_at, updated_at)
          VALUES (${user.id}, ${user.email}, ${customerId}, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE
          SET stripe_customer_id = COALESCE(users.stripe_customer_id, EXCLUDED.stripe_customer_id),
              updated_at = NOW()
        `)
        
        // Get the final customer ID (may have been set by conflict resolution)
        const finalCheck = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1)
        
        if (finalCheck.length > 0 && finalCheck[0].stripeCustomerId) {
          customerId = finalCheck[0].stripeCustomerId
        }
      }
    }

    // Get price ID from environment variable
    const priceId = process.env.STRIPE_PREMIUM_PRICE_ID
    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe price ID not configured. Please run setup-stripe script.' },
        { status: 500 }
      )
    }

    // Create checkout session
    const origin = request.headers.get('origin') || 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe?canceled=true`,
      metadata: {
        supabase_user_id: user.id,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

