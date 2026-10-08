import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

const profileFields = new Set([
  'lot_number','first_name','last_name','email','secondary_email','phone','alternate_phone',
  'second_profile_first_name','second_profile_last_name','second_profile_phone',
  'mailing_address_line1','mailing_address_line2','mailing_city','mailing_state','mailing_zip','role',
  'emergency_contact_name','emergency_contact_phone','vehicle_make','vehicle_model','license_plate',
  'vehicle_2_make','vehicle_2_model','vehicle_2_license_plate','golf_cart_make','golf_cart_color',
  'directory_opt_in','directory_show_phone','sms_opt_in','sms_opt_in_at','camper_since_date','office_notes','rent_payment_plan',
])

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const camperId = String(body.camperId || '').trim()
  const reason = String(body.reason || '').trim()
  if (!camperId || reason.length < 5) return NextResponse.json({ error: 'Choose a camper and enter a clear reason.' }, { status: 400 })

  if (body.action === 'rent-terms') {
    const annualRent = body.annualRent === null || body.annualRent === '' ? null : Number(body.annualRent)
    if (annualRent !== null && (!Number.isFinite(annualRent) || annualRent < 0)) return NextResponse.json({ error: 'Enter a valid annual rent.' }, { status: 400 })
    const { data, error } = await context.admin.rpc('update_camper_rent_terms_audited', {
      p_camper_id: camperId,
      p_annual_rent: annualRent,
      p_payment_plan: body.paymentPlan === 'quarterly' ? 'quarterly' : 'semiannual',
      p_reason: reason.slice(0, 1000),
      p_actor_email: context.user.email || 'office',
    })
    if (error) return NextResponse.json({ error: ['42883','PGRST202'].includes(error.code || '') ? 'The protected rent audit update is not installed yet.' : error.message }, { status: 400 })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  }

  const incoming = body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch) ? body.patch : {}
  const patch = Object.fromEntries(Object.entries(incoming).filter(([key]) => profileFields.has(key)))
  if (!Object.keys(patch).length || Object.keys(incoming).some((key) => !profileFields.has(key))) {
    return NextResponse.json({ error: 'The profile update is empty or contains a protected field.' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('update_camper_profile_audited', {
    p_camper_id: camperId, p_patch: patch, p_reason: reason.slice(0, 1000), p_actor_email: context.user.email || 'office',
  })
  if (error) return NextResponse.json({ error: ['42883','PGRST202'].includes(error.code || '') ? 'The protected profile audit update is not installed yet.' : error.message }, { status: 400 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
