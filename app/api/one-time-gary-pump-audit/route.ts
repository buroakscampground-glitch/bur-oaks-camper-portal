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

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })
  const admin = createClient(url, key)
  const pumpId = 'dbb2bb11-3857-425a-bf79-4f4422c0c9c7'
  const camperId = 'ff5ce510-a744-460d-99f2-8a2e6fd7c3ea'

  const { data: existing, error: existingError } = await admin
    .from('sewer_pump_out_requests')
    .select('id,camper_id,lot_number,camper_name,status,charge_amount,gallons_used,billed_at,billed_invoice_id')
    .eq('id', pumpId)
    .eq('camper_id', camperId)
    .maybeSingle()
  if (existingError || !existing) return NextResponse.json({ error: existingError?.message || 'Gary’s pump-out was not found.' }, { status: 404 })
  if (existing.billed_at || existing.billed_invoice_id) {
    return NextResponse.json({ error: 'Gary’s pump-out has already been billed and was not changed.' }, { status: 409 })
  }
  if (String(existing.status) !== 'completed' || String(existing.lot_number).toUpperCase() !== 'F2') {
    return NextResponse.json({ error: 'Gary’s pump-out no longer matches the approved completed F2 record.' }, { status: 409 })
  }
  if (Number(existing.charge_amount) === 15 && Number(existing.gallons_used) === 150) {
    return NextResponse.json({ success: true, alreadyAdjusted: true, pump: existing })
  }
  if (Number(existing.charge_amount) !== 10 || Number(existing.gallons_used) !== 30) {
    return NextResponse.json({ error: 'Gary’s pump-out amount changed before this adjustment and was not overwritten.' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await admin
    .from('sewer_pump_out_requests')
    .update({ charge_amount: 15, gallons_used: 150, updated_at: new Date().toISOString() })
    .eq('id', pumpId)
    .eq('camper_id', camperId)
    .is('billed_at', null)
    .eq('charge_amount', 10)
    .eq('gallons_used', 30)
    .select('id,camper_id,lot_number,camper_name,status,charge_amount,gallons_used,billed_at,billed_invoice_id,completed_at')
    .maybeSingle()
  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message || 'Gary’s pump-out changed before the adjustment completed.' }, { status: 409 })
  }
  return NextResponse.json({ success: true, alreadyAdjusted: false, pump: updated })
}
