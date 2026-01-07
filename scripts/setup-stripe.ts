#!/usr/bin/env tsx
/**
 * Script to create Stripe product and price for Premium subscription
 * Run this once to set up the Stripe product and pricing
 */

import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })
// Also try loading from .env if .env.local doesn't have STRIPE_SECRET_KEY
if (!process.env.STRIPE_SECRET_KEY) {
  dotenv.config({ path: '.env' })
}

// Import Stripe client - safe to use regular import now since it uses lazy initialization
import { stripe, PREMIUM_PRODUCT_NAME, PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_CURRENCY } from '../lib/stripe/client.js'

async function setupStripe() {
  console.log('🔧 Setting up Stripe product and pricing...\n')

  try {
    // Check if product already exists
    const existingProducts = await stripe.products.search({
      query: `name:'${PREMIUM_PRODUCT_NAME}' AND active:'true'`,
    })

    let product
    if (existingProducts.data.length > 0) {
      console.log('✅ Product already exists, using existing product')
      product = existingProducts.data[0]
    } else {
      // Create product
      console.log('📦 Creating new product...')
      product = await stripe.products.create({
        name: PREMIUM_PRODUCT_NAME,
        description: 'Premium subscription to StayInformed.ca - Access historical data, detailed expenses, CSV exports, and advanced comparison tools.',
      })
      console.log(`✅ Created product: ${product.id}`)
    }

    // Check if price already exists for this product
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
    })

    const matchingPrice = existingPrices.data.find(
      (p) => p.unit_amount === PREMIUM_PRICE_AMOUNT && p.currency === PREMIUM_PRICE_CURRENCY && p.type === 'recurring'
    )

    let price
    if (matchingPrice) {
      console.log('✅ Price already exists, using existing price')
      price = matchingPrice
    } else {
      // Create price
      console.log('💰 Creating new price...')
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: PREMIUM_PRICE_AMOUNT,
        currency: PREMIUM_PRICE_CURRENCY,
        recurring: {
          interval: 'month',
        },
      })
      console.log(`✅ Created price: ${price.id}`)
    }

    console.log('\n📋 Stripe Setup Summary:')
    console.log(`   Product ID: ${product.id}`)
    console.log(`   Product Name: ${product.name}`)
    console.log(`   Price ID: ${price.id}`)
    console.log(`   Amount: $${(PREMIUM_PRICE_AMOUNT / 100).toFixed(2)} ${PREMIUM_PRICE_CURRENCY.toUpperCase()}`)
    console.log(`   Interval: Monthly`)
    console.log('\n💡 Add these to your .env.local file:')
    console.log(`   STRIPE_PREMIUM_PRICE_ID=${price.id}`)
    console.log(`   STRIPE_PREMIUM_PRODUCT_ID=${product.id}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error setting up Stripe:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
    }
    process.exit(1)
  }
}

setupStripe()

