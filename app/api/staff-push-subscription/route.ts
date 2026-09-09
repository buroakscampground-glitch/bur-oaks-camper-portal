import { NextResponse } from 'next/server'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { staffPushPublicKey } from '../../../lib/staff-web-push'
import { canManageCommunity } from '../../../lib/staff-roles'

export const runtime = 'nodejs'

type SavedSubscription = {
  endpoint: string
  expirationTime: number | null
  keys: { p256dh: string; auth: string }
  createdAt: string
}

function isStaff(role: unknown) {
  return canManageCommunity(role)
}

function normalizeSubscription(value: any): SavedSubscription | null {
  const endpoint = String(value?.endpoint || '').trim()
  const p256dh = String(value?.keys?.p256dh || '').trim()
  const auth = String(value?.keys?.auth || '').trim()
  if (!endpoint.startsWith('https://') || endpoint.length > 2000 || !p256dh || p256dh.length > 500 || !auth || auth.length > 500) return null
  return {
    endpoint,
    expirationTime: Number.isFinite(Number(value?.expirationTime)) ? Number(value.expirationTime) : null,
    keys: { p256dh, auth },
    createdAt: new Date().toISOString(),
  }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !isStaff(context.camper.role)) return NextResponse.json({ error: 'Staff access is required.' }, { status: 401 })
  const publicKey = staffPushPublicKey()
  if (!publicKey) return NextResponse.json({ error: 'Background alerts are not configured yet.' }, { status: 503 })
  return NextResponse.json({ publicKey })
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'staff-push-subscription', 20, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many notification changes. Please wait and try again.' }, { status: 429 })
  const context = await getAuthenticatedContext(request)
  if (!context || !isStaff(context.camper.role)) return NextResponse.json({ error: 'Staff access is required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const subscription = normalizeSubscription(body.subscription)
  if (!subscription) return NextResponse.json({ error: 'This phone did not provide a valid notification subscription.' }, { status: 400 })

  const current = Array.isArray(context.user.user_metadata?.staff_push_subscriptions)
    ? context.user.user_metadata.staff_push_subscriptions.filter((item: any) => item?.endpoint && item.endpoint !== subscription.endpoint)
    : []
  const subscriptions = [...current, subscription].slice(-5)
  const { error } = await context.admin.auth.admin.updateUserById(context.user.id, {
    user_metadata: { ...(context.user.user_metadata || {}), staff_push_subscriptions: subscriptions },
  })
  if (error) return NextResponse.json({ error: 'Unable to save background alerts for this phone.' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !isStaff(context.camper.role)) return NextResponse.json({ error: 'Staff access is required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const endpoint = String(body.endpoint || '')
  const current = Array.isArray(context.user.user_metadata?.staff_push_subscriptions) ? context.user.user_metadata.staff_push_subscriptions : []
  const { error } = await context.admin.auth.admin.updateUserById(context.user.id, {
    user_metadata: { ...(context.user.user_metadata || {}), staff_push_subscriptions: current.filter((item: any) => item?.endpoint !== endpoint) },
  })
  if (error) return NextResponse.json({ error: 'Unable to turn off background alerts for this phone.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
