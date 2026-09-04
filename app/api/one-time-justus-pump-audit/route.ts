import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const oneTimeKey = 'justus-pump-audit-7c42e90d'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,first_name,last_name,email,lot_number,active')
    .or('last_name.ilike.%Justus%,first_name.ilike.%John%,first_name.ilike.%Clairice%,email.eq.neter85@gmail.com,lot_number.eq.18,lot_number.eq.20,lot_number.ilike.%TEMP%')
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const camperIds = (campers || []).map((camper) => camper.id)
  const { data: pumpOuts, error: pumpError } = await admin
    .from('sewer_pump_out_requests')
    .select('*')
    .or(`camper_id.in.(${camperIds.join(',')}),lot_number.eq.18,lot_number.eq.20,lot_number.ilike.%TEMP%`)
    .order('requested_at', { ascending: false })
    .limit(100)
  if (pumpError) return NextResponse.json({ error: pumpError.message }, { status: 500 })

  const pumpIds = (pumpOuts || []).map((pump) => pump.id)
  const [{ data: notifications, error: notificationError }, { data: invoiceItems, error: invoiceItemError }] = await Promise.all([
    pumpIds.length
      ? admin.from('admin_notifications').select('*').eq('type', 'sewer_pump_out').in('source_id', pumpIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('invoice_items')
      .select('id,invoice_id,description,quantity,unit_price,total,invoices(id,camper_id,invoice_number,status,total_due,created_at,due_date)')
      .or('description.ilike.%pump%,description.ilike.%sewer%')
      .limit(150),
  ])
  if (notificationError || invoiceItemError) {
    return NextResponse.json({ error: notificationError?.message || invoiceItemError?.message }, { status: 500 })
  }

  const relevantInvoiceItems = (invoiceItems || []).filter((item: any) => camperIds.includes(item.invoices?.camper_id))
  return NextResponse.json({ campers: campers || [], pumpOuts: pumpOuts || [], notifications: notifications || [], invoiceItems: relevantInvoiceItems })
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)
  const requestId = '018a3352-f82a-473e-bde1-4385b15334b4'
  const camperId = '4c479ce4-ac07-4869-bd55-944a0251d59f'
  const { data: pumpOut, error: lookupError } = await admin
    .from('sewer_pump_out_requests')
    .select('id,camper_id,lot_number,status,billed_at,notes')
    .eq('id', requestId)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!pumpOut) return NextResponse.json({ corrected: false, reason: 'The pump-out record is already gone.' })
  if (pumpOut.camper_id !== camperId || pumpOut.lot_number !== '20' || pumpOut.billed_at) {
    return NextResponse.json({ corrected: false, reason: 'Safety check did not match.' }, { status: 409 })
  }

  const correction = 'Cancelled after audit: office entry was attached to John Justus / Lot 20 by mistake. No charge.'
  const notes = [correction, pumpOut.notes ? `Original note: ${pumpOut.notes}` : ''].filter(Boolean).join(' ')
  const { data: updated, error: updateError } = await admin
    .from('sewer_pump_out_requests')
    .update({ status: 'cancelled', completed_at: null, notes, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .is('billed_at', null)
    .select('id,status,billed_at,notes')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ corrected: true, pumpOut: updated })
}
