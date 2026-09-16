import assert from 'node:assert/strict'
import test from 'node:test'
import {
  renewalOfficeReviewDate,
  renewalResponseDueDate,
  renewalSendDate,
} from '../lib/renewal-timeline.ts'

test('renewal forms go out 60 days before expiration and are due 30 days before expiration', () => {
  assert.equal(renewalSendDate('2027-05-01'), '2027-03-02')
  assert.equal(renewalResponseDueDate('2027-05-01'), '2027-04-01')
})

test('renewal timing remains exact across leap day and year boundaries', () => {
  assert.equal(renewalSendDate('2028-03-31'), '2028-01-31')
  assert.equal(renewalResponseDueDate('2028-03-31'), '2028-03-01')
  assert.equal(renewalSendDate('2027-01-15'), '2026-11-16')
})

test('the office review begins two weeks before the renewal is sent', () => {
  assert.equal(renewalOfficeReviewDate('2027-05-01'), '2027-02-16')
})
