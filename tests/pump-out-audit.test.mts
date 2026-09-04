import assert from 'node:assert/strict'
import test from 'node:test'
import { pumpOutBillingLot, pumpOutDisplayNotes, pumpOutOrigin } from '../lib/pump-out-audit.ts'

test('pump-out audit identifies the initiating office administrator', () => {
  const notes = 'Initiated by office admin admin@example.com. Called the office.'
  assert.deepEqual(pumpOutOrigin(notes), {
    source: 'office',
    label: 'Office initiated',
    initiatedBy: 'admin@example.com',
  })
  assert.equal(pumpOutDisplayNotes(notes), 'Called the office.')
})

test('pump-out audit identifies camper portal requests and separate billing lots', () => {
  const notes = 'Service site TEMP 1; bill to Lot 18. Initiated from camper portal by camper@example.com.'
  assert.deepEqual(pumpOutOrigin(notes), {
    source: 'camper',
    label: 'Camper portal',
    initiatedBy: 'camper@example.com',
  })
  assert.equal(pumpOutBillingLot(notes, 'TEMP 1'), '18')
})

test('historical pump-outs do not claim an origin that was never recorded', () => {
  assert.equal(pumpOutOrigin(null).source, 'unknown')
})
