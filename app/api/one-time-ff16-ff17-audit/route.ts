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
      .or('lot_number.ilike.%FF16%,lot_number.ilike.%FF17%,lot_number.eq.F1')
      .order('lot_number'),
    admin
      .from('meter_reading_submissions')
      .select('id,camper_id,lot_number,status,captured_at,invoice_id')
      .or('lot_number.ilike.%FF16%,lot_number.ilike.%FF17%,lot_number.eq.F1')
      .order('captured_at', { ascending: false })
      .limit(20),
  ])

  const error = camperError || lotError || submissionError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ campers: campers || [], lots: lots || [], submissions: submissions || [] })
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const phillipId = '900178ae-b006-41f4-a39c-7754b58bd8e6'
  const georgiaId = '672861db-cc06-4cbb-ba01-c39f441141bc'
  const phillipLotId = 'c00b3085-1537-4557-ad90-4f8f125ac0da'

  const { data: georgiaLot, error: georgiaLotError } = await admin
    .from('lots')
    .select('id,lot_number,camper_id')
    .eq('camper_id', georgiaId)
    .eq('lot_number', 'F1')
    .maybeSingle()
  if (georgiaLotError || !georgiaLot) {
    return NextResponse.json({ error: georgiaLotError?.message || 'Georgia F1 lot record was not found. No changes made.' }, { status: 409 })
  }

  const { data: phillipCamper } = await admin.from('campers').select('id,lot_number').eq('id', phillipId).maybeSingle()
  const { data: georgiaCamper } = await admin.from('campers').select('id,lot_number').eq('id', georgiaId).maybeSingle()
  const { data: phillipLot } = await admin.from('lots').select('id,lot_number,camper_id').eq('id', phillipLotId).maybeSingle()
  if (phillipCamper?.lot_number !== 'FF16' || georgiaCamper?.lot_number !== 'F1' || phillipLot?.lot_number !== 'FF16' || phillipLot?.camper_id !== phillipId) {
    return NextResponse.json({ error: 'The live records changed after the audit. No changes made.' }, { status: 409 })
  }

  const steps = [
    await admin.from('lots').update({ lot_number: 'FF17' }).eq('id', phillipLotId).eq('lot_number', 'FF16'),
    await admin.from('lots').update({ lot_number: 'FF16' }).eq('id', georgiaLot.id).eq('lot_number', 'F1'),
    await admin.from('campers').update({ lot_number: 'FF17' }).eq('id', phillipId).eq('lot_number', 'FF16'),
    await admin.from('campers').update({ lot_number: 'FF16' }).eq('id', georgiaId).eq('lot_number', 'F1'),
    await admin.from('meter_reading_submissions').update({ lot_number: 'FF17' }).eq('camper_id', phillipId).eq('lot_number', 'FF16').is('invoice_id', null),
    await admin.from('meter_reading_submissions').update({ lot_number: 'FF16' }).eq('camper_id', georgiaId).eq('lot_number', 'F1').is('invoice_id', null),
  ]
  const failure = steps.find((step) => step.error)
  if (failure?.error) return NextResponse.json({ error: failure.error.message }, { status: 500 })

  return NextResponse.json({ success: true, phillip: 'FF17', georgia: 'FF16' })
}
