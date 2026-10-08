import { sendAdminAlertEmail } from './admin-alert-email'
import { sendOwnerTextAlert } from './owner-alert-sms'
import { getSiteUrl } from './site-url'

type CronHandler = (request: Request) => Promise<Response>

function safeJobName(value: string) {
  return String(value || 'scheduled-operation')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'scheduled-operation'
}

async function alertExternalFailure(kind: 'scheduled operation' | 'Stripe webhook', jobName: string, request: Request, status: number) {
  if (process.env.CRON_FAILURE_ALERTS_ENABLED === 'false') return

  const job = safeJobName(jobName)
  const requestId = String(request.headers.get('x-request-id') || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80)
  const actionUrl = `${getSiteUrl()}/admin/system-health#delivery`
  const message = `The ${job} ${kind} returned a server error. Open System Health before repeating any related office work.`

  const results = await Promise.allSettled([
    sendAdminAlertEmail({
      subject: `Bur Oaks ${kind} failed — ${job}`,
      heading: `A ${kind} needs attention`,
      message,
      details: [
        { label: 'Operation', value: job },
        { label: 'HTTP status', value: status },
        { label: 'Request reference', value: requestId || 'Not available' },
        { label: 'Detected', value: new Date().toISOString() },
      ],
      actionUrl,
      actionLabel: 'Open System Health',
    }),
    sendOwnerTextAlert({
      type: 'system_failure',
      title: 'Scheduled operation failed',
      message: `${job} returned status ${status}. Open System Health before retrying related work`,
    }),
  ])

  for (const result of results) {
    if (result.status === 'rejected') console.error('Cron failure alert delivery failed:', result.reason)
  }
}

export function withCronFailureAlert(jobName: string, handler: CronHandler): CronHandler {
  return async (request: Request) => {
    try {
      const response = await handler(request)
      if (response.status >= 500) await alertExternalFailure('scheduled operation', jobName, request, response.status)
      return response
    } catch (error) {
      await alertExternalFailure('scheduled operation', jobName, request, 500)
      throw error
    }
  }
}

export async function alertStripeWebhookFailure(operation: string, request: Request, status = 500) {
  await alertExternalFailure('Stripe webhook', operation, request, status)
}
