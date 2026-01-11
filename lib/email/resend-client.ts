import { Resend } from 'resend'

let _resend: Resend | null = null

/**
 * Get Resend client instance (lazy initialization)
 * Only checks for RESEND_API_KEY when actually used, not at import time
 * This allows the module to be imported during build without throwing errors
 */
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set')
  }

  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }

  return _resend
}

// Create a Proxy that lazily initializes the Resend client on first access
// This allows the module to be imported during build without connecting to Resend
export const resend = new Proxy({} as Resend, {
  get(_target, prop, _receiver) {
    const resendInstance = getResend()
    const value = resendInstance[prop as keyof Resend]
    // If it's a function, bind it to the resend instance
    if (typeof value === 'function') {
      return value.bind(resendInstance)
    }
    return value
  },
})

// Email configuration
export const EMAIL_CONFIG = {
  from: process.env.RESEND_FROM_EMAIL || 'StayInformed <noreply@updates.stayinformed.ca>',
  replyTo: process.env.RESEND_REPLY_TO || 'support@stayinformed.ca',
  domain: process.env.RESEND_DOMAIN || 'updates.stayinformed.ca',
} as const

