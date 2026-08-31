import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '0d3fdb509ce0869423b67d4480d74285c79c8c4d245d8059'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  try {
    const admin = createClient(url, key)
    const [{ data: campers, error: camperError }, { data: lots, error: lotError }] = await Promise.all([
      admin
        .from('campers')
        .select('id,first_name,last_name,lot_number,email,active,role')
        .ilike('lot_number', '%17%'),
      admin
        .from('lots')
        .select('id,lot_number,meter_number,camper_id')
        .ilike('lot_number', '%17%'),
    ])

    if (camperError || lotError) throw new Error(camperError?.message || lotError?.message)
    return NextResponse.json({ campers: campers || [], lots: lots || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to inspect Lot 17.' }, { status: 500 })
  }
}
