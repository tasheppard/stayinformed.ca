import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'

/**
 * Safely extract customer ID from Stripe objects
 * The customer field can be either a string ID or an expanded Customer object
 */
function getCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!customer) {
    return null
  }
  
  if (typeof customer === 'string') {
    return customer
  }
  
  // If it's an object (expanded Customer), extract the ID
  if (typeof customer === 'object' && 'id' in customer) {
    return customer.id
  }
  
  return null
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutSessionCompleted(session)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdate(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    // Always return 200 to acknowledge receipt
    // Stripe will retry if we return 5xx, which can cause duplicate processing
    return NextResponse.json({ received: true })
  } catch (error) {
    // Log error for debugging but still return 200 to prevent Stripe retries
    // This prevents duplicate event processing and subscription state inconsistencies
    console.error('Error processing webhook:', error)
    console.error('Event ID:', event.id)
    console.error('Event type:', event.type)
    
    // TODO: Consider storing failed events in a separate table for manual review
    // For now, we log and acknowledge receipt to prevent retries
    
    // Always return 200 to acknowledge webhook receipt
    // Even if processing failed, we don't want Stripe to retry
    return NextResponse.json({ received: true })
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const customerId = getCustomerId(session.customer)
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null
  const userId = session.metadata?.supabase_user_id

  if (!userId) {
    console.error('No supabase_user_id in session metadata')
    return
  }

  if (!customerId) {
    console.error('No customer ID found in checkout session')
    return
  }

  // Handle case where subscription is not yet created (e.g., payment pending)
  // The subscription will be created later, and we'll handle it via customer.subscription.created event
  if (!subscriptionId) {
    console.log('Checkout session completed but no subscription ID yet. Customer ID:', customerId)
    // Still update customer ID for future reference
    await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    return
  }

  // Get subscription to check status
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'

  // Update user record
  await db
    .update(users)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      isPremium: isActive,
      subscriptionStatus: subscription.status,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = getCustomerId(subscription.customer)

  if (!customerId) {
    console.error('No customer ID found in subscription object')
    return
  }

  // Find user by Stripe customer ID
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1)

  if (userRecords.length === 0) {
    console.error(`No user found for Stripe customer ${customerId}`)
    return
  }

  const user = userRecords[0]
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'

  // Update user record
  await db
    .update(users)
    .set({
      stripeSubscriptionId: subscription.id,
      isPremium: isActive,
      subscriptionStatus: subscription.status,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = getCustomerId(subscription.customer)

  if (!customerId) {
    console.error('No customer ID found in subscription object')
    return
  }

  // Find user by Stripe customer ID
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1)

  if (userRecords.length === 0) {
    console.error(`No user found for Stripe customer ${customerId}`)
    return
  }

  const user = userRecords[0]

  // Update user record to remove premium status
  await db
    .update(users)
    .set({
      isPremium: false,
      subscriptionStatus: 'canceled',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
}

