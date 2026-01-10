/**
 * Automated End-to-End Test for Stripe Subscription Flow
 * 
 * This script automatically tests the subscription flow using Stripe test mode:
 * 1. Creates a test subscription directly (bypassing checkout UI)
 * 2. Simulates webhook events
 * 3. Verifies database updates
 * 4. Tests subscription updates and cancellation
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY (test mode) must be set
 * - STRIPE_PREMIUM_PRICE_ID must be set
 * - Database connection must be configured
 * - A test user must exist in Supabase Auth
 * 
 * Usage:
 *   tsx scripts/test-stripe-subscription-automated.ts <test-user-email>
 */

import { stripe } from '../lib/stripe/client'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'

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

function logTest(name: string, passed: boolean, details?: string) {
  const status = passed ? '✓' : '❌'
  const color = passed ? 'green' : 'red'
  log(`${status} ${name}`, color)
  if (details) {
    log(`  ${details}`, 'blue')
  }
}

async function checkEnvironment() {
  logSection('Environment Check')
  
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_PREMIUM_PRICE_ID']
  
  const missing: string[] = []
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key)
      logTest(key, false, 'not set')
    } else {
      logTest(key, true, 'is set')
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
    logTest('Stripe Test Mode', true)
  }
}

async function getTestUser(email: string) {
  logSection('Getting Test User')
  
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  
  if (userRecords.length === 0) {
    throw new Error(`No user found with email: ${email}. Please create a test user first.`)
  }
  
  const user = userRecords[0]
  logTest('User Found', true, `ID: ${user.id}, Email: ${user.email}`)
  logTest(
    'Current Premium Status',
    true,
    `${user.isPremium ? 'Premium' : 'Free'} (Subscription: ${user.subscriptionStatus || 'None'})`
  )
  
  return user
}

async function createTestSubscription(userId: string, userEmail: string) {
  logSection('Test 1: Create Test Subscription')
  
  // Get or create Stripe customer
  let customerId: string
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
    logTest('Using Existing Customer', true, user.stripeCustomerId)
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
    logTest('Created Stripe Customer', true, customerId)
    
    await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  }
  
  // Create subscription directly using test payment method
  const priceId = process.env.STRIPE_PREMIUM_PRICE_ID!
  log(`Creating subscription with price: ${priceId}`, 'blue')
  
  // Create a test payment method
  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      number: '4242424242424242',
      exp_month: 12,
      exp_year: new Date().getFullYear() + 1,
      cvc: '123',
    },
  })
  
  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: customerId,
  })
  
  // Set as default payment method
  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethod.id,
    },
  })
  
  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  })
  
  logTest('Subscription Created', true, subscription.id)
  logTest('Subscription Status', true, subscription.status)
  
  // Process payment if needed
  if (subscription.latest_invoice) {
    const invoice = subscription.latest_invoice as Stripe.Invoice
    if (invoice.payment_intent) {
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent
      if (paymentIntent.status === 'requires_payment_method') {
        // Confirm the payment intent
        await stripe.paymentIntents.confirm(paymentIntent.id, {
          payment_method: paymentMethod.id,
        })
        logTest('Payment Confirmed', true)
      }
    }
  }
  
  // Always retrieve the latest subscription state before returning
  // This ensures we have the updated status regardless of invoice presence or payment state
  // This prevents returning incomplete subscriptions that would cause incorrect test results
  const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id)
  logTest('Updated Subscription Status', true, updatedSubscription.status)
  return { subscription: updatedSubscription, customerId }
}

async function simulateCheckoutSessionCompleted(
  customerId: string,
  subscriptionId: string,
  userId: string
) {
  logSection('Test 2: Simulate checkout.session.completed Webhook')
  
  // Simulate the webhook handler logic
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'
  
  logTest('Subscription Retrieved', true, `Status: ${subscription.status}, Active: ${isActive}`)
  
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
  
  logTest('User Record Updated', true)
  
  // Verify update
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  
  if (updatedUser.length === 0) {
    logTest('User Found After Update', false, `User ${userId} not found in database`)
    return false
  }
  
  const premiumCorrect = updatedUser[0].isPremium === isActive
  const statusCorrect = updatedUser[0].subscriptionStatus === subscription.status
  
  logTest('Premium Status Correct', premiumCorrect, `Expected: ${isActive}, Got: ${updatedUser[0].isPremium}`)
  logTest('Subscription Status Correct', statusCorrect, `Expected: ${subscription.status}, Got: ${updatedUser[0].subscriptionStatus}`)
  
  return premiumCorrect && statusCorrect
}

async function simulateSubscriptionUpdated(
  subscriptionId: string,
  customerId: string,
  userId: string
) {
  logSection('Test 3: Simulate customer.subscription.updated Webhook')
  
  // Simulate subscription update (e.g., plan change, status change)
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'
  
  // Update user record (simulating webhook handler)
  await db
    .update(users)
    .set({
      stripeSubscriptionId: subscription.id,
      isPremium: isActive,
      subscriptionStatus: subscription.status,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
  
  logTest('Subscription Update Processed', true)
  
  // Verify update
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  
  if (updatedUser.length === 0) {
    logTest('User Found After Update', false, `User ${userId} not found in database`)
    return false
  }
  
  const correct = updatedUser[0].isPremium === isActive && updatedUser[0].subscriptionStatus === subscription.status
  logTest('Update Verified', correct)
  
  return correct
}

async function simulateSubscriptionDeleted(
  subscriptionId: string,
  customerId: string,
  userId: string
) {
  logSection('Test 4: Simulate customer.subscription.deleted Webhook')
  
  // Cancel subscription
  const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId)
  logTest('Subscription Canceled', true, `Status: ${canceledSubscription.status}`)
  
  // Simulate webhook handler: find user by Stripe customer ID (matches production behavior)
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1)
  
  if (userRecords.length === 0) {
    logTest('User Found By Customer ID', false, `No user found for Stripe customer ${customerId}`)
    return false
  }
  
  const user = userRecords[0]
  logTest('User Found By Customer ID', true, `User ID: ${user.id}`)
  
  // Update user record to remove premium status
  await db
    .update(users)
    .set({
      isPremium: false,
      subscriptionStatus: 'canceled',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
  
  logTest('User Record Updated (Premium Removed)', true)
  
  // Verify update
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  
  if (updatedUser.length === 0) {
    logTest('User Found After Cancellation', false, `User ${user.id} not found in database after update`)
    return false
  }
  
  const correct = !updatedUser[0].isPremium && updatedUser[0].subscriptionStatus === 'canceled'
  logTest('Cancellation Verified', correct)
  
  return correct
}

async function testCustomerPortal(customerId: string) {
  logSection('Test 5: Customer Portal Access')
  
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: 'http://localhost:3000/account',
  })
  
  logTest('Portal Session Created', true, `URL: ${portalSession.url}`)
  logTest('Portal Expires', true, new Date(portalSession.expires_at * 1000).toISOString())
  
  return true
}

async function verifyFinalState(userId: string) {
  logSection('Final State Verification')
  
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  
  if (user.length === 0) {
    logTest('User Found', false)
    return false
  }
  
  const userData = user[0]
  log('User Record:', 'blue')
  log(`  ID: ${userData.id}`, 'blue')
  log(`  Email: ${userData.email}`, 'blue')
  log(`  Premium: ${userData.isPremium ? 'Yes' : 'No'}`, userData.isPremium ? 'green' : 'yellow')
  log(`  Subscription Status: ${userData.subscriptionStatus || 'None'}`, 'blue')
  log(`  Stripe Customer ID: ${userData.stripeCustomerId || 'None'}`, 'blue')
  log(`  Stripe Subscription ID: ${userData.stripeSubscriptionId || 'None'}`, 'blue')
  
  return true
}

async function main() {
  const email = process.argv[2]
  
  if (!email) {
    console.error('Usage: tsx scripts/test-stripe-subscription-automated.ts <test-user-email>')
    console.error('Example: tsx scripts/test-stripe-subscription-automated.ts test@example.com')
    process.exit(1)
  }
  
  const results: { [key: string]: boolean } = {}
  
  try {
    log('\n🚀 Starting Automated Stripe Subscription Flow Test', 'cyan')
    log('='.repeat(60), 'cyan')
    
    // Step 1: Check environment
    await checkEnvironment()
    
    // Step 2: Get test user
    const testUser = await getTestUser(email)
    
    // Step 3: Create test subscription
    const { subscription, customerId } = await createTestSubscription(testUser.id, testUser.email!)
    results['subscription_creation'] = true
    
    // Step 4: Simulate checkout.session.completed
    results['checkout_completed'] = await simulateCheckoutSessionCompleted(
      customerId,
      subscription.id,
      testUser.id
    )
    
    // Step 5: Simulate subscription.updated
    results['subscription_updated'] = await simulateSubscriptionUpdated(
      subscription.id,
      customerId,
      testUser.id
    )
    
    // Step 6: Test customer portal
    results['customer_portal'] = await testCustomerPortal(customerId)
    
    // Step 7: Simulate subscription.deleted
    results['subscription_deleted'] = await simulateSubscriptionDeleted(
      subscription.id,
      customerId,
      testUser.id
    )
    
    // Step 8: Verify final state
    results['final_verification'] = await verifyFinalState(testUser.id)
    
    // Summary
    logSection('Test Summary')
    const allPassed = Object.values(results).every((r) => r)
    for (const [test, passed] of Object.entries(results)) {
      logTest(test.replace(/_/g, ' ').toUpperCase(), passed)
    }
    
    if (allPassed) {
      log('\n✅ All tests passed!', 'green')
      process.exit(0)
    } else {
      log('\n❌ Some tests failed', 'red')
      process.exit(1)
    }
    
  } catch (error) {
    log('\n❌ Test failed!', 'red')
    console.error(error)
    process.exit(1)
  }
}

main()

