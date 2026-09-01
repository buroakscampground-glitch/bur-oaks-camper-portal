import { GET as runDailyPaymentReport } from '../daily-payment-report/route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  return runDailyPaymentReport(request)
}
