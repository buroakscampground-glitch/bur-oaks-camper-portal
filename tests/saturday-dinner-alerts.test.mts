import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('the dinner form politely explains one RSVP and a total head count', async () => {
  const source = await readFile(new URL('../app/dinners/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /One RSVP per campsite/)
  assert.match(source, /Total head count/)
  assert.match(source, /Please enter your total head count below/)
  assert.doesNotMatch(source, /Do not submit/)
})

test('Rachel dinner workspace shows every bring option and camper selection', async () => {
  const source = await readFile(new URL('../app/admin/dinners/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /dinnerBringSuggestions/)
  assert.match(source, /AVAILABLE CHOICES/)
  assert.match(source, /who selected it/)
  assert.match(source, /CAMPER ADDED/)
})

test('Rachel dinner workspace refreshes responses without a page reload', async () => {
  const source = await readFile(new URL('../app/admin/dinners/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /setInterval\(loadSignups, 15_000\)/)
  assert.match(source, /visibilitychange/)
  assert.match(source, /Live updates are on/)
})
