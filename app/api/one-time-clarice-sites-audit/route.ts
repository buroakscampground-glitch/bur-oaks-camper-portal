import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'b4979b4d1510933059fb6dd4e2e18202c42bbc8ea3b9146a'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  try {
    const admin = createClient(url, key)
    const [{ data: namedMatches, error }, { data: siteMatches, error: siteError }] = await Promise.all([
      admin
        .from('campers')
        .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
        .or('first_name.ilike.%Clari%,second_profile_first_name.ilike.%Clari%'),
      admin
        .from('campers')
        .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
        .in('lot_number', ['TEMP 1', 'TEMP1', '20']),
    ])

    if (error || siteError) throw new Error(error?.message || siteError?.message)

    const initialMatches = [...(namedMatches || []), ...(siteMatches || [])]
      .filter((camper, index, all) => all.findIndex((candidate) => candidate.id === camper.id) === index)

    const emails = Array.from(new Set(initialMatches
      .flatMap((camper: any) => [camper.email, camper.secondary_email])
      .map((email: unknown) => String(email || '').trim().toLowerCase())
      .filter(Boolean)))

    const relatedByEmail: any[] = []
    for (const email of emails) {
      const { data: related, error: relatedError } = await admin
        .from('campers')
        .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
        .or(`email.ilike.${email},secondary_email.ilike.${email}`)
      if (relatedError) throw relatedError
      relatedByEmail.push(...(related || []))
    }

    const matches = [...initialMatches, ...relatedByEmail]
      .filter((camper, index, all) => all.findIndex((candidate) => candidate.id === camper.id) === index)

    return NextResponse.json({ matches })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to audit Clarice’s campsite records.' }, { status: 500 })
  }
}
