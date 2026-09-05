import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ONE_TIME_KEY = 'b5a2cb9fece24c99b4d3d04738afb69f'
const MARKER = 'one-time-site15-quarterly-2026-09-05'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Production data service is not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,rent_payment_plan,active')
    .ilike('lot_number', '15')
    .eq('active', true)

  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
  if (!campers || campers.length !== 1) {
    return NextResponse.json({ error: `Expected one active camper at Site 15; found ${campers?.length || 0}.` }, { status: 409 })
  }

  const camper = campers[0]
  const [{ data: lots, error: lotError }, { data: renewals, error: renewalError }, { data: invoices, error: invoiceError }] = await Promise.all([
    admin.from('lots').select('lot_number,lot_rent_amount').ilike('lot_number', '15').limit(2),
    admin.from('season_renewals').select('id,status,contract_end_date,decision_recorded_at,renewal_document_id,created_at').eq('camper_id', camper.id).order('created_at', { ascending: false }).limit(5),
    admin.from('invoices').select('id,invoice_number,invoice_type,subtotal,total_due,late_fee,due_date,status,created_at,invoice_items(description,quantity,unit_price,total)').eq('camper_id', camper.id).order('due_date', { ascending: true }),
  ])

  const error = lotError || renewalError || invoiceError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rentInvoices = (invoices || []).filter((invoice) => {
    const type = String(invoice.invoice_type || '').toLowerCase()
    return type.includes('rent') && (type.includes('lot') || type.includes('site'))
  })

  return NextResponse.json({
    camper: {
      id: camper.id,
      lotNumber: camper.lot_number,
      name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
      paymentPlan: camper.rent_payment_plan,
    },
    lotRentAmount: Number(lots?.[0]?.lot_rent_amount || 0),
    renewals: renewals || [],
    rentInvoices,
  })
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Production data service is not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const { data: prior } = await admin.from('admin_notifications').select('id').eq('source_table', MARKER).limit(1)
  if (prior?.length) {
    return NextResponse.json({ success: true, alreadyApplied: true, paymentPlan: 'quarterly', annualTotal: 1600 })
  }

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,rent_payment_plan,active')
    .ilike('lot_number', '15')
    .eq('active', true)
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
  if (!campers || campers.length !== 1) {
    return NextResponse.json({ error: `Expected one active camper at Site 15; found ${campers?.length || 0}.` }, { status: 409 })
  }

  const camper = campers[0]
  const { data: invoices, error: invoiceError } = await admin
    .from('invoices')
    .select('id,invoice_number,invoice_type,subtotal,total_due,late_fee,due_date,status')
    .eq('camper_id', camper.id)
    .in('invoice_number', ['RENT-15-20260916', 'INV-20260828-076', 'INV-20260828-077', 'INV-20260828-078'])
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })

  const expected = new Map([
    ['RENT-15-20260916', { amount: 800, replacement: 400 }],
    ['INV-20260828-076', { amount: 400, replacement: 400 }],
    ['INV-20260828-077', { amount: 400, replacement: 400 }],
    ['INV-20260828-078', { amount: 400, replacement: 400 }],
  ])
  const safe = (invoices || []).length === 4 && (invoices || []).every((invoice) => {
    const rule = expected.get(String(invoice.invoice_number))
    return rule && String(invoice.status).toLowerCase() === 'sent' && Number(invoice.total_due) === rule.amount && Number(invoice.late_fee || 0) === 0
  })
  if (!safe) {
    return NextResponse.json({ error: 'Site 15 invoices changed after the audit; no billing records were modified.' }, { status: 409 })
  }

  const { error: camperUpdateError } = await admin.from('campers').update({ rent_payment_plan: 'quarterly' }).eq('id', camper.id)
  if (camperUpdateError) return NextResponse.json({ error: camperUpdateError.message }, { status: 500 })

  for (const invoice of invoices || []) {
    const replacement = expected.get(String(invoice.invoice_number))?.replacement || 400
    const { error: updateError } = await admin.from('invoices').update({
      invoice_type: 'Quarterly Lot Rent',
      subtotal: replacement,
      total_due: replacement,
    }).eq('id', invoice.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    const { error: itemError } = await admin.from('invoice_items').update({
      description: 'Quarterly Lot Rent',
      quantity: 1,
      unit_price: replacement,
      total: replacement,
    }).eq('invoice_id', invoice.id)
    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
  }

  const { error: markerError } = await admin.from('admin_notifications').insert({
    type: 'rent_schedule_updated',
    title: 'Site 15 changed to quarterly rent',
    message: 'Site 15 is saved as four quarterly $400 payments. The incorrect $800 half-payment was corrected to $400, keeping the annual total at $1,600.',
    lot_number: '15',
    camper_id: camper.id,
    source_table: MARKER,
  })
  if (markerError) return NextResponse.json({ error: markerError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    alreadyApplied: false,
    paymentPlan: 'quarterly',
    installments: (invoices || []).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).map((invoice) => ({
      dueDate: invoice.due_date,
      amount: 400,
    })),
    annualTotal: 1600,
  })
}
