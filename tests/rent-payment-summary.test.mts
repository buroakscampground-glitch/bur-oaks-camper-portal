import assert from 'node:assert/strict'
import test from 'node:test'
import { rentPaymentBreakdown } from '../lib/rent-payment-summary.ts'

test('a displayed annual rent is broken into four grandfathered quarterly payments', () => {
  const schedule = rentPaymentBreakdown(1500, 'quarterly', '2000-01-08')

  assert.equal(schedule?.label, 'Grandfathered quarterly')
  assert.deepEqual(schedule?.payments, [
    { number: 1, amount: 375, dueDate: '2000-01-08' },
    { number: 2, amount: 375, dueDate: '2000-04-08' },
    { number: 3, amount: 375, dueDate: '2000-07-08' },
    { number: 4, amount: 375, dueDate: '2000-10-08' },
  ])
})

test('standard annual rent is broken into two exact half-payments', () => {
  const schedule = rentPaymentBreakdown(1500, 'semiannual', '2000-01-08')

  assert.equal(schedule?.label, 'Half-and-half')
  assert.deepEqual(schedule?.payments, [
    { number: 1, amount: 750, dueDate: '2000-01-08' },
    { number: 2, amount: 750, dueDate: '2000-07-08' },
  ])
})

test('penny remainders remain exact across the displayed schedule', () => {
  const schedule = rentPaymentBreakdown(1500.01, 'quarterly')
  assert.deepEqual(schedule?.payments.map((payment) => payment.amount), [375.01, 375, 375, 375])
  assert.equal(schedule?.payments.reduce((total, payment) => total + payment.amount, 0), 1500.01)
})
