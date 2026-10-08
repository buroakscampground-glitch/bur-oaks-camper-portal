import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { emergencyBannerLevel, emergencyBannerMessage } from '../lib/emergency-banner.ts'

test('an absent emergency message keeps the banner hidden', () => {
  assert.equal(emergencyBannerMessage(undefined), '')
  assert.equal(emergencyBannerMessage('   '), '')
})

test('emergency copy is normalized and bounded', () => {
  assert.equal(emergencyBannerMessage('  Gate closed\nuntil 9 AM.  '), 'Gate closed until 9 AM.')
  assert.equal(emergencyBannerMessage('x'.repeat(700)).length, 500)
})

test('unknown severity fails safe to urgent styling', () => {
  assert.equal(emergencyBannerLevel('notice'), 'notice')
  assert.equal(emergencyBannerLevel('anything'), 'urgent')
  assert.equal(emergencyBannerLevel(undefined), 'urgent')
})

test('the root banner is server-rendered, assertive, and has an office call action', () => {
  const component = readFileSync(new URL('../components/EmergencyBanner.tsx', import.meta.url), 'utf8')
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(component, /use client|supabase|fetch\(/)
  assert.match(component, /role="alert" aria-live="assertive"/)
  assert.match(component, /href="tel:6184887927"/)
  assert.match(layout, /<EmergencyBanner \/>/)
})
