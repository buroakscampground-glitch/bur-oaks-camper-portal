import test from 'node:test'
import assert from 'node:assert/strict'
import { movePumpOutStopToEnd, orderPumpOutWorkerStops, pumpOutWorkerProgress } from '../lib/pump-out-worker.ts'

test('worker route includes only unbilled requested stops and orders oldest first', () => {
  const rows = [
    { id: 'later', lot_number: '9', status: 'requested', requested_at: '2026-09-11T15:00:00Z' },
    { id: 'completed', lot_number: '2', status: 'completed', requested_at: '2026-09-09T15:00:00Z' },
    { id: 'billed', lot_number: '3', status: 'requested', billed_at: '2026-09-11T16:00:00Z', requested_at: '2026-09-08T15:00:00Z' },
    { id: 'earlier', lot_number: '35', status: 'requested', requested_at: '2026-09-10T15:00:00Z' },
  ]

  assert.deepEqual(orderPumpOutWorkerStops(rows).map((row) => row.id), ['earlier', 'later'])
})

test('skipping moves the selected stop to the end without changing the original queue', () => {
  const rows = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  assert.deepEqual(movePumpOutStopToEnd(rows, 'one').map((row) => row.id), ['two', 'three', 'one'])
  assert.deepEqual(rows.map((row) => row.id), ['one', 'two', 'three'])
})

test('worker progress advances and finishes cleanly', () => {
  assert.deepEqual(pumpOutWorkerProgress(6, 0, 6), { current: 1, total: 6, remaining: 6, complete: false })
  assert.deepEqual(pumpOutWorkerProgress(6, 2, 4), { current: 3, total: 6, remaining: 4, complete: false })
  assert.deepEqual(pumpOutWorkerProgress(6, 6, 0), { current: 6, total: 6, remaining: 0, complete: true })
})
