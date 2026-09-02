import { NextResponse } from 'next/server'
import { camperSmsPhones } from '../../../lib/camper-sms'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const camperId = String(body.camperId || '').trim()
  if (!camperId) return NextResponse.json({ error: 'Choose a camper first.' }, { status: 400 })

  const { data: camper, error: camperError } = await context.admin
    .from('campers')
    .select('id,phone,alternate_phone,second_profile_phone,sms_opt_in')
    .eq('id', camperId)
    .single()

  if (camperError || !camper) {
    return NextResponse.json({ error: camperError?.message || 'Camper not found.' }, { status: 404 })
  }
  if (!camper.sms_opt_in) return NextResponse.json({ success: true, added: 0, active: 0 })

  const phones = camperSmsPhones(camper)
  if (!phones.length) return NextResponse.json({ success: true, added: 0, active: 0 })

  const { data: existing, error: existingError } = await context.admin
    .from('sms_phone_consents')
    .select('phone_number,opted_in')
    .eq('camper_id', camper.id)
    .in('phone_number', phones)

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const existingPhones = new Set((existing || []).map((row: any) => String(row.phone_number)))
  const missingPhones = phones.filter((phone) => !existingPhones.has(phone))

  if (missingPhones.length) {
    const now = new Date().toISOString()
    const { error: insertError } = await context.admin
      .from('sms_phone_consents')
      .insert(missingPhones.map((phone) => ({
        camper_id: camper.id,
        phone_number: phone,
        opted_in: true,
        opted_in_at: now,
        opted_out_at: null,
        source: 'admin-profile-auto-enroll',
        updated_at: now,
      })))

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const active = (existing || []).filter((row: any) => row.opted_in === true).length + missingPhones.length
  return NextResponse.json({ success: true, added: missingPhones.length, active })
}
