import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '6e0bd78b3a5c8f516f65291bec000605d6bf8063e856d87f'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const [{ data: campers, error: camperError }, { data: lots, error: lotError }, { data: submissions, error: submissionError }] = await Promise.all([
    admin
      .from('campers')
      .select('id,first_name,last_name,lot_number,active,role')
      .or('lot_number.ilike.%FF16%,lot_number.ilike.%FF17%,last_name.ilike.%Quinn%,first_name.ilike.%Georgia%')
      .order('lot_number'),
    admin
      .from('lots')
      .select('id,lot_number,meter_number,camper_id')
      .or('lot_number.ilike.%FF16%,lot_number.ilike.%FF17%')
      .order('lot_number'),
    admin
      .from('meter_reading_submissions')
      .select('id,camper_id,lot_number,status,captured_at,invoice_id')
      .or('lot_number.ilike.%FF16%,lot_number.ilike.%FF17%')
      .order('captured_at', { ascending: false })
      .limit(20),
  ])

  const error = camperError || lotError || submissionError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ campers: campers || [], lots: lots || [], submissions: submissions || [] })
}
