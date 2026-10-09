import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { campgroundDate, type AccountPolicyType } from '../../../lib/account-policies'

export const runtime = 'nodejs'

const policyTypes = new Set<AccountPolicyType>([
  'billing_disabled',
  'lot_rent_exempt',
  'document_delivery_exempt',
  'billing_delegate',
  'pump_out_service_access',
])

function clean(value: unknown, max = 1000) {
  return String(value || '').trim().slice(0, max)
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const policyId = clean(body.policyId, 80) || null
  const policyType = clean(body.policyType, 80) as AccountPolicyType
  const camperId = clean(body.camperId, 80) || null
  const lotNumber = clean(body.lotNumber, 80) || null
  const subjectEmail = clean(body.subjectEmail, 320).toLowerCase() || null
  const relatedLotNumber = clean(body.relatedLotNumber, 80) || null
  const reason = clean(body.reason)
  const effectiveOn = clean(body.effectiveOn, 10) || campgroundDate()
  const expiresOn = clean(body.expiresOn, 10) || null
  const active = body.active !== false

  if (!policyTypes.has(policyType)) return NextResponse.json({ error: 'Choose a supported account policy.' }, { status: 400 })
  if (reason.length < 5) return NextResponse.json({ error: 'Enter a clear reason of at least five characters.' }, { status: 400 })
  if (!validDate(effectiveOn) || (expiresOn && !validDate(expiresOn)) || (expiresOn && expiresOn < effectiveOn)) {
    return NextResponse.json({ error: 'Choose a valid effective and expiration date.' }, { status: 400 })
  }
  if (!camperId && !lotNumber && !subjectEmail) return NextResponse.json({ error: 'The policy must identify a camper, campsite, or authorized email.' }, { status: 400 })
  if (policyType === 'billing_delegate' && (!subjectEmail || !lotNumber)) {
    return NextResponse.json({ error: 'Authorized billing access requires an email and campsite.' }, { status: 400 })
  }
  if (policyType === 'pump_out_service_access' && (!subjectEmail || !lotNumber || !relatedLotNumber)) {
    return NextResponse.json({ error: 'Additional pump-out access requires an email, billing site, and service site.' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('set_camper_account_policy_atomic', {
    p_policy_id: policyId,
    p_policy_type: policyType,
    p_camper_id: camperId,
    p_lot_number: lotNumber,
    p_subject_email: subjectEmail,
    p_related_lot_number: relatedLotNumber,
    p_reason: reason,
    p_effective_on: effectiveOn,
    p_expires_on: expiresOn,
    p_active: active,
    p_actor: context.user.email,
  })

  if (error) return NextResponse.json({ error: 'The account policy could not be saved. No change was made.' }, { status: 500 })
  return NextResponse.json({ success: true, policy: data })
}
