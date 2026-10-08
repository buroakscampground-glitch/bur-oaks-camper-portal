type OperationalFailureDetails = {
  operation: string
  actorRole?: string
  identifiers?: Record<string, unknown>
}

function safeToken(value: unknown, maximum = 120) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, maximum)
}

export function operationalRequestId(request: Request) {
  return safeToken(request.headers.get('x-request-id'), 80) || crypto.randomUUID()
}

export function reportOperationalFailure(request: Request, details: OperationalFailureDetails, error?: unknown) {
  const requestId = operationalRequestId(request)
  const url = new URL(request.url)
  const source = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown } : null
  const identifiers = Object.fromEntries(
    Object.entries(details.identifiers || {})
      .map(([key, value]) => [safeToken(key, 40), safeToken(value)])
      .filter(([key, value]) => key && value)
  )

  console.error('[bur-oaks-operational-failure]', JSON.stringify({
    occurredAt: new Date().toISOString(),
    requestId,
    release: safeToken(process.env.VERCEL_GIT_COMMIT_SHA, 12) || 'local',
    route: url.pathname,
    method: request.method,
    operation: safeToken(details.operation, 80),
    actorRole: safeToken(details.actorRole || 'system', 30),
    identifiers,
    errorName: safeToken(source?.name || (error ? 'Error' : 'Unknown'), 50),
    errorCode: safeToken(source?.code, 50) || undefined,
  }))

  return requestId
}

export function supportReferenceMessage(message: string, requestId: string) {
  return `${message} Reference: ${requestId}.`
}
