import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isCompletedPumpOutWaitingForBilling,
  isPumpOutWaitingForService,
  isUnbilledPumpOutWork,
} from '../lib/pump-out-status.ts'

test('a completed unbilled pump-out does not block a new service request', () => {
  const completed = { status: 'completed', billed_at: null }

  assert.equal(isPumpOutWaitingForService(completed), false)
  assert.equal(isCompletedPumpOutWaitingForBilling(completed), true)
  assert.equal(isUnbilledPumpOutWork(completed), true)
})

test('only a requested unbilled pump-out is still waiting for service', () => {
  assert.equal(isPumpOutWaitingForService({ status: 'requested', billed_at: null }), true)
  assert.equal(isPumpOutWaitingForService({ status: 'requested', billed_at: '2026-09-08T12:00:00Z' }), false)
  assert.equal(isPumpOutWaitingForService({ status: 'cancelled', billed_at: null }), false)
})
