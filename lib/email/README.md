# Email System Documentation

This directory contains the email notification system for StayInformed.ca, powered by [Resend](https://resend.com).

## Setup & Configuration

### 1. Domain Verification in Resend Dashboard

**IMPORTANT:** Before sending emails, you must verify your domain in the Resend dashboard.

**Note:** We use the subdomain `updates.stayinformed.ca` instead of the main domain `stayinformed.ca` to:
- Preserve the main domain's reputation for marketing/transactional emails
- Isolate email sending reputation from the main domain
- Follow email best practices for bulk email delivery

#### Steps to Verify Domain:

1. **Log in to Resend Dashboard**
   - Go to https://resend.com/login
   - Sign in with your Resend account

2. **Navigate to Domains**
   - Click on "Domains" in the sidebar
   - Click "Add Domain"

3. **Add Your Domain**
   - Enter `updates.stayinformed.ca` (we use a subdomain to preserve the main domain reputation)
   - Resend will provide DNS records to add

4. **Add DNS Records**
   - You'll need to add these DNS records to your domain registrar (e.g., Cloudflare, Namecheap):
     - **SPF Record** (TXT)
     - **DKIM Record** (TXT)
     - **DMARC Record** (TXT)
     - **Return-Path Record** (CNAME)

5. **Wait for Verification**
   - DNS propagation can take up to 24-48 hours
   - Resend will automatically verify once DNS records are detected

6. **Verify Status**
   - Check the domain status in Resend dashboard
   - Status should show as "Verified" (green checkmark)

### 2. Environment Variables

Add these environment variables to your `.env.local` (development) and Vercel/Railway (production):

```bash
# Resend Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Your Resend API key
RESEND_FROM_EMAIL=StayInformed <noreply@updates.stayinformed.ca>  # Optional: Override default from email
RESEND_REPLY_TO=support@stayinformed.ca  # Optional: Override default reply-to
RESEND_DOMAIN=updates.stayinformed.ca  # Optional: Override default domain
```

**Getting Your API Key:**
1. Go to https://resend.com/api-keys
2. Click "Create API Key"
3. Give it a name (e.g., "Production" or "Development")
4. Copy the key (starts with `re_`)
5. Store it securely - you won't be able to see it again

### 3. Testing Email Configuration

You can test the email configuration by running:

```bash
npm run test:email  # If we add a test script
```

Or create a test script in `scripts/test-email.ts` to send a test email.

## Email Features

### Weekly Digest Emails
- Sent every Friday at 9 AM EST
- Contains summary of followed MPs' activities from the past 7 days
- Includes new votes, bills, expenses, and petitions
- Links to view full details on the platform

### Unsubscribe Links
- All emails include an unsubscribe link
- Users can manage email preferences in account settings
- Unsubscribe is per-MP subscription (users can unsubscribe from specific MPs)

## File Structure

```
lib/email/
├── README.md           # This file
├── resend-client.ts    # Resend client initialization
├── weekly-digest.ts    # Weekly digest email generator (TODO)
└── templates/          # Email templates (TODO)
    ├── weekly-digest.html
    └── weekly-digest.txt
```

## Security & Best Practices

1. **Never commit API keys** - Always use environment variables
2. **Use verified domains** - Only send from verified domains to avoid spam
3. **Handle bounces** - Set up webhook endpoints to handle email bounces and complaints
4. **Rate limiting** - Resend free tier: 3,000 emails/month, 100 emails/day
5. **Email validation** - Validate email addresses before sending

## Troubleshooting

### "Domain not verified" error
- Check domain status in Resend dashboard
- Verify DNS records are correctly configured
- Wait for DNS propagation (can take 24-48 hours)

### "Invalid API key" error
- Verify `RESEND_API_KEY` is set correctly
- Check the API key is active in Resend dashboard
- Ensure no extra spaces or quotes in the environment variable

### Emails not being received
- Check spam/junk folder
- Verify recipient email address is correct
- Check Resend dashboard for delivery status
- Review Resend logs for error messages

## Resources

- [Resend Documentation](https://resend.com/docs)
- [Resend API Reference](https://resend.com/docs/api-reference)
- [Resend Domain Setup Guide](https://resend.com/docs/dashboard/domains/introduction)

