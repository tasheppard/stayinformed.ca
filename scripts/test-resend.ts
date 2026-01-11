#!/usr/bin/env tsx
/**
 * Test script to verify Resend email configuration
 * 
 * Usage:
 *   npm run test:resend
 * 
 * Or directly:
 *   tsx scripts/test-resend.ts
 */

import * as dotenv from 'dotenv'

// Load environment variables FIRST before importing modules that depend on them
dotenv.config({ path: '.env.local' })
// Also try loading from .env if .env.local doesn't have RESEND_API_KEY
if (!process.env.RESEND_API_KEY) {
  dotenv.config({ path: '.env' })
}

// Import Resend client after environment variables are loaded
import { resend, EMAIL_CONFIG } from '../lib/email/resend-client.js'

async function testResend() {
  console.log('🧪 Testing Resend Email Configuration...\n')

  // Check environment variables
  console.log('📋 Configuration:')
  console.log(`  From: ${EMAIL_CONFIG.from}`)
  console.log(`  Reply-To: ${EMAIL_CONFIG.replyTo}`)
  console.log(`  Domain: ${EMAIL_CONFIG.domain}`)
  console.log(`  API Key: ${process.env.RESEND_API_KEY ? '✓ Set' : '✗ Missing'}\n`)

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY environment variable is not set')
    console.error('   Please add it to your .env.local file')
    process.exit(1)
  }

  // Test email address - use your own email for testing
  const testEmail = process.env.TEST_EMAIL || 'test@example.com'

  if (testEmail === 'test@example.com') {
    console.warn('⚠️  Using default test email (test@example.com)')
    console.warn('   Set TEST_EMAIL environment variable to use your email\n')
  }

  try {
    console.log(`📧 Sending test email to: ${testEmail}`)
    
    const { data, error } = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: testEmail,
      subject: 'Test Email from StayInformed.ca',
      html: `
        <h1>Hello from StayInformed.ca!</h1>
        <p>This is a test email to verify your Resend configuration.</p>
        <p>If you received this email, your Resend setup is working correctly! ✅</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          Configuration Details:<br>
          From: ${EMAIL_CONFIG.from}<br>
          Domain: ${EMAIL_CONFIG.domain}<br>
          Timestamp: ${new Date().toISOString()}
        </p>
      `,
      text: `
Hello from StayInformed.ca!

This is a test email to verify your Resend configuration.

If you received this email, your Resend setup is working correctly! ✅

Configuration Details:
From: ${EMAIL_CONFIG.from}
Domain: ${EMAIL_CONFIG.domain}
Timestamp: ${new Date().toISOString()}
      `,
    })

    if (error) {
      console.error('❌ Error sending email:', error)
      process.exit(1)
    }

    console.log('✅ Email sent successfully!')
    console.log(`   Email ID: ${data?.id}`)
    console.log(`\n📬 Check your inbox at: ${testEmail}`)
    console.log('   (Also check spam/junk folder if not received)')
  } catch (error) {
    console.error('❌ Failed to send email:', error)
    if (error instanceof Error) {
      console.error('   Error message:', error.message)
    }
    process.exit(1)
  }
}

testResend().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})

