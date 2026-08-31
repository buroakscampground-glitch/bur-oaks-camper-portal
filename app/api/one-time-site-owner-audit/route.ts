import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizeLotKey } from '../../../lib/meter-reading'

const oneTimeKey = 'site-owner-audit-71c2a8d4'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)
  const [{ data: campers, error: camperError }, { data: lots, error: lotError }, { data: submissions, error: submissionError }] = await Promise.all([
    admin.from('campers').select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active,role,email'),
    admin.from('lots').select('id,lot_number,meter_number,camper_id'),
    admin.from('meter_reading_submissions').select('id,camper_id,lot_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,invoice_id').order('captured_at', { ascending: false }).limit(500),
  ])
  if (camperError || lotError || submissionError) {
    return NextResponse.json({ error: camperError?.message || lotError?.message || submissionError?.message }, { status: 500 })
  }

  const relevantName = (row: any) => {
    const name = `${row.first_name || ''} ${row.last_name || ''} ${row.second_profile_first_name || ''} ${row.second_profile_last_name || ''}`.toLowerCase()
    return ['phillip', 'quinn', 'georgia', 'clarice', 'clairice'].some((part) => name.includes(part))
  }
  const relevantLot = (value: unknown) => ['1', 'TEMP1', '16', 'FF16', '17', 'FF17', '18'].includes(normalizeLotKey(value))
  const camperRows = (campers || []).filter((row: any) => relevantName(row) || relevantLot(row.lot_number))
  const camperIds = new Set(camperRows.map((row: any) => row.id))
  const submissionRows = (submissions || []).filter((row: any) => relevantLot(row.lot_number) || camperIds.has(row.camper_id)).slice(0, 100)
  const invoiceIds = submissionRows.map((row: any) => row.invoice_id).filter(Boolean)
  const [{ data: invoices, error: invoiceError }, { data: readings, error: readingError }] = await Promise.all([
    invoiceIds.length
      ? admin.from('invoices').select('id,camper_id,invoice_number,invoice_type,status,subtotal,late_fee,total_due,due_date,paid_at,created_at,invoice_items(id,description,quantity,unit_price,total)').in('id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? admin.from('electric_readings').select('id,camper_id,previous_reading,current_reading,kwh_used,rate_per_kwh,amount_due,reading_date,invoice_id').in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (invoiceError || readingError) return NextResponse.json({ error: invoiceError?.message || readingError?.message }, { status: 500 })

  return NextResponse.json({
    campers: camperRows,
    lots: (lots || []).filter((row: any) => relevantLot(row.lot_number) || camperIds.has(row.camper_id)),
    submissions: submissionRows,
    invoices: invoices || [],
    readings: readings || [],
  })
}
