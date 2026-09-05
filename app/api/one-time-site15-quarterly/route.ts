import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ONE_TIME_KEY = 'b5a2cb9fece24c99b4d3d04738afb69f'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
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
