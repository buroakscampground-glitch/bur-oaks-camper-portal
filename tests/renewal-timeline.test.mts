import assert from 'node:assert/strict'
import test from 'node:test'
import {
  renewalOfficeReviewDate,
  renewalResponseCountdownLabel,
  renewalResponseDaysRemaining,
  renewalResponseDueDate,
  renewalSendDate,
} from '../lib/renewal-timeline.ts'

test('renewal forms go out four months before expiration and are due three months before expiration', () => {
  assert.equal(renewalSendDate('2027-05-01'), '2027-01-01')
  assert.equal(renewalResponseDueDate('2027-05-01'), '2027-02-01')
})

test('renewal month shifting clamps safely at month ends and crosses years', () => {
  assert.equal(renewalSendDate('2028-03-31'), '2027-11-30')
  assert.equal(renewalResponseDueDate('2028-03-31'), '2027-12-31')
  assert.equal(renewalSendDate('2027-01-15'), '2026-09-15')
})

test('the office review begins two weeks before the renewal is sent', () => {
  assert.equal(renewalOfficeReviewDate('2027-05-01'), '2026-12-18')
})

test('the admin countdown shows time left, due today, and overdue renewals', () => {
  assert.equal(renewalResponseDaysRemaining('2027-05-01', '2027-01-15'), 17)
  assert.equal(renewalResponseCountdownLabel(17), '17 days left to sign')
  assert.equal(renewalResponseCountdownLabel(1), '1 day left to sign')
  assert.equal(renewalResponseCountdownLabel(0), 'Due today')
  assert.equal(renewalResponseCountdownLabel(-2), '2 days overdue')
})
