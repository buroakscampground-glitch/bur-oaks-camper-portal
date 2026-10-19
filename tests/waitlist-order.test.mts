import assert from 'node:assert/strict'
import test from 'node:test'
import { sortWaitlistLongestFirst } from '../lib/waitlist-order.ts'

test('active waitlist is ordered from the longest wait to the newest', () => {
  const rows = [
    { id: 'new', status: 'Waiting', created_at: '2026-10-19T14:00:00Z' },
    { id: 'old', status: 'Contacted', created_at: '2026-07-01T10:00:00Z' },
    { id: 'middle', status: 'Accepted', created_at: '2026-09-01T10:00:00Z' },
  ]

  assert.deepEqual(sortWaitlistLongestFirst(rows).map((row) => row.id), ['old', 'middle', 'new'])
  assert.deepEqual(rows.map((row) => row.id), ['new', 'old', 'middle'])
})

test('completed and inactive records stay below every active prospect', () => {
  const rows = [
    { id: 'removed-old', status: 'Removed', created_at: '2025-01-01T10:00:00Z' },
    { id: 'active-new', status: 'Waiting', created_at: '2026-10-19T14:00:00Z' },
    { id: 'converted', status: 'Converted', created_at: '2026-02-01T10:00:00Z' },
    { id: 'active-old', status: 'Waiting', created_at: '2026-07-01T10:00:00Z' },
  ]

  assert.deepEqual(sortWaitlistLongestFirst(rows).map((row) => row.id), [
    'active-old', 'active-new', 'removed-old', 'converted',
  ])
})

test('records without a valid joined date appear last within their section', () => {
  const rows = [
    { id: 'missing', status: 'Waiting', created_at: null },
    { id: 'dated', status: 'Waiting', created_at: '2026-08-01T10:00:00Z' },
  ]

  assert.deepEqual(sortWaitlistLongestFirst(rows).map((row) => row.id), ['dated', 'missing'])
})
