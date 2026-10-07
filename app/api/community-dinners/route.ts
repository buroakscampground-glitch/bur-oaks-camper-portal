import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { canonicalSaturdayDinnerSignups } from '../../../lib/saturday-dinner-metrics'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canManageCommunity } from '../../../lib/staff-roles'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  const [signupResult, camperResult] = await Promise.all([
    context.admin
      .from('saturday_dinner_signups')
      .select('*')
      .order('dinner_date', { ascending: true })
      .order('updated_at', { ascending: false }),
    context.admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,active,role,camper_since_date')
      .eq('active', true)
      .order('lot_number', { ascending: true }),
  ])

  if (signupResult.error || camperResult.error) {
    return NextResponse.json({ error: signupResult.error?.message || camperResult.error?.message }, { status: 500 })
  }

  return NextResponse.json({
    signups: canonicalSaturdayDinnerSignups(signupResult.data || []),
    campers: (camperResult.data || []).filter(isOperationalCamper),
  })
}
