import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '532dfe2e80be6829af2602387d6a7550847d82fc15739742'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })
  const admin = createClient(url, key)

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,email,active')
    .or('lot_number.ilike.F2,lot_number.ilike.FF2,first_name.ilike.Gary,last_name.ilike.Johnson')
    .order('lot_number')
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const camperIds = (campers || []).map((camper) => camper.id)
  const { data: pumps, error: pumpError } = await admin
    .from('sewer_pump_out_requests')
    .select('*')
    .in('camper_id', camperIds.length ? camperIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('requested_at', '2026-09-01T00:00:00-05:00')
    .lt('requested_at', '2026-10-01T00:00:00-05:00')
    .order('requested_at')
  if (pumpError) return NextResponse.json({ error: pumpError.message }, { status: 500 })

  const invoiceIds = Array.from(new Set((pumps || []).map((pump) => pump.billed_invoice_id).filter(Boolean)))
  const [{ data: invoices, error: invoiceError }, { data: items, error: itemError }] = await Promise.all([
    admin.from('invoices').select('*').in('id', invoiceIds.length ? invoiceIds : ['00000000-0000-0000-0000-000000000000']),
    admin.from('invoice_items').select('*').in('invoice_id', invoiceIds.length ? invoiceIds : ['00000000-0000-0000-0000-000000000000']),
  ])
  if (invoiceError || itemError) return NextResponse.json({ error: invoiceError?.message || itemError?.message }, { status: 500 })

  return NextResponse.json({ campers: campers || [], pumps: pumps || [], invoices: invoices || [], items: items || [] })
}
