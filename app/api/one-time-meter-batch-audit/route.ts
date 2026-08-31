import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { displayLotNumber, normalizeLotKey } from '../../../lib/meter-reading'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const oneTimeKey = 'meter-batch-audit-79e04d18'

function monthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function readingValue(row: any) {
  const value = [row.reviewed_reading, row.submitted_reading, row.detected_reading]
    .find((candidate) => candidate !== null && candidate !== undefined && Number.isFinite(Number(candidate)) && Number(candidate) > 0)
  return value === undefined ? null : Number(value)
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const start = monthStart()
  const [campersResult, lotsResult, submissionsResult, readingsResult, invoicesResult] = await Promise.all([
    admin.from('campers').select('id,first_name,last_name,lot_number,active,role'),
    admin.from('lots').select('id,lot_number,meter_number,camper_id'),
    admin.from('meter_reading_submissions')
      .select('id,camper_id,lot_number,meter_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,invoice_id')
      .gte('captured_at', start)
      .neq('status', 'cancelled')
      .order('captured_at', { ascending: false }),
    admin.from('electric_readings')
      .select('id,camper_id,previous_reading,current_reading,kwh_used,reading_date,invoice_id')
      .order('reading_date', { ascending: false })
      .limit(1500),
    admin.from('invoices')
      .select('id,camper_id,invoice_number,invoice_type,status,total_due,created_at,paid_at')
      .gte('created_at', start)
      .ilike('invoice_type', '%Electric%')
      .order('created_at', { ascending: false }),
  ])

  const error = campersResult.error || lotsResult.error || submissionsResult.error || readingsResult.error || invoicesResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const campers = (campersResult.data || []).filter((row: any) => row.active !== false && isOperationalCamper(row))
  const lots = lotsResult.data || []
  const submissions = submissionsResult.data || []
  const readings = readingsResult.data || []
  const invoices = invoicesResult.data || []
  const campersById = new Map(campers.map((row: any) => [row.id, row]))
  const lotsByKey = new Map(lots.map((row: any) => [normalizeLotKey(row.lot_number), row]))
  const sites = new Map<string, { lot_number: string; camper_id: string | null }>()

  for (const camper of campers) {
    const lotKey = normalizeLotKey(camper.lot_number)
    if (lotKey && !sites.has(lotKey)) sites.set(lotKey, { lot_number: String(camper.lot_number), camper_id: camper.id })
  }
  for (const lot of lots) {
    const lotKey = normalizeLotKey(lot.lot_number)
    if (lotKey && lot.camper_id && campersById.has(lot.camper_id)) {
      sites.set(lotKey, { lot_number: String(lot.lot_number), camper_id: lot.camper_id })
    }
  }

  const submissionsByLot = new Map<string, any[]>()
  for (const row of submissions) {
    const lotKey = normalizeLotKey(row.lot_number)
    if (lotKey) submissionsByLot.set(lotKey, [...(submissionsByLot.get(lotKey) || []), row])
  }
  const invoicesById = new Map(invoices.map((row: any) => [row.id, row]))
  const readingsByCamper = new Map<string, any[]>()
  for (const row of readings) {
    readingsByCamper.set(row.camper_id, [...(readingsByCamper.get(row.camper_id) || []), row])
  }

  const issues: Array<{ severity: 'high' | 'review'; lot_number: string; type: string; detail: string }> = []
  const siteRows = [...sites.entries()].map(([lotKey, site]) => {
    const siteSubmissions = submissionsByLot.get(lotKey) || []
    const current = siteSubmissions[0] || null
    const camper: any = site.camper_id ? campersById.get(site.camper_id) : null
    const reading = current ? readingValue(current) : null
    const activeRows = siteSubmissions.filter((row: any) => !['retake', 'cancelled'].includes(String(row.status || '').toLowerCase()))
    if (activeRows.length > 1) {
      issues.push({ severity: 'high', lot_number: site.lot_number, type: 'duplicate', detail: `${activeRows.length} active meter photos exist for this site this month.` })
    }
    if (current && site.camper_id && current.camper_id !== site.camper_id) {
      const capturedCamper: any = campersById.get(current.camper_id)
      issues.push({
        severity: 'high',
        lot_number: site.lot_number,
        type: 'wrong_account',
        detail: `The photo is linked to ${capturedCamper ? `${capturedCamper.first_name} ${capturedCamper.last_name}` : 'a different camper record'}, not the current site account.`,
      })
    }
    if (current && reading === null && !['retake', 'cancelled'].includes(String(current.status || '').toLowerCase())) {
      issues.push({ severity: 'high', lot_number: site.lot_number, type: 'unreadable', detail: 'The saved photo does not have a usable meter number.' })
    }
    if (current?.status === 'used' && !current.invoice_id) {
      issues.push({ severity: 'high', lot_number: site.lot_number, type: 'invoice_link', detail: 'Marked used but no invoice is linked.' })
    }
    if (current?.invoice_id && !invoicesById.has(current.invoice_id)) {
      issues.push({ severity: 'review', lot_number: site.lot_number, type: 'invoice_lookup', detail: 'The linked invoice was not found in this month’s electric invoices.' })
    }

    if (current && reading !== null && camper) {
      const prior = (readingsByCamper.get(camper.id) || []).find((row: any) => row.invoice_id !== current.invoice_id)
      const previous = Number(prior?.current_reading)
      if (Number.isFinite(previous) && previous > 0) {
        const usage = reading - previous
        const history = (readingsByCamper.get(camper.id) || [])
          .map((row: any) => Number(row.kwh_used))
          .filter((value: number) => Number.isFinite(value) && value > 0)
          .slice(0, 6)
        const average = history.length ? history.reduce((sum: number, value: number) => sum + value, 0) / history.length : 0
        if (usage < 0) {
          issues.push({ severity: 'high', lot_number: site.lot_number, type: 'reading_drop', detail: `Current ${reading} is below the prior ${previous}.` })
        } else if (usage > Math.max(2000, average * 3)) {
          issues.push({ severity: 'review', lot_number: site.lot_number, type: 'high_usage', detail: `Possible usage is ${usage} kWh${average ? ` versus a recent average of ${Math.round(average)} kWh` : ''}.` })
        }
      }
    }

    return {
      lot_number: displayLotNumber(site.lot_number),
      camper_name: camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : null,
      status: current?.status || 'not_read',
      reading,
      captured_at: current?.captured_at || null,
      invoice_id: current?.invoice_id || null,
      submissions_this_month: siteSubmissions.length,
      meter_number: lotsByKey.get(lotKey)?.meter_number || null,
    }
  }).sort((a, b) => a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true }))

  const capturedSites = siteRows.filter((row) => row.status !== 'not_read')
  const statusCounts = capturedSites.reduce((result: Record<string, number>, row) => {
    result[row.status] = (result[row.status] || 0) + 1
    return result
  }, {})

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    month_start: start,
    summary: {
      route_sites: siteRows.length,
      captured_sites: capturedSites.length,
      remaining_sites: siteRows.length - capturedSites.length,
      status_counts: statusCounts,
      high_priority_issues: issues.filter((issue) => issue.severity === 'high').length,
      review_items: issues.filter((issue) => issue.severity === 'review').length,
    },
    issues,
    sites: siteRows,
  })
}
