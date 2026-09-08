type PumpOutStatusRow = {
  status?: string | null
  billed_at?: string | null
}

function normalizedStatus(request: PumpOutStatusRow) {
  return String(request.status || '').trim().toLowerCase()
}

export function isPumpOutWaitingForService(request: PumpOutStatusRow) {
  return normalizedStatus(request) === 'requested' && !request.billed_at
}

export function isCompletedPumpOutWaitingForBilling(request: PumpOutStatusRow) {
  return normalizedStatus(request) === 'completed' && !request.billed_at
}

export function isUnbilledPumpOutWork(request: PumpOutStatusRow) {
  return isPumpOutWaitingForService(request) || isCompletedPumpOutWaitingForBilling(request)
}
