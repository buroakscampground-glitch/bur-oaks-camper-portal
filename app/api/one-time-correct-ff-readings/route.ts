import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const oneTimeKey = 'correct-ff-readings-6a4e9c2d'
const ff16SubmissionId = '7355a32c-707b-4c05-a47f-ecf6cb5aab46'
const temp1SubmissionId = 'fd47ee74-a6ea-4fd0-a335-d1ad2b2e937c'
const georgiaCamperId = '672861db-cc06-4cbb-ba01-c39f441141bc'
const temp1CamperId = '6a113155-c153-48b7-ac9f-b6680535845a'

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const { data: before, error: beforeError } = await admin
    .from('meter_reading_submissions')
    .select('id,camper_id,lot_number,status,detected_reading,invoice_id,photo_path')
    .in('id', [ff16SubmissionId, temp1SubmissionId])
  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 })

  if ((before || []).length !== 2 || (before || []).some((row: any) => row.invoice_id)) {
    return NextResponse.json({ error: 'The pending readings changed or were billed. Nothing was corrected.', before }, { status: 409 })
  }

  const { error: tempError } = await admin
    .from('meter_reading_submissions')
    .update({ camper_id: temp1CamperId, lot_number: 'TEMP 1' })
    .eq('id', temp1SubmissionId)
    .is('invoice_id', null)
  if (tempError) return NextResponse.json({ error: tempError.message }, { status: 500 })

  const { error: ff16Error } = await admin
    .from('meter_reading_submissions')
    .update({ camper_id: georgiaCamperId, lot_number: 'FF16' })
    .eq('id', ff16SubmissionId)
    .is('invoice_id', null)
  if (ff16Error) return NextResponse.json({ error: ff16Error.message }, { status: 500 })

  const { data: after, error: afterError } = await admin
    .from('meter_reading_submissions')
    .select('id,camper_id,lot_number,status,detected_reading,invoice_id,photo_path')
    .in('id', [ff16SubmissionId, temp1SubmissionId])
    .order('lot_number')
  if (afterError) return NextResponse.json({ error: afterError.message }, { status: 500 })

  return NextResponse.json({ success: true, before, after })
}
