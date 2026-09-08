import assert from 'node:assert/strict'
import test from 'node:test'
import { isUnchangedDinnerSignup } from '../lib/saturday-dinner-signup-state.ts'

test('an identical Saturday dinner response is unchanged', () => {
  assert.equal(isUnchangedDinnerSignup({
    attending_status: 'Going',
    bringing: 'Chips',
    guest_count: 2,
  }, {
    status: 'Going',
    bringing: 'Chips',
    guestCount: 2,
  }), true)
})

test('a real Saturday dinner response change still needs an alert', () => {
  const existing = {
    attending_status: 'Going',
    bringing: 'Chips',
    guest_count: 2,
  }

  assert.equal(isUnchangedDinnerSignup(existing, { status: 'Maybe', bringing: 'Chips', guestCount: 2 }), false)
  assert.equal(isUnchangedDinnerSignup(existing, { status: 'Going', bringing: 'Dessert', guestCount: 2 }), false)
  assert.equal(isUnchangedDinnerSignup(existing, { status: 'Going', bringing: 'Chips', guestCount: 3 }), false)
})
