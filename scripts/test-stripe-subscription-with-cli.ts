/**
 * End-to-End Test for Stripe Subscription Flow using Stripe CLI
 * 
 * This script tests the subscription flow using Stripe CLI to send real webhook events:
 * 1. Creates a test subscription directly
 * 2. Uses Stripe CLI to trigger real webhook events
 * 3. Verifies webhook endpoint receives and processes events correctly
 * 4. Tests subscription updates and cancellation
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY (test mode) must be set
 * - STRIPE_PREMIUM_PRICE_ID must be set
 * - STRIPE_WEBHOOK_SECRET must be set (from `stripe listen`)
 * - Database connection must be configured
 * - Next.js dev server must be running on localhost:3000
 * - Stripe CLI must be installed and running with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
 * - A test user must exist in Supabase Auth
 * 
 * Usage:
 *   1. Start Stripe CLI webhook forwarding in one terminal:
 *      stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   
 *   2. Start Next.js dev server in another terminal:
 *      npm run dev
 *   
 *   3. Run this test script:
 *      tsx scripts/test-stripe-subscription-with-cli.ts <test-user-email>
 */

import * as dotenv from 'dotenv'

// Load environment variables from .env.local (or .env if .env.local doesn't exist)
dotenv.config({ path: '.env.local' })
if (!process.env.STRIPE_SECRET_KEY) {
  dotenv.config({ path: '.env' })
}

import { stripe } from '../lib/stripe/client'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { exec } from 'child_process'
import { promisify } from 'util'
import Stripe from 'stripe'

const execAsync = promisify(exec)

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

async function checkStripeCLI(): Promise<boolean> {
  try {
    await execAsync('stripe --version')
    return true
  } catch {
    return false
  }
}

async function checkWebhookEndpoint(webhookUrl: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, { method: 'POST' })
    // 400 is expected for webhook without signature, means endpoint exists
    return response.status === 400 || response.status === 200
  } catch {
    return false
  }
}

async function checkEnvironment() {
  logSection('Environment Check')
  
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_PREMIUM_PRICE_ID', 'STRIPE_WEBHOOK_SECRET']
  
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
  
  // Check if Stripe CLI is installed
  const hasCLI = await checkStripeCLI()
  logTest('Stripe CLI Installed', hasCLI)
  
  if (!hasCLI) {
    log('⚠️  Stripe CLI not found. Install it with:', 'yellow')
    log('   brew install stripe/stripe-cli/stripe  # macOS', 'yellow')
    log('   or download from https://stripe.com/docs/stripe-cli', 'yellow')
  }
  
  // Check if webhook endpoint is accessible
  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/stripe'
  const endpointAccessible = await checkWebhookEndpoint(webhookUrl)
  logTest('Webhook Endpoint Accessible', endpointAccessible, webhookUrl)
  
  if (!endpointAccessible) {
    log('⚠️  Webhook endpoint not accessible. Make sure:', 'yellow')
    log('   1. Next.js dev server is running (npm run dev)', 'yellow')
    log('   2. Stripe CLI is forwarding webhooks:', 'yellow')
    log('      stripe listen --forward-to localhost:3000/api/webhooks/stripe', 'yellow')
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
    metadata: {
      supabase_user_id: userId,
    },
  })
  
  logTest('Subscription Created', true, subscription.id)
  logTest('Subscription Status', true, subscription.status)
  
  // Process payment if needed
  // Payment intents can have various statuses that require action:
  // - requires_payment_method: needs payment method attached and confirmed
  // - requires_confirmation: needs to be confirmed
  // - requires_action: needs 3D Secure or other authentication (can happen with test cards)
  if (subscription.latest_invoice) {
    const invoice = subscription.latest_invoice as Stripe.Invoice
    if (invoice.payment_intent) {
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent
      const status = paymentIntent.status
      
      log(`Payment Intent Status: ${status}`, 'blue')
      
      // Handle statuses that require action
      if (status === 'requires_payment_method') {
        // Attach payment method and confirm
        log('Confirming payment intent with payment method...', 'blue')
        try {
          await stripe.paymentIntents.confirm(paymentIntent.id, {
            payment_method: paymentMethod.id,
          })
          logTest('Payment Confirmed', true)
        } catch (error) {
          logTest('Payment Confirmation Failed', false, error instanceof Error ? error.message : String(error))
          throw new Error(`Failed to confirm payment intent: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else if (status === 'requires_confirmation') {
        // Confirm the payment intent (payment method already attached)
        log('Confirming payment intent...', 'blue')
        try {
          await stripe.paymentIntents.confirm(paymentIntent.id)
          logTest('Payment Confirmed', true)
        } catch (error) {
          logTest('Payment Confirmation Failed', false, error instanceof Error ? error.message : String(error))
          throw new Error(`Failed to confirm payment intent: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else if (status === 'requires_action') {
        // Payment requires 3D Secure or other authentication
        // In test mode, this can happen with certain test cards (e.g., 4000 0027 6000 3184)
        // For automated tests, we should use a card that doesn't require 3D Secure
        log('⚠️  Payment requires action (e.g., 3D Secure)', 'yellow')
        log('  This can happen with certain test cards. Using a card that bypasses 3D Secure.', 'yellow')
        log('  If this persists, check the payment method configuration.', 'yellow')
        
        // Try to confirm anyway - in test mode, some 3D Secure flows can be auto-confirmed
        try {
          await stripe.paymentIntents.confirm(paymentIntent.id, {
            payment_method: paymentMethod.id,
          })
          logTest('Payment Confirmed (3D Secure bypassed)', true)
        } catch (error) {
          logTest('Payment Requires Manual Action', false, '3D Secure authentication required - cannot be automated')
          throw new Error(`Payment requires 3D Secure authentication which cannot be automated in test script. Use a test card that doesn't require 3D Secure (e.g., 4242 4242 4242 4242)`)
        }
      } else if (status === 'succeeded') {
        // Payment already succeeded
        logTest('Payment Already Succeeded', true)
      } else if (status === 'processing') {
        // Payment is processing
        logTest('Payment Processing', true, 'Payment is being processed')
      } else if (status === 'canceled') {
        // Payment was canceled
        logTest('Payment Canceled', false, 'Payment intent was canceled')
        throw new Error('Payment intent was canceled')
      } else {
        // Unexpected status
        log(`⚠️  Unexpected payment intent status: ${status}`, 'yellow')
        log('  Payment may not complete automatically. Subscription may remain incomplete.', 'yellow')
      }
    }
  }
  
  // Always retrieve the latest subscription state
  const updatedSubscription = await stripe.subscriptions.retrieve(subscription.id)
  logTest('Updated Subscription Status', true, updatedSubscription.status)
  
  // Verify subscription is in a valid state
  if (updatedSubscription.status === 'incomplete' || updatedSubscription.status === 'incomplete_expired') {
    log('⚠️  Subscription is incomplete after payment processing', 'yellow')
    log(`  Status: ${updatedSubscription.status}`, 'yellow')
    log('  This may indicate the payment was not successfully processed.', 'yellow')
  }
  
  return { subscription: updatedSubscription, customerId }
}

async function triggerSubscriptionUpdatedWebhook(
  subscriptionId: string,
  customerId: string,
  userId: string
): Promise<boolean> {
  logSection('Test 3: Trigger customer.subscription.updated Webhook via CLI')
  
  // Update subscription to trigger the event
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  
  // Make a minor update to trigger the event
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      test_trigger: 'true',
      supabase_user_id: userId,
    },
  })
  
  log('Subscription updated (metadata changed)', 'blue')
  log('Waiting for webhook to be processed...', 'blue')
  
  // Wait for webhook
  await new Promise((resolve) => setTimeout(resolve, 2000))
  
  // Verify database
  const updatedUser = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  
  if (updatedUser.length === 0) {
    logTest('User Found After Update', false, `User ${userId} not found`)
    return false
  }
  
  const updatedSubscription = await stripe.subscriptions.retrieve(subscriptionId)
  const isActive = updatedSubscription.status === 'active' || updatedSubscription.status === 'trialing'
  
  const correct =
    updatedUser[0].isPremium === isActive &&
    updatedUser[0].subscriptionStatus === updatedSubscription.status
  
  logTest('Webhook Processed', correct)
  logTest('Premium Status Updated', updatedUser[0].isPremium === isActive)
  logTest('Subscription Status Updated', updatedUser[0].subscriptionStatus === updatedSubscription.status)
  
  return correct
}

async function triggerSubscriptionDeletedWebhook(
  subscriptionId: string,
  customerId: string,
  userId: string
): Promise<boolean> {
  logSection('Test 4: Trigger customer.subscription.deleted Webhook via CLI')
  
  // Cancel subscription to trigger the event
  const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId)
  logTest('Subscription Canceled', true, `Status: ${canceledSubscription.status}`)
  
  log('Waiting for webhook to be processed...', 'blue')
  await new Promise((resolve) => setTimeout(resolve, 2000))
  
  // Verify database
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
  const correct = !user.isPremium && user.subscriptionStatus === 'canceled'
  
  logTest('Webhook Processed', correct)
  logTest('Premium Status Removed', !user.isPremium)
  logTest('Subscription Status Set to Canceled', user.subscriptionStatus === 'canceled')
  
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
  
  // Verify final state: After cancellation, premium should be false and status should be canceled
  // This ensures the webhook properly updated the database state
  const expectedPremium = false
  const expectedStatus = 'canceled'
  
  const premiumCorrect = userData.isPremium === expectedPremium
  const statusCorrect = userData.subscriptionStatus === expectedStatus
  
  logTest('Premium Status Correct', premiumCorrect, `Expected: ${expectedPremium}, Got: ${userData.isPremium}`)
  logTest('Subscription Status Correct', statusCorrect, `Expected: ${expectedStatus}, Got: ${userData.subscriptionStatus || 'None'}`)
  
  // Return true only if both conditions are met
  return premiumCorrect && statusCorrect
}

async function main() {
  const email = process.argv[2]
  
  if (!email) {
    console.error('Usage: tsx scripts/test-stripe-subscription-with-cli.ts <test-user-email>')
    console.error('\nPrerequisites:')
    console.error('  1. Start Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe')
    console.error('  2. Start Next.js dev server: npm run dev')
    console.error('  3. Copy webhook secret from Stripe CLI to STRIPE_WEBHOOK_SECRET in .env.local')
    console.error('\nExample: tsx scripts/test-stripe-subscription-with-cli.ts test@example.com')
    process.exit(1)
  }
  
  const results: { [key: string]: boolean } = {}
  
  try {
    log('\n🚀 Starting Stripe Subscription Flow Test with Stripe CLI', 'cyan')
    log('='.repeat(60), 'cyan')
    
    // Step 1: Check environment
    await checkEnvironment()
    
    // Step 2: Get test user
    const testUser = await getTestUser(email)
    
    // Step 3: Create test subscription
    const { subscription, customerId } = await createTestSubscription(testUser.id, testUser.email!)
    
    // Verify subscription creation was successful
    // For a newly created subscription in test mode, valid statuses are:
    // - 'active': Payment succeeded, subscription is active ✅
    // - 'trialing': In trial period ✅
    // - 'past_due': Payment failed but subscription still active (valid for testing) ✅
    // Invalid statuses that indicate failure:
    // - 'incomplete': Payment failed or pending ❌
    // - 'incomplete_expired': Payment window expired ❌
    // - 'canceled': Already canceled (shouldn't happen on creation) ❌
    // - 'unpaid': Payment failed (failure state) ❌
    const validStatuses = ['active', 'trialing', 'past_due']
    const failureStatuses = ['incomplete', 'incomplete_expired', 'canceled', 'unpaid']
    const isSubscriptionValid = validStatuses.includes(subscription.status)
    const isSubscriptionFailed = failureStatuses.includes(subscription.status)
    
    if (isSubscriptionFailed) {
      log('❌ Subscription creation failed - subscription is in failure state', 'red')
      log(`  Status: ${subscription.status}`, 'red')
      log('  This indicates payment processing failed or subscription was canceled.', 'red')
      log('  Cannot continue with webhook tests.', 'red')
      results['subscription_creation'] = false
      logTest('Subscription Creation', false, `Status: ${subscription.status} - failure state`)
      throw new Error(`Subscription creation failed with status: ${subscription.status}. Payment may not have been processed successfully.`)
    } else if (!isSubscriptionValid) {
      log(`⚠️  Subscription has unexpected status: ${subscription.status}`, 'yellow')
      log('  This is not a recognized status. Continuing with tests, but results may be unreliable.', 'yellow')
      results['subscription_creation'] = false
      logTest('Subscription Creation', false, `Status: ${subscription.status} - unexpected state`)
    } else {
      results['subscription_creation'] = true
      logTest('Subscription Creation Successful', true, `Status: ${subscription.status}`)
    }
    
    // Note: checkout.session.completed webhook testing is skipped in this script.
    // This test creates subscriptions directly via Stripe API (bypassing checkout flow),
    // so checkout.session.completed webhooks are not automatically triggered.
    // To test checkout.session.completed, use the interactive test flow:
    // npm run test:stripe:flow <test-user-email>
    log('ℹ️  Note: checkout.session.completed webhook testing is skipped in this script.', 'blue')
    log('  This test creates subscriptions directly, so checkout.session.completed is not triggered.', 'blue')
    log('  To test checkout.session.completed, use the interactive test flow.', 'blue')
    
    // Step 4: Test subscription.updated webhook
    // Updating the subscription will automatically trigger customer.subscription.updated
    // event, which Stripe CLI will forward to our webhook endpoint
    log('\n⚠️  Important: Make sure Stripe CLI is forwarding webhooks!', 'yellow')
    log('  The following tests will create real Stripe events that should trigger webhooks.', 'yellow')
    log('  Watch the Stripe CLI terminal to see webhooks being forwarded.\n', 'yellow')
    
    results['subscription_updated'] = await triggerSubscriptionUpdatedWebhook(
      subscription.id,
      customerId,
      testUser.id
    )
    
    // Step 6: Test customer portal
    results['customer_portal'] = await testCustomerPortal(customerId)
    
    // Step 7: Test subscription.deleted webhook
    results['subscription_deleted'] = await triggerSubscriptionDeletedWebhook(
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
      log('\n❌ Some tests failed!', 'red')
      log('Note: checkout.session.completed requires manual webhook trigger', 'yellow')
      log('Exit code: 1 (failure)', 'red')
      process.exit(1)
    }
    
  } catch (error) {
    log('\n❌ Test failed!', 'red')
    console.error(error)
    process.exit(1)
  }
}

main()

