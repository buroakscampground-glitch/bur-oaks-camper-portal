import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import test from 'node:test'

const cronRoot = new URL('../app/api/cron/', import.meta.url)
const guardSource = readFileSync(new URL('../lib/cron-failure-alert.ts', import.meta.url), 'utf8')

test('the cron failure guard alerts only on server failures and preserves the response', () => {
  assert.match(guardSource, /if \(response\.status >= 500\) await alertCronFailure/)
  assert.match(guardSource, /return response/)
  assert.match(guardSource, /catch \(error\) \{\s*await alertCronFailure\(jobName, request, 500\)\s*throw error/)
})

test('every scheduled route is guarded directly or delegates to a guarded route', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const scheduledPaths = new Set(config.crons.map((cron: any) => cron.path))

  for (const path of scheduledPaths) {
    const source = readFileSync(new URL(`../app${path}/route.ts`, import.meta.url), 'utf8')
    const guarded = source.includes('withCronFailureAlert(')
    const delegates = /import \{ GET as run[A-Za-z]+ \} from '\.\.\//.test(source)
    assert.ok(guarded || delegates, `${path} must use the cron failure guard or delegate to a guarded route`)
  }

  assert.ok(readdirSync(cronRoot).length >= scheduledPaths.size)
})

test('external failure alerts contain no response body or camper data', () => {
  assert.doesNotMatch(guardSource, /response\.json|response\.text|camper_id|invoice_id|payment/)
  assert.match(guardSource, /Request reference/)
  assert.match(guardSource, /system_failure/)
  assert.match(guardSource, /admin\/system-health#delivery/)
})
