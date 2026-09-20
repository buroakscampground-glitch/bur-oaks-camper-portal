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

test('Rachel can review side dishes associated with every dinner', async () => {
  const source = await readFile(new URL('../app/admin/dinners/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /ALL MEALS/)
  assert.match(source, /Side dishes by dinner/)
  assert.match(source, /Suggested side dishes:/)
  assert.match(source, /Camper selections:/)
  assert.match(source, /saturdayDinners2026\.filter/)
})

test('dinner bring choices contain food only and never include ice', async () => {
  const { dinnerBringSuggestions } = await import('../lib/saturday-dinners.ts')
  const menus = ['Burger Bar', 'Lasagna', 'Crock Pot Night', 'Jambalaya', 'Fish Fry', 'Chili']
  const excluded = ['Drinks', 'Ice', 'Paper plates', 'Napkins', 'Plastic silverware', 'Cups', 'Paper bowls', 'Spoons']
  menus.forEach((menu) => {
    const choices = dinnerBringSuggestions(menu)
    excluded.forEach((item) => assert.equal(choices.includes(item), false, `${menu} should not offer ${item}`))
  })
})

test('Soup Day asks for different soups and keeps only crackers and cheese as suggestions', async () => {
  const { dinnerBringSuggestions, saturdayDinners2026 } = await import('../lib/saturday-dinners.ts')
  const dinner = saturdayDinners2026.find((item) => item.date === '2026-09-26')

  assert.equal(dinner?.menu, 'Many Different Kinds of Soups')
  assert.match(dinner?.note || '', /favorite soup/i)
  assert.deepEqual(dinnerBringSuggestions(dinner?.menu), ['Crackers', 'Shredded cheese'])
})

test('the September 19 dinner is only Cowboy Chicken Casserole', async () => {
  const { saturdayDinners2026 } = await import('../lib/saturday-dinners.ts')
  const { eventFlyers2026 } = await import('../lib/event-flyers.ts')
  const dinner = saturdayDinners2026.find((item) => item.date === '2026-09-19')

  assert.equal(dinner?.menu, 'Cowboy Chicken Casserole')
  assert.equal(dinner?.theme, undefined)
  assert.equal(eventFlyers2026.some((event) => event.slug === 'casino-night'), false)
})
