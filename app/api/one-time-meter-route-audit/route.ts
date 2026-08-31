import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { displayLotNumber, normalizeLotKey } from '../../../lib/meter-reading'

const oneTimeKey = 'meter-route-audit-4d8f1c7a'

function currentMonthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const monthStart = currentMonthStart()
  const [{ data: lots, error: lotError }, { data: campers, error: camperError }, { data: capturedRows, error: capturedError }] = await Promise.all([
    admin.from('lots').select('lot_number,meter_number,camper_id'),
    admin.from('campers').select('id,first_name,last_name,lot_number,role,active'),
    admin
      .from('meter_reading_submissions')
      .select('id,lot_number,status,captured_at')
      .gte('captured_at', monthStart)
      .neq('status', 'cancelled')
      .order('captured_at', { ascending: false }),
  ])

  if (lotError || camperError || capturedError) {
    return NextResponse.json({ error: lotError?.message || camperError?.message || capturedError?.message }, { status: 500 })
  }

  const capturedByLot = new Map<string, any>()
  for (const row of capturedRows || []) {
    const normalized = normalizeLotKey(row.lot_number)
    if (normalized && !capturedByLot.has(normalized)) capturedByLot.set(normalized, row)
  }

  const sites = (campers || [])
    .filter((camper: any) => camper.active !== false && isOperationalCamper(camper) && normalizeLotKey(camper.lot_number))
    .map((camper: any) => {
      const lot = (lots || []).find((item: any) => normalizeLotKey(item.lot_number) === normalizeLotKey(camper.lot_number))
      return {
        lot_number: displayLotNumber(camper.lot_number),
        camper: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
        meter_number: lot?.meter_number || null,
        captured: capturedByLot.get(normalizeLotKey(camper.lot_number)) || null,
      }
    })
    .sort((a: any, b: any) => a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true }))

  return NextResponse.json({
    monthStart,
    ff17: sites.filter((site: any) => normalizeLotKey(site.lot_number) === 'FF17'),
    missing: sites.filter((site: any) => !site.captured).map(({ captured: _captured, ...site }: any) => site),
    totals: { sites: sites.length, captured: sites.filter((site: any) => site.captured).length },
  })
}
