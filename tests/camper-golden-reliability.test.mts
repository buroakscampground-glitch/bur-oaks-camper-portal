import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('remaining camper planning and site summaries fail closed after incomplete reads', () => {
  const checks = [
    ['app/site/page.tsx', /Balances, documents, maintenance, and electric summaries are hidden/, /My Site is temporarily unavailable/],
    ['app/updates/page.tsx', /Announcements, unread totals, and private messages are hidden/, /Updates are temporarily unavailable/],
    ['app/calendar/page.tsx', /Events, RSVP totals, and response controls are hidden/, /Calendar is temporarily unavailable/],
    ['app/dinners/page.tsx', /Saved responses, headcounts, and food claims are hidden/, /Saturday dinners are temporarily unavailable/],
    ['app/thanksgiving/page.tsx', /Attendance totals, food claims, and response controls are hidden/, /Thanksgiving signup is temporarily unavailable/],
    ['app/community/texts/page.tsx', /Service status, campaign history, and sending controls are hidden/, /Event Texts are temporarily unavailable/],
  ] as const

  for (const [path, safetyCopy, heading] of checks) {
    const source = read(path)
    assert.match(source, safetyCopy, path)
    assert.match(source, heading, path)
    assert.match(source, /role="alert"/, path)
    assert.match(source, /portal-loading-retry/, path)
  }
})

test('uncertain camper communication and meal writes require verification before retry', () => {
  assert.match(read('app/updates/page.tsx'), /Check your recent private messages before sending it again/)
  assert.match(read('app/calendar/page.tsx'), /Check this event before choosing again/)
  assert.match(read('app/dinners/page.tsx'), /Check your saved response before submitting again/)
  assert.match(read('app/thanksgiving/page.tsx'), /Check your saved response before submitting again/)
  assert.match(read('app/community/texts/page.tsx'), /Check recent campaigns before sending this text again/)
})

test('camper billing refuses to present an unverified session as an empty account', () => {
  const source = read('app/invoices/page.tsx')
  assert.match(source, /if \(authError\) throw authError/)
  assert.match(source, /if \(sessionError\) throw sessionError/)
  assert.match(source, /secure billing session could not be confirmed/)
  assert.match(source, /Authorized billing accounts could not be loaded/)
})

test('event RSVP changes update in place and never delete the prior answer first', () => {
  for (const path of ['app/calendar/page.tsx', 'app/api/event-rsvp/route.ts']) {
    const source = read(path)
    assert.match(source, /existingRsvp|existing/)
    assert.match(source, /\.update\(\{ response \}\)/)
    assert.match(source, /\.insert\(/)
    assert.doesNotMatch(source, /from\('event_rsvps'\)\s*\.delete\(\)/s)
  }
})
