import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('New Year’s Eve is promoted on the camper home screen with one-tap choices', () => {
  const source = read('app/portal/page.tsx')

  assert.match(source, /event\.event_date === '2026-12-31'/)
  assert.match(source, /className="portal-nye-rsvp"/)
  assert.match(source, /Choose your New Year’s Eve RSVP/)
  assert.match(source, /> Going/)
  assert.match(source, />\s*Maybe\s*</)
  assert.match(source, /Can’t make it/)
  assert.match(source, /aria-pressed=/)
  assert.match(source, /You can change this anytime/)
})

test('portal RSVPs use authenticated server identity and never accept a camper id', () => {
  const portal = read('app/portal/page.tsx')
  const route = read('app/api/event-rsvp/route.ts')

  assert.match(portal, /fetch\('\/api\/event-rsvp'/)
  assert.match(portal, /JSON\.stringify\(\{ eventId, response: responseValue \}\)/)
  assert.doesNotMatch(portal, /JSON\.stringify\(\{ eventId, camperId/)
  assert.match(route, /camper_id', context\.camper\.id/)
  assert.match(route, /camper_id: context\.camper\.id/)
  assert.match(route, /uuidPattern\.test\(eventId\)/)
  assert.match(route, /allowedResponses\.includes\(response\)/)
})

test('an RSVP change updates an existing response instead of deleting it', () => {
  const route = read('app/api/event-rsvp/route.ts')

  assert.match(route, /\.update\(\{ response \}\)/)
  assert.match(route, /\.insert\(\{ event_id: event\.id, camper_id: context\.camper\.id, response \}\)/)
  assert.doesNotMatch(route, /from\('event_rsvps'\)\s*\.delete\(/s)
})
