import assert from 'node:assert/strict'
import test from 'node:test'
import {
  maskSmsPhone,
  uniqueSmsBroadcastRecipients,
  validSmsBroadcastRequestId,
} from '../lib/sms-broadcast.ts'

test('broadcast recipients are globally deduplicated after phone normalization', () => {
  const first = { id: 'camper-1', lot_number: '1' }
  const second = { id: 'camper-2', lot_number: '2' }
  const plan = uniqueSmsBroadcastRecipients([
    { camper: first, phones: ['618-555-0101', '+16185550102'] },
    { camper: second, phones: ['+1 (618) 555-0101', '6185550103'] },
  ])

  assert.deepEqual(plan.recipients.map((recipient) => recipient.phone), [
    '+16185550101',
    '+16185550102',
    '+16185550103',
  ])
  assert.equal(plan.candidateCount, 4)
  assert.equal(plan.duplicateCount, 1)
  assert.deepEqual(plan.recipients[0].matchedCamperIds, ['camper-1', 'camper-2'])
})

test('phone masks and campaign IDs are safe for the admin UI', () => {
  assert.equal(maskSmsPhone('(618) 555-0199'), '***-***-0199')
  assert.equal(validSmsBroadcastRequestId('3ea88f74-4b4a-4e89-9ec8-7d033f247f65'), true)
  assert.equal(validSmsBroadcastRequestId('repeat-this-message'), false)
})
