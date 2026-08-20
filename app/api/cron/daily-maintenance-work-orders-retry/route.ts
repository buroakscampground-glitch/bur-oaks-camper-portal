import { GET as runDailyMaintenanceWorkOrders } from '../daily-maintenance-work-orders/route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return runDailyMaintenanceWorkOrders(request)
}
