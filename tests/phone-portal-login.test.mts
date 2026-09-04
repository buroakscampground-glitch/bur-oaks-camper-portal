import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverablePortalEmail, isPhonePortalLoginEmail, phonePortalLoginEmail, portalLoginEmail } from '../lib/phone-portal-login.ts'

test('a US mobile number maps to a private internal portal identity', () => {
  assert.equal(phonePortalLoginEmail('618-977-6266'), 'phone-16189776266@phone-login.buroakscampground.com')
  assert.equal(portalLoginEmail('(618) 977-6266'), 'phone-16189776266@phone-login.buroakscampground.com')
})

test('ordinary email login remains unchanged', () => {
  assert.equal(portalLoginEmail(' Camper@Example.com '), 'camper@example.com')
})

test('phone-only identities are never treated as deliverable email addresses', () => {
  const identity = phonePortalLoginEmail('618-977-6266')
  assert.equal(isPhonePortalLoginEmail(identity), true)
  assert.equal(deliverablePortalEmail(identity), '')
})
