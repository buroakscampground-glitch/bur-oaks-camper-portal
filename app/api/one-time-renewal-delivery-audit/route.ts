import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'f0306721a8c31c7a26ad426e0a36b705e7d680d1b4ed7a5a'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })
  const admin = createClient(url, key)

  const { data: documents, error: documentError } = await admin
    .from('documents')
    .select('id,document_name,document_type,signature_status,camper_id')
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 })

  const pendingRenewals = (documents || []).filter((document: any) => {
    const status = String(document.signature_status || '').toLowerCase()
    const label = `${document.document_name || ''} ${document.document_type || ''}`.toLowerCase()
    return status !== 'signed' && status !== 'not_required' && /renew|lease|contract/.test(label)
  })
  const camperIds = Array.from(new Set(pendingRenewals.map((document: any) => document.camper_id).filter(Boolean)))

  const [{ data: campers, error: camperError }, { data: reminders, error: reminderError }] = await Promise.all([
    camperIds.length
      ? admin.from('campers').select('id,first_name,last_name,lot_number,active').in('id', camperIds)
      : Promise.resolve({ data: [], error: null }),
    camperIds.length
      ? admin.from('text_reminders').select('camper_id,reminder_type,status,sent_at,recipient_phone,error_message').in('camper_id', camperIds).order('sent_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (camperError || reminderError) {
    return NextResponse.json({ error: camperError?.message || reminderError?.message }, { status: 500 })
  }

  const camperById = new Map((campers || []).map((camper: any) => [String(camper.id), camper]))
  const rows = pendingRenewals.map((document: any) => {
    const camper: any = camperById.get(String(document.camper_id || ''))
    const matchingTexts = (reminders || []).filter((reminder: any) => {
      if (String(reminder.camper_id) !== String(document.camper_id)) return false
      return /renew|document/.test(String(reminder.reminder_type || '').toLowerCase())
    })
    return {
      lotNumber: camper?.lot_number || null,
      camperName: camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : '',
      documentName: document.document_name,
      matchingTexts,
      textSent: matchingTexts.some((reminder: any) => String(reminder.status).toLowerCase() === 'sent'),
    }
  })

  return NextResponse.json({
    pendingRenewalCount: rows.length,
    textSentCamperCount: rows.filter((row) => row.textSent).length,
    emailNotificationImplemented: false,
    rows,
  })
}
