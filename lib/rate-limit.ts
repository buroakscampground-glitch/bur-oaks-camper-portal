type RateLimitEntry = { count: number; resetAt: number }

const store = new Map<string, RateLimitEntry>()

export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number
) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown'
  const key = `${scope}:${ip}`
  const now = Date.now()
  const current = store.get(key)

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  store.set(key, current)
  return { allowed: true, retryAfter: 0 }
}
