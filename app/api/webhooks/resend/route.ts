import { NextRequest, NextResponse } from 'next/server'
import { resend } from '@/lib/email/resend-client'
import { db } from '@/lib/db'
import {
  emailDeliveryEvents,
  weeklyDigestSent,
  emailSubscriptions,
  users,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

type VerifiedResendWebhookEvent = ReturnType<typeof resend.webhooks.verify>

type ResendWebhookEvent = {
  id: string
  type: string
  data?: Record<string, unknown>
}

function isResendWebhookEvent(event: unknown): event is ResendWebhookEvent {
  if (!event || typeof event !== 'object') return false
  const maybeEvent = event as Record<string, unknown>
  return typeof maybeEvent.id === 'string' && typeof maybeEvent.type === 'string'
}

function getResendEmailId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  const emailId = data['email_id'] || data['id'] || data['emailId'] || data['message_id']
  return typeof emailId === 'string' ? emailId : null
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

function mapDeliveryStatus(eventType: string): string | null {
  switch (eventType) {
    case 'email.sent':
      return 'sent'
    case 'email.delivered':
      return 'delivered'
    case 'email.bounced':
      return 'bounced'
    case 'email.complained':
      return 'complained'
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET is not set')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  const payload = await request.text()
  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 })
  }

  let event: ResendWebhookEvent

  try {
    const verified = resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    })
    if (!isResendWebhookEvent(verified)) {
      console.warn('Unhandled Resend webhook event payload')
      return NextResponse.json({ received: true })
    }
    event = verified
  } catch (error) {
    console.error('Resend webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const eventType = event.type
    const eventData = event.data || {}
    const resendId = getResendEmailId(eventData)
    const email = normalizeEmail(
      eventData['to'] || eventData['email'] || eventData['recipient']
    )
    const deliveryStatus = mapDeliveryStatus(eventType)

    let userId: string | null = null
    let digestRecordId: number | null = null

    if (resendId) {
      const digestRecords = await db
        .select({
          id: weeklyDigestSent.id,
          userId: weeklyDigestSent.userId,
        })
        .from(weeklyDigestSent)
        .where(eq(weeklyDigestSent.resendId, resendId))
        .limit(1)

      if (digestRecords.length > 0) {
        digestRecordId = digestRecords[0].id
        userId = digestRecords[0].userId
      }
    }

    if (!userId && email) {
      const userRecords = await db
        .select({
          id: users.id,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)

      if (userRecords.length > 0) {
        userId = userRecords[0].id
      }
    }

    await db
      .insert(emailDeliveryEvents)
      .values({
        eventId: event.id,
        eventType,
        resendId,
        userId,
        email,
        status: deliveryStatus,
        payload: event,
      })
      .onConflictDoNothing({ target: emailDeliveryEvents.eventId })

    if (digestRecordId && deliveryStatus) {
      const updatePayload: Record<string, unknown> = {
        deliveryStatus,
        updatedAt: new Date(),
      }

      if (deliveryStatus === 'delivered') {
        updatePayload.deliveredAt = new Date()
      }
      if (deliveryStatus === 'bounced' || deliveryStatus === 'complained') {
        updatePayload.bouncedAt = new Date()
      }

      await db
        .update(weeklyDigestSent)
        .set(updatePayload)
        .where(eq(weeklyDigestSent.id, digestRecordId))
    }

    if (
      userId &&
      (deliveryStatus === 'bounced' || deliveryStatus === 'complained')
    ) {
      await db
        .update(emailSubscriptions)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(emailSubscriptions.userId, userId))
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing Resend webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
