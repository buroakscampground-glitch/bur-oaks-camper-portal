type DatabaseMutationError = {
  code?: unknown
  message?: unknown
}

type FinancialOperationErrorOptions = {
  migrationMessage: string
  fallbackMessage: string
  allowedMessages?: readonly string[]
}

export type FinancialOperationFailure = {
  message: string
  status: number
  report: boolean
}

export function financialOperationFailure(
  error: DatabaseMutationError,
  options: FinancialOperationErrorOptions,
): FinancialOperationFailure {
  const code = String(error?.code || '')
  if (code === '42883' || code === 'PGRST202') {
    return { message: options.migrationMessage, status: 503, report: true }
  }

  const message = String(error?.message || '').trim()
  if ((options.allowedMessages || []).includes(message)) {
    return { message, status: 409, report: false }
  }

  return { message: options.fallbackMessage, status: 500, report: true }
}
