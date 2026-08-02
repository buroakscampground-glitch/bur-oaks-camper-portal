import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

type RateLimitEntry = { count: number; resetAt: number }

const store = new Map<string, RateLimitEntry>()

export async function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number
) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown'
  const fingerprint = createHash('sha256')
    .update(`${ip}|${request.headers.get('user-agent') || 'unknown'}`)
    .digest('hex')
  const key = `${scope}:${fingerprint}`
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.rpc('check_api_rate_limit', {
      p_scope: scope,
      p_identifier: fingerprint,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    })

    if (!error && Array.isArray(data) && data[0]) {
      return {
        allowed: data[0].allowed === true,
        retryAfter: Number(data[0].retry_after || 0),
      }
    }

    if (error && !['42883', 'PGRST202'].includes(error.code || '')) {
      console.error('Distributed rate limit failed:', error.code)
    }
  }

  // Safe rollout fallback until the database migration is installed.
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
