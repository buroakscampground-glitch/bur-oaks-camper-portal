import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runPendingDocumentSignatureReminders } from '../../../lib/document-reminders'
import { createPersonalizedRenewalPdf, renewalTermDates } from '../../../lib/personalized-renewal-pdf'
import { todayInCentral } from '../../../lib/invoice-texting'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const executionToken = 'clarice_2sites_f5b074e89ea64d88b063'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

const corrections = [
  { camperId: '88736667-0d96-4db4-ae47-0069b7002de1', lotNumber: '18', annualRent: 1600, contractEnd: '2027-02-01' },
  { camperId: '6a113155-c153-48b7-ac9f-b6680535845a', lotNumber: 'TEMP 1', annualRent: 1500, contractEnd: '2026-10-10' },
] as const

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-token') !== executionToken) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Service key is unavailable.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const today = todayInCentral()
  const results: any[] = []

  for (const correction of corrections) {
    const [{ data: camper, error: camperError }, { data: renewal, error: renewalError }] = await Promise.all([
      admin.from('campers').select('*').eq('id', correction.camperId).eq('active', true).maybeSingle(),
      admin.from('season_renewals').select('*').eq('camper_id', correction.camperId).maybeSingle(),
    ])
    if (camperError || renewalError || !camper || !renewal) {
      return NextResponse.json({ error: camperError?.message || renewalError?.message || `Missing Lot ${correction.lotNumber} record.`, results }, { status: 409 })
    }
    if (String(camper.lot_number).toUpperCase() !== correction.lotNumber || renewal.contract_end_date !== correction.contractEnd) {
      return NextResponse.json({ error: `Lot ${correction.lotNumber} no longer matches the audited renewal. Nothing further was sent.`, results }, { status: 409 })
    }

    const { data: existingLot } = await admin.from('lots').select('id').eq('lot_number', correction.lotNumber).limit(1).maybeSingle()
    const lotWrite = existingLot?.id
      ? await admin.from('lots').update({ camper_id: correction.camperId, lot_rent_amount: correction.annualRent }).eq('id', existingLot.id)
      : await admin.from('lots').insert({ camper_id: correction.camperId, lot_number: correction.lotNumber, lot_rent_amount: correction.annualRent })
    if (lotWrite.error) return NextResponse.json({ error: lotWrite.error.message, results }, { status: 500 })

    const dates = renewalTermDates(correction.contractEnd)
    const pdf = await createPersonalizedRenewalPdf({
      camperName: 'Clairice Marshall',
      lotNumber: correction.lotNumber,
      currentAgreementEnd: correction.contractEnd,
      renewalStart: dates.renewalStart,
      renewalEnd: dates.renewalEnd,
      annualRent: correction.annualRent,
      paymentPlan: 'semiannual',
    })
    const path = `${correction.camperId}/${crypto.randomUUID()}-${dates.renewalStart.slice(0, 4)}-Lot-${correction.lotNumber.replaceAll(' ', '-')}-Corrected-Personalized-Renewal.pdf`
    const { error: uploadError } = await admin.storage.from('camper-documents').upload(path, pdf, { contentType: 'application/pdf', upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message, results }, { status: 500 })

    const { data: document, error: documentError } = await admin.from('documents').insert({
      camper_id: correction.camperId,
      document_name: `${dates.renewalStart.slice(0, 4)} Lot ${correction.lotNumber} Corrected Personalized Renewal - ${correction.annualRent.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
      document_type: 'Seasonal Renewal',
      file_url: path,
      signature_status: 'pending',
    }).select('*').single()
    if (documentError || !document) {
      await admin.storage.from('camper-documents').remove([path])
      return NextResponse.json({ error: documentError?.message || 'The corrected document could not be created.', results }, { status: 500 })
    }

    const note = `Corrected personalized renewal issued ${today}: Lot ${correction.lotNumber}, annual rent ${correction.annualRent.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, two half payments. Earlier document preserved as history.`
    const { error: updateError } = await admin.from('season_renewals').update({
      lot_number: correction.lotNumber,
      annual_rent: correction.annualRent,
      rent_payment_plan: 'semiannual',
      status: 'Awaiting Response',
      renewal_document_id: document.id,
      renewal_sent_at: today,
      decision_recorded_at: null,
      auto_send_approved: false,
      auto_send_approved_at: null,
      automation_error: null,
      last_automation_at: new Date().toISOString(),
      notes: [String(renewal.notes || '').trim(), note].filter(Boolean).join('\n').slice(0, 3000),
    }).eq('id', renewal.id)
    if (updateError) return NextResponse.json({ error: updateError.message, results }, { status: 500 })

    if (renewal.renewal_document_id) {
      await admin.from('documents').update({ signature_status: 'not_required' })
        .eq('id', renewal.renewal_document_id)
        .in('signature_status', ['pending', 'pending_second_signature'])
    }

    const delivery = await runPendingDocumentSignatureReminders(admin, [String(document.id)])
    results.push({ lot: correction.lotNumber, annualRent: correction.annualRent, documentId: document.id, delivery })
  }

  return NextResponse.json({ success: true, today, results })
}
