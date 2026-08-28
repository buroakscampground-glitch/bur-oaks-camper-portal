import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

function authorized(request: Request) {
  const token = process.env.ONE_TIME_GEORGIA_MOVE_20260828
  return Boolean(token) && request.headers.get('authorization') === `Bearer ${token}`
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createClient(supabaseUrl, key) : null
}

async function lookup(admin: any) {
  const [primary, secondary, destination] = await Promise.all([
    admin
      .from('campers')
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active,role')
      .ilike('first_name', 'Georgia'),
    admin
      .from('campers')
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active,role')
      .ilike('second_profile_first_name', 'Georgia'),
    admin
      .from('campers')
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active,role')
      .ilike('lot_number', 'FF16')
      .eq('active', true),
  ])

  const error = primary.error || secondary.error || destination.error
  if (error) throw new Error(error.message)

  const matches = [...(primary.data || []), ...(secondary.data || [])].filter(
    (row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index,
  )

  return { matches, occupants: destination.data || [] }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Admin connection unavailable' }, { status: 500 })

  try {
    const result = await lookup(admin)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Admin connection unavailable' }, { status: 500 })

  try {
    const { matches, occupants } = await lookup(admin)
    if (matches.length !== 1) {
      return NextResponse.json({ error: `Expected one Georgia camper record; found ${matches.length}.`, matches }, { status: 409 })
    }

    const georgia = matches[0]
    const conflictingOccupants = occupants.filter((occupant: any) => occupant.id !== georgia.id)
    if (conflictingOccupants.length) {
      return NextResponse.json({ error: 'FF16 already has an active camper record.', occupants: conflictingOccupants }, { status: 409 })
    }

    const previousLot = georgia.lot_number
    const { data, error } = await admin
      .from('campers')
      .update({ lot_number: 'FF16' })
      .eq('id', georgia.id)
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, previousLot, camper: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
