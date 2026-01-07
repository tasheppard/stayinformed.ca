import Stripe from 'stripe'

let _stripe: Stripe | null = null

/**
 * Get Stripe client instance (lazy initialization)
 * Only checks for STRIPE_SECRET_KEY when actually used, not at import time
 * This allows the module to be imported during build without throwing errors
 */
function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    })
  }

  return _stripe
}

// Create a Proxy that lazily initializes the Stripe client on first access
// This allows the module to be imported during build without connecting to Stripe
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, _receiver) {
    const stripeInstance = getStripe()
    const value = stripeInstance[prop as keyof Stripe]
    // If it's a function, bind it to the stripe instance
    if (typeof value === 'function') {
      return value.bind(stripeInstance)
    }
    return value
  },
})

// Premium subscription product ID (set after creating product in Stripe)
export const PREMIUM_PRODUCT_NAME = 'StayInformed.ca Premium'
export const PREMIUM_PRICE_AMOUNT = 499 // $4.99 in cents
export const PREMIUM_PRICE_CURRENCY = 'cad' // Canadian dollars

