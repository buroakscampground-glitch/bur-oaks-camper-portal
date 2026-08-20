import { GET as runMondayPumpOutList } from '../monday-pump-out-list/route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return runMondayPumpOutList(request)
}
