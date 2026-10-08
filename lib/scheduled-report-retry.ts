export type ScheduledDeliveryRecord = {
  status?: string | null
  office_email_status?: string | null
  printer_email_status?: string | null
}

export type ScheduledReportRetryDecision =
  | { action: 'retry'; sendOffice: boolean; sendPrinter: boolean }
  | { action: 'skip'; reason: string }

export function scheduledReportRetryDecision(
  record: ScheduledDeliveryRecord,
  alreadyHandledMessage: string,
): ScheduledReportRetryDecision {
  const status = String(record.status || '').toLowerCase()
  if (status === 'sent') return { action: 'skip', reason: alreadyHandledMessage }

  if (status === 'running') {
    return {
      action: 'skip',
      reason: 'A delivery attempt is still in progress or awaiting verification. Check the office inbox and Epson printer before retrying.',
    }
  }

  const sendOffice = record.office_email_status === 'failed'
  const sendPrinter = record.printer_email_status === 'failed'
  if (!sendOffice && !sendPrinter) {
    return {
      action: 'skip',
      reason: 'The earlier delivery result is uncertain. Check the office inbox and Epson printer before retrying.',
    }
  }

  return { action: 'retry', sendOffice, sendPrinter }
}
