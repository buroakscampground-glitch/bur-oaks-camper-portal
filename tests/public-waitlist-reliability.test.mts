import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const form = await readFile(new URL('../app/availability/WaitlistInterestForm.tsx', import.meta.url), 'utf8')

test('public interest submissions resist duplicates and explain unconfirmed delivery safely', () => {
  assert.match(form, /submissionLock\.current \|\| submitted/)
  assert.match(form, /submissionLock\.current = true/)
  assert.match(form, /controller\.abort\(\), 20_000/)
  assert.match(form, /could not confirm whether your inquiry was received/i)
  assert.match(form, /before trying again, so your name is not added twice/i)
})

test('public interest fields match server limits and expose accessible progress', () => {
  assert.match(form, /required maxLength=\{80\}/)
  assert.match(form, /type="tel" inputMode="tel" maxLength=\{40\}/)
  assert.match(form, /type="email" maxLength=\{120\}/)
  assert.match(form, /maxLength=\{900\}/)
  assert.match(form, /aria-busy=\{submitting\}/)
  assert.match(form, /role=\{submitted \? 'status' : 'alert'\}/)
})

test('prospect funnel events contain stages but no contact details', () => {
  assert.match(form, /membership_inquiry_started/)
  assert.match(form, /membership_inquiry_validation_error/)
  assert.match(form, /membership_inquiry_submitted/)
  assert.match(form, /membership_inquiry_failed/)
  assert.doesNotMatch(form, /trackPublicEvent\([^\n]+\{[^\n]*(?:email|phone|firstName|lastName)/)
})
