import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWaitlistCheckIn,
  createWaitlistManageToken,
  readWaitlistManageToken,
  waitlistCheckInIsDue,
} from '../lib/waitlist-check-in.ts'

test('waitlist check-in is warm, clear, and includes a removal option', () => {
  const copy = buildWaitlistCheckIn('Sally', 'https://example.com/remove')
  assert.match(copy.subject, /quick update/i)
  assert.match(copy.text, /haven't forgotten about you/i)
  assert.match(copy.text, /right site to open/i)
  assert.match(copy.text, /No action is needed/i)
  assert.match(copy.html, /Remove my name from the waitlist/i)
})

test('waitlist check-ins start immediately for existing records and repeat every thirty days', () => {
  const now = new Date('2026-09-18T12:00:00Z')
  assert.equal(waitlistCheckInIsDue('2026-09-18T11:00:00Z', null, now), true)
  assert.equal(waitlistCheckInIsDue('2025-01-01T00:00:00Z', '2026-08-19T12:00:00Z', now), true)
  assert.equal(waitlistCheckInIsDue('2025-01-01T00:00:00Z', '2026-08-20T12:00:01Z', now), false)
})

test('waitlist management links are signed and cannot be altered', () => {
  const token = createWaitlistManageToken({ id: 'entry-123', email: 'Sally@Example.com' }, 'test-secret')
  assert.deepEqual(readWaitlistManageToken(token, 'test-secret'), { id: 'entry-123', email: 'sally@example.com' })
  assert.equal(readWaitlistManageToken(`${token}changed`, 'test-secret'), null)
})
