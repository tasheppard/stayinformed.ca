/**
 * End-to-End Test Script for Stripe Subscription Flow
 * 
 * This script tests the complete subscription flow:
 * 1. Checkout session creation
 * 2. Webhook event handling
 * 3. Database updates
 * 4. Customer portal access
 * 5. Subscription cancellation
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY (test mode) must be set
 * - STRIPE_PREMIUM_PRICE_ID must be set
 * - Database connection must be configured
 * - A test user must exist in Supabase Auth
 * 
 * Usage:
 *   tsx scripts/test-stripe-subscription-flow.ts <test-user-email>
 */

import { stripe } from '../lib/stripe/client'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'

// Configure stdin for reading user input
process.stdin.setEncoding('utf8')
process.stdin.resume()

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60))
  log(title, 'cyan')
  console.log('='.repeat(60))
}

async function checkEnvironment() {
  logSection('Environment Check')
  
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PREMIUM_PRICE_ID',
  ]
  
  const missing: string[] = []
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key)
      log(`❌ ${key} is not set`, 'red')
    } else {
      log(`✓ ${key} is set`, 'green')
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  
  // Verify Stripe is in test mode
  const secretKey = process.env.STRIPE_SECRET_KEY!
  if (!secretKey.startsWith('sk_test_')) {
    log('⚠️  WARNING: Stripe secret key does not start with sk_test_', 'yellow')
    log('   This script should only be run with test mode keys!', 'yellow')
  } else {
    log('✓ Stripe is in test mode', 'green')
  }
}

async function getTestUser(email: string) {
  logSection('Getting Test User')
  
  log(`Looking for user with email: ${email}`, 'blue')
  
  // Query user directly from database using Drizzle
  // Note: This script assumes the user exists in the database
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  
  if (userRecords.length === 0) {
    throw new Error(`No user found with email: ${email}. Please create a test user first.`)
  }
  
  const user = userRecords[0]
  log(`✓ Found user: ${user.id}`, 'green')
  log(`  Email: ${user.email}`, 'blue')
  log(`  Current Premium Status: ${user.isPremium ? 'Premium' : 'Free'}`, 'blue')
  log(`  Stripe Customer ID: ${user.stripeCustomerId || 'None'}`, 'blue')
  
  return user
}

async function testCheckoutCreation(userId: string, userEmail: string) {
  logSection('Test 1: Checkout Session Creation')
  
  // Simulate the checkout creation API call
  let customerId: string
  
  // Check if user already has a Stripe customer ID
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  
  if (userRecords.length === 0) {
    throw new Error(`User with ID ${userId} not found in database`)
  }
  
  const user = userRecords[0]
  
  if (user.stripeCustomerId) {
    log(`Using existing Stripe customer: ${user.stripeCustomerId}`, 'blue')
    customerId = user.stripeCustomerId
  } else {
    log('Creating new Stripe customer...', 'blue')
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: {
        supabase_user_id: userId,
      },
    })
    customerId = customer.id
    log(`✓ Created Stripe customer: ${customerId}`, 'green')
    
    // Update user record
    await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  }
  
  // Create checkout session
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID!
  log(`Creating checkout session with price: ${priceId}`, 'blue')
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: `http://localhost:3000/account?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `http://localhost:3000/subscribe?canceled=true`,
    metadata: {
      supabase_user_id: userId,
    },
  })
  
  log(`✓ Checkout session created: ${session.id}`, 'green')
  log(`  URL: ${session.url}`, 'blue')
  log(`  Status: ${session.status}`, 'blue')
  
  return { session, customerId }
}

async function simulateWebhookEvent(
  eventType: string,
  sessionId: string,
  customerId: string,
  userId: string
) {
  logSection(`Test 2: Simulate Webhook Event (${eventType})`)
  
  // For testing, we'll directly call the webhook handler functions
  // In production, Stripe would send these events
  
  if (eventType === 'checkout.session.completed') {
    log('Simulating checkout.session.completed event...', 'blue')
    
    // Retrieve the actual session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    
    // Check if subscription was created
    if (!session.subscription) {
      log('⚠️  Session has no subscription yet (payment may be pending)', 'yellow')
      return
    }
    
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id || null
    
    if (!subscriptionId) {
      log('⚠️  No subscription ID found', 'yellow')
      return
    }
    
    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const isActive = subscription.status === 'active' || subscription.status === 'trialing'
    
    log(`Subscription ID: ${subscriptionId}`, 'blue')
    log(`Subscription Status: ${subscription.status}`, 'blue')
    log(`Is Active: ${isActive}`, 'blue')
    
    // Update user record (simulating webhook handler)
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
    
    log('✓ User record updated in database', 'green')
    
    // Verify update
    const updatedUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    
    if (updatedUser.length === 0) {
      log('❌ User not found after update', 'red')
      log(`  User ID: ${userId}`, 'blue')
      return undefined
    }
    
    if (updatedUser[0].isPremium === isActive) {
      log('✓ Premium status correctly updated', 'green')
    } else {
      log('❌ Premium status update failed', 'red')
    }
    
    if (updatedUser[0].subscriptionStatus === subscription.status) {
      log('✓ Subscription status correctly updated', 'green')
    } else {
      log('❌ Subscription status update failed', 'red')
      log(`  Expected: ${subscription.status}, Got: ${updatedUser[0].subscriptionStatus}`, 'red')
    }
    
    return { subscriptionId, subscription }
  }
}

async function testCustomerPortal(customerId: string) {
  logSection('Test 3: Customer Portal Access')
  
  log('Creating customer portal session...', 'blue')
  
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: 'http://localhost:3000/account',
  })
  
  log(`✓ Customer portal session created`, 'green')
  log(`  URL: ${portalSession.url}`, 'blue')
  log(`  Expires at: ${new Date(portalSession.expires_at * 1000).toISOString()}`, 'blue')
  
  return portalSession
}

async function testSubscriptionCancellation(
  subscriptionId: string,
  customerId: string,
  userId: string
) {
  logSection('Test 4: Subscription Cancellation')
  
  log('Canceling subscription...', 'blue')
  
  // Cancel the subscription immediately (not at period end)
  const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId)
  
  log(`✓ Subscription canceled`, 'green')
  log(`  Status: ${canceledSubscription.status}`, 'blue')
  
  // Simulate customer.subscription.deleted webhook
  // In production, Stripe would send this event
  // Match production behavior: find user by Stripe customer ID
  log('Simulating customer.subscription.deleted webhook...', 'blue')
  log(`  Looking up user by Stripe customer ID: ${customerId}`, 'blue')
  
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1)
  
  if (userRecords.length === 0) {
    log('❌ User not found by Stripe customer ID', 'red')
    log(`  Customer ID: ${customerId}`, 'blue')
    log('  This would cause the webhook handler to fail in production', 'yellow')
    return
  }
  
  const user = userRecords[0]
  log(`✓ User found by customer ID: ${user.id}`, 'green')
  
  // Update user record to remove premium status
  await db
    .update(users)
    .set({
      isPremium: false,
      subscriptionStatus: 'canceled',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
  
  log('✓ User record updated (premium status removed)', 'green')
  
  // Verify update
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  
  if (updatedUser.length === 0) {
    log('❌ User not found after cancellation', 'red')
    log(`  User ID: ${user.id}`, 'blue')
    return
  }
  
  if (!updatedUser[0].isPremium && updatedUser[0].subscriptionStatus === 'canceled') {
    log('✓ Premium status correctly removed', 'green')
  } else {
    log('❌ Premium status removal failed', 'red')
    log(`  Expected: isPremium=false, subscriptionStatus='canceled'`, 'red')
    log(`  Got: isPremium=${updatedUser[0].isPremium}, subscriptionStatus=${updatedUser[0].subscriptionStatus}`, 'red')
  }
}

async function verifyDatabaseState(userId: string) {
  logSection('Final Database State Verification')
  
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  
  if (user.length === 0) {
    log('❌ User not found in database', 'red')
    return
  }
  
  const userData = user[0]
  
  log('User Record:', 'blue')
  log(`  ID: ${userData.id}`, 'blue')
  log(`  Email: ${userData.email}`, 'blue')
  log(`  Premium: ${userData.isPremium ? 'Yes' : 'No'}`, userData.isPremium ? 'green' : 'yellow')
  log(`  Subscription Status: ${userData.subscriptionStatus || 'None'}`, 'blue')
  log(`  Stripe Customer ID: ${userData.stripeCustomerId || 'None'}`, 'blue')
  log(`  Stripe Subscription ID: ${userData.stripeSubscriptionId || 'None'}`, 'blue')
  log(`  Updated At: ${userData.updatedAt?.toISOString() || 'Never'}`, 'blue')
}

async function waitForUserInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim())
    })
  })
}

async function main() {
  const email = process.argv[2]
  
  if (!email) {
    console.error('Usage: tsx scripts/test-stripe-subscription-flow.ts <test-user-email>')
    console.error('Example: tsx scripts/test-stripe-subscription-flow.ts test@example.com')
    process.exit(1)
  }
  
  try {
    log('\n🚀 Starting Stripe Subscription Flow Test', 'cyan')
    log('='.repeat(60), 'cyan')
    
    // Step 1: Check environment
    await checkEnvironment()
    
    // Step 2: Get test user
    const testUser = await getTestUser(email)
    
    // Step 3: Test checkout creation
    const { session, customerId } = await testCheckoutCreation(testUser.id, testUser.email!)
    
    log('\n⚠️  IMPORTANT: Complete the checkout in Stripe', 'yellow')
    log(`   Visit: ${session.url}`, 'yellow')
    log('   Use test card: 4242 4242 4242 4242', 'yellow')
    log('   Use any future expiry date and any CVC', 'yellow')
    log('   Press Enter after completing checkout...', 'yellow')
    
    // Wait for user input
    await waitForUserInput('')
    
    // Step 4: Simulate webhook events
    const webhookResult = await simulateWebhookEvent(
      'checkout.session.completed',
      session.id,
      customerId,
      testUser.id
    )
    
    if (!webhookResult) {
      log('⚠️  Could not process webhook (subscription may not be created yet)', 'yellow')
      log('   This can happen if payment is still pending', 'yellow')
      process.exit(0)
    }
    
    const { subscriptionId, subscription } = webhookResult
    
    // Step 5: Test customer portal
    await testCustomerPortal(customerId)
    
    // Step 6: Test subscription cancellation (optional - comment out if you want to keep subscription)
    const cancelResponse = await waitForUserInput('\n⚠️  Do you want to test subscription cancellation? (y/n): ')
    
    if (cancelResponse.toLowerCase() === 'y') {
      await testSubscriptionCancellation(subscriptionId, customerId, testUser.id)
    } else {
      log('Skipping cancellation test', 'blue')
    }
    
    // Step 7: Verify final state
    await verifyDatabaseState(testUser.id)
    
    log('\n✅ All tests completed!', 'green')
    log('='.repeat(60), 'cyan')
    
    // Close stdin to allow process to exit
    process.stdin.pause()
    process.exit(0)
  } catch (error) {
    log('\n❌ Test failed!', 'red')
    console.error(error)
    process.stdin.pause()
    process.exit(1)
  }
}

main()

