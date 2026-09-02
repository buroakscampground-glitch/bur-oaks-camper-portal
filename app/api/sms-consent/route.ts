import { NextResponse } from 'next/server'
import { camperSmsPhones } from '../../../lib/camper-sms'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Choose whether text alerts are on or off.' }, { status: 400 })
  }

  const enabled = body.enabled
  const preserveExistingOptOuts = Boolean(body.preserveExistingOptOuts && context.camper.sms_opt_in)
  const phones = camperSmsPhones(context.camper)
  if (enabled && !phones.length) {
    return NextResponse.json({ error: 'Add at least one valid mobile number first.' }, { status: 400 })
  }

  if (phones.length) {
    const now = new Date().toISOString()
    let phonesToUpdate = phones

    if (enabled && preserveExistingOptOuts) {
      const { data: existing, error: existingError } = await context.admin
        .from('sms_phone_consents')
        .select('phone_number')
        .eq('camper_id', context.camper.id)
        .in('phone_number', phones)

      if (existingError) {
        return NextResponse.json({ error: 'The phone consent migration has not been installed.' }, { status: 503 })
      }

      const existingPhones = new Set((existing || []).map((row: any) => String(row.phone_number)))
      phonesToUpdate = phones.filter((phone) => !existingPhones.has(phone))
    }

    if (phonesToUpdate.length) {
      const { error: consentError } = await context.admin
        .from('sms_phone_consents')
        .upsert(phonesToUpdate.map((phone) => ({
          camper_id: context.camper.id,
          phone_number: phone,
          opted_in: enabled,
          opted_in_at: enabled ? now : null,
          opted_out_at: enabled ? null : now,
          source: 'portal',
          updated_at: now,
        })), { onConflict: 'camper_id,phone_number' })

      if (consentError) {
        return NextResponse.json({ error: 'The phone consent migration has not been installed.' }, { status: 503 })
      }
    }
  }

  const now = new Date().toISOString()
  const { data: camper, error } = await context.admin
    .from('campers')
    .update({
      sms_opt_in: enabled,
      sms_opt_in_at: enabled ? context.camper.sms_opt_in_at || now : null,
      event_reminders_opt_in: enabled,
      event_reminders_opt_in_at: enabled ? context.camper.event_reminders_opt_in_at || now : null,
      ...(enabled ? { sms_opt_out_at: null } : {}),
    })
    .eq('id', context.camper.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, camper })
}
