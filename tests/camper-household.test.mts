import assert from 'node:assert/strict'
import test from 'node:test'
import { camperHouseholdName, labeledCamperPhones } from '../lib/camper-household.ts'

test('shows both saved camper names', () => {
  assert.equal(camperHouseholdName({
    first_name: 'Sally',
    last_name: 'Weyhaupt',
    second_profile_first_name: 'Dave',
    second_profile_last_name: 'Weyhaupt',
  }), 'Sally Weyhaupt & Dave Weyhaupt')
})

test('labels each phone with its saved camper and hides duplicate phone fields', () => {
  assert.deepEqual(labeledCamperPhones({
    first_name: 'Sally',
    last_name: 'Weyhaupt',
    phone: '618-555-3810',
    alternate_phone: '618-555-0500',
    second_profile_first_name: 'Dave',
    second_profile_last_name: 'Weyhaupt',
    second_profile_phone: '618-555-0500',
  }), [
    { key: 'primary', name: 'Sally Weyhaupt', label: "Sally Weyhaupt's mobile number", phone: '618-555-3810' },
    { key: 'secondary', name: 'Dave Weyhaupt', label: "Dave Weyhaupt's mobile number", phone: '618-555-0500' },
  ])
})
