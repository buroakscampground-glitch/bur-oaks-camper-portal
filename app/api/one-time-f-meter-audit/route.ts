import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizeLotKey } from '../../../lib/meter-reading'

const oneTimeKey = 'f-meter-audit-b3ac5297d18b4df0'

function relevant(value: unknown) {
  return new Set(['F2', 'FF2', 'F15A', 'FF15A']).has(normalizeLotKey(value))
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const [lots, campers, submissions, readings] = await Promise.all([
    admin.from('lots').select('id,lot_number,meter_number,camper_id'),
    admin.from('campers').select('id,first_name,last_name,lot_number,active,role'),
    admin.from('meter_reading_submissions')
      .select('id,camper_id,lot_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,ocr_confidence,ocr_text')
      .order('captured_at', { ascending: false })
      .limit(500),
    admin.from('electric_readings')
      .select('id,camper_id,previous_reading,current_reading,reading_date')
      .order('reading_date', { ascending: false })
      .limit(500),
  ])

  const errors = [lots.error, campers.error, submissions.error, readings.error].filter(Boolean)
  if (errors.length) return NextResponse.json({ errors: errors.map((error: any) => error.message) }, { status: 500 })

  const relevantCampers = (campers.data || []).filter((row: any) => relevant(row.lot_number))
  const camperIds = new Set(relevantCampers.map((row: any) => row.id))

  return NextResponse.json({
    lots: (lots.data || []).filter((row: any) => relevant(row.lot_number)),
    campers: relevantCampers,
    submissions: (submissions.data || []).filter((row: any) => relevant(row.lot_number) || camperIds.has(row.camper_id)).slice(0, 30),
    readings: (readings.data || []).filter((row: any) => camperIds.has(row.camper_id)).slice(0, 30),
  })
}
