import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const oneTimeKey = 'ff-photo-audit-8c2d6e1b'
const submissionIds = [
  '7355a32c-707b-4c05-a47f-ecf6cb5aab46',
  'fd47ee74-a6ea-4fd0-a335-d1ad2b2e937c',
]

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const { data, error } = await admin
    .from('meter_reading_submissions')
    .select('id,camper_id,lot_number,status,detected_reading,captured_at,photo_path')
    .in('id', submissionIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const submissions = await Promise.all((data || []).map(async (submission: any) => {
    const { data: signed } = await admin.storage
      .from('meter-reading-photos')
      .createSignedUrl(submission.photo_path, 60 * 10)
    return { ...submission, photo_url: signed?.signedUrl || null }
  }))

  return NextResponse.json({ submissions })
}
