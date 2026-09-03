import assert from 'node:assert/strict'
import test from 'node:test'
import {
  announcementRemoveOnDate,
  formatAnnouncementRemoveDate,
  isAnnouncementExpired,
} from '../lib/announcement-expiration.ts'

test('a Friday through Sunday campground schedule comes down Monday', () => {
  const announcement = {
    title: 'Labor Day Weekend Schedule & Heat Reminder',
    message: 'FRIDAY food. SATURDAY music. SUNDAY bags tournament.',
    created_at: '2026-09-03T00:50:00.000Z',
  }
  assert.equal(announcementRemoveOnDate(announcement), '2026-09-07')
  assert.equal(isAnnouncementExpired(announcement, new Date('2026-09-07T13:00:00.000Z')), true)
})

test('an announcement with a written date expires the next Central day', () => {
  const announcement = {
    title: 'Pool work September 12',
    message: 'The pool will be unavailable.',
    created_at: '2026-09-02T16:00:00.000Z',
  }
  assert.equal(announcementRemoveOnDate(announcement), '2026-09-13')
  assert.equal(formatAnnouncementRemoveDate('2026-09-13'), 'Sunday, September 13')
})

test('today and tomorrow notices expire without lingering', () => {
  const today = { title: 'Breakfast is ready', message: 'Come to the clubhouse.', created_at: '2026-09-02T15:00:00.000Z' }
  const tomorrow = { title: 'Tomorrow', message: 'Water will be off tomorrow.', created_at: '2026-09-02T15:00:00.000Z' }
  assert.equal(announcementRemoveOnDate(today), '2026-09-03')
  assert.equal(announcementRemoveOnDate(tomorrow), '2026-09-04')
})

test('ordinary permanent office information never auto-expires', () => {
  const announcement = {
    title: 'Office contact information',
    message: 'Use the portal to contact the office whenever you need help.',
    created_at: '2026-09-02T15:00:00.000Z',
  }
  assert.equal(announcementRemoveOnDate(announcement), null)
  assert.equal(isAnnouncementExpired(announcement, new Date('2030-01-01T00:00:00.000Z')), false)
})
