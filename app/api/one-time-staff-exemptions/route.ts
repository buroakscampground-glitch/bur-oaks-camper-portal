import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ONE_TIME_KEY = 'd132c6d146934d73b9c74452b0faf12b'
const MARKER = 'one-time-staff-exemptions-2026-09-05'

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })

  const admin = createClient(url, serviceKey)
  const { data: prior } = await admin.from('admin_notifications').select('id').eq('source_table', MARKER).limit(1)
  if (prior?.length) return NextResponse.json({ success: true, alreadyApplied: true })

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,active')
    .eq('active', true)
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const anthony = (campers || []).filter((camper) => normalize(camper.first_name) === 'anthony' && normalize(camper.last_name) === 'finley' && normalize(camper.lot_number) === '48')
  const charlie = (campers || []).filter((camper) =>
    ['charlie', 'charles'].includes(normalize(camper.first_name))
    && ['kimbal', 'kimball'].includes(normalize(camper.last_name))
    && normalize(camper.lot_number) === '47'
  )
  if (anthony.length !== 1 || charlie.length !== 1) {
    return NextResponse.json({ error: `Expected one Anthony Finley at Lot 48 and one Charlie Kimball at Lot 47; found ${anthony.length} and ${charlie.length}.` }, { status: 409 })
  }

  const { data: anthonyDocuments, error: documentLoadError } = await admin
    .from('documents')
    .select('id,signature_status')
    .eq('camper_id', anthony[0].id)
    .in('signature_status', ['pending', 'pending_second_signature'])
  if (documentLoadError) return NextResponse.json({ error: documentLoadError.message }, { status: 500 })

  const documentIds = (anthonyDocuments || []).map((document) => document.id)
  if (documentIds.length) {
    const { error } = await admin.from('documents').update({ signature_status: 'not_required' }).in('id', documentIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { error: renewalError } = await admin.from('season_renewals').update({ auto_send_approved: false }).eq('camper_id', anthony[0].id)
  if (renewalError) return NextResponse.json({ error: renewalError.message }, { status: 500 })

  const { error: lotError } = await admin.from('lots').update({ lot_rent_amount: 0 }).eq('lot_number', charlie[0].lot_number)
  if (lotError) return NextResponse.json({ error: lotError.message }, { status: 500 })

  const { data: rentInvoices, error: invoiceError } = await admin
    .from('invoices')
    .select('id,invoice_type,status')
    .eq('camper_id', charlie[0].id)
    .in('status', ['sent', 'pending', 'open'])
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  const unpaidRentIds = (rentInvoices || [])
    .filter((invoice) => /rent/i.test(String(invoice.invoice_type || '')) && !/association/i.test(String(invoice.invoice_type || '')))
    .map((invoice) => invoice.id)
  if (unpaidRentIds.length) {
    const { error } = await admin.from('invoices').update({ status: 'canceled' }).in('id', unpaidRentIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error: markerError } = await admin.from('admin_notifications').insert({
    type: 'staff_exemptions_applied',
    title: 'Staff camper exemptions applied',
    message: 'Anthony Finley was removed from document delivery. Charlie Kimball was exempted from lot rent while other charges remain enabled.',
    lot_number: null,
    camper_id: null,
    source_table: MARKER,
  })
  if (markerError) return NextResponse.json({ error: markerError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    alreadyApplied: false,
    anthonyDocumentsClosed: documentIds.length,
    charlieRentInvoicesCanceled: unpaidRentIds.length,
    charlieLotRentAmount: 0,
  })
}
