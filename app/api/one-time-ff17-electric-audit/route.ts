import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizeLotKey } from '../../../lib/meter-reading'

const oneTimeKey = 'ff17-electric-audit-6e4319bd'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)
  const [{ data: campers, error: camperError }, { data: lots, error: lotError }] = await Promise.all([
    admin.from('campers').select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active,role'),
    admin.from('lots').select('id,lot_number,meter_number,camper_id'),
  ])
  if (camperError || lotError) return NextResponse.json({ error: camperError?.message || lotError?.message }, { status: 500 })

  const relatedTo17 = (value: unknown) => normalizeLotKey(value).replace(/^F+/, '') === '17'
  const camperRows = (campers || []).filter((row: any) => relatedTo17(row.lot_number))
  const camperIds = camperRows.map((row: any) => row.id)
  const [{ data: submissions, error: submissionError }, { data: readings, error: readingError }] = await Promise.all([
    admin.from('meter_reading_submissions')
      .select('id,camper_id,lot_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,invoice_id')
      .order('captured_at', { ascending: false })
      .limit(500),
    camperIds.length
      ? admin.from('electric_readings')
        .select('id,camper_id,previous_reading,current_reading,reading_date,invoice_id')
        .in('camper_id', camperIds)
        .order('reading_date', { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (submissionError || readingError) return NextResponse.json({ error: submissionError?.message || readingError?.message }, { status: 500 })

  return NextResponse.json({
    exactFf17Exists: camperRows.some((row: any) => normalizeLotKey(row.lot_number) === 'FF17') || (lots || []).some((row: any) => normalizeLotKey(row.lot_number) === 'FF17'),
    campers: camperRows,
    lots: (lots || []).filter((row: any) => relatedTo17(row.lot_number)),
    submissions: (submissions || []).filter((row: any) => relatedTo17(row.lot_number) || camperIds.includes(row.camper_id)).slice(0, 20),
    readings: readings || [],
  })
}
