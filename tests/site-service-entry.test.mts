import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSiteServiceHistory,
  normalizeSiteNumber,
  validateSiteServiceEntry,
} from '../lib/site-service-entry.ts'

test('site confirmation accepts common lot labels but rejects a different site', () => {
  assert.equal(normalizeSiteNumber(' Lot 14 '), '14')
  assert.equal(normalizeSiteNumber('site Temp-1'), 'temp1')
  assert.equal(validateSiteServiceEntry({
    reportedBy: 'Patrick Horn',
    reason: 'Requested a pressure wash',
    confirmedSite: 'Lot 14',
    expectedSite: '14',
  }), '')
  assert.match(validateSiteServiceEntry({
    reportedBy: 'Patrick Horn',
    reason: 'Requested a pressure wash',
    confirmedSite: '15',
    expectedSite: '14',
  }), /does not match Lot 14/)
})

test('site service entries require reporter, reason, and site confirmation', () => {
  assert.match(validateSiteServiceEntry({ reportedBy: '', reason: 'Needed', confirmedSite: '14', expectedSite: '14' }), /person reporting/)
  assert.match(validateSiteServiceEntry({ reportedBy: 'Patrick', reason: '', confirmedSite: '14', expectedSite: '14' }), /why this work/)
  assert.match(validateSiteServiceEntry({ reportedBy: 'Patrick', reason: 'Needed', confirmedSite: '', expectedSite: '14' }), /Type site 14/)
})

test('saved history preserves who, why, and the confirmed site', () => {
  assert.equal(buildSiteServiceHistory({
    reportedBy: 'Patrick Horn',
    reason: 'Requested a pressure wash',
    expectedSite: '14',
  }), 'Reported by: Patrick Horn\nReason: Requested a pressure wash\nConfirmed site: 14')
})
