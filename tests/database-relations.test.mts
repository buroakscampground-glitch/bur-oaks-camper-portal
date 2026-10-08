import assert from 'node:assert/strict'
import test from 'node:test'
import { oneRelationship } from '../lib/database-relations.ts'

test('Supabase relationships normalize object and one-row array responses identically', () => {
  const camper = { first_name: 'Camper', lot_number: '12' }
  assert.deepEqual(oneRelationship(camper), camper)
  assert.deepEqual(oneRelationship([camper]), camper)
})

test('missing and empty Supabase relationships normalize to null', () => {
  assert.equal(oneRelationship([]), null)
  assert.equal(oneRelationship(null), null)
  assert.equal(oneRelationship(undefined), null)
})
