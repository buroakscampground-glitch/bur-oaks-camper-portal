import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeProspectPipeline, summarizeWaitlistFollowUp } from '../lib/waitlist-follow-up.ts'

const now = new Date('2026-10-08T18:00:00Z')

test('website inquiries expose useful setup and tour context without changing the record', () => {
  const summary = summarizeWaitlistFollowUp({
    status: 'Waiting',
    created_at: '2026-10-06T18:00:00Z',
    notes: 'Camper type: Fifth wheel\n\nCamper length: 35 ft\n\nCampground tour requested. Preferred date: 2026-10-12. Preferred time: Morning.\n\nSubmitted from public website availability form.',
  }, now)
  assert.equal(summary.source, 'Website inquiry')
  assert.equal(summary.camperSummary, 'Fifth wheel · 35 ft')
  assert.equal(summary.tourRequested, true)
  assert.equal(summary.nextAction, 'Contact applicant')
  assert.equal(summary.needsFollowUp, true)
  assert.equal(summary.ageLabel, '2 days on list')
})

test('next actions follow the existing waitlist lifecycle', () => {
  assert.equal(summarizeWaitlistFollowUp({ status: 'Contacted', notes: 'Campground tour requested.' }, now).nextAction, 'Schedule requested tour')
  assert.equal(summarizeWaitlistFollowUp({ status: 'Contacted' }, now).nextAction, 'Continue fit conversation')
  assert.equal(summarizeWaitlistFollowUp({ status: 'Accepted' }, now).nextAction, 'Assign a site and convert')
  assert.equal(summarizeWaitlistFollowUp({ status: 'Converted' }, now).needsFollowUp, false)
  assert.equal(summarizeWaitlistFollowUp({ status: 'Removed' }, now).nextAction, 'No follow-up required')
})

test('dated follow-ups, tours, and offers sort the office toward the next action', () => {
  const overdue = summarizeWaitlistFollowUp({ status: 'Contacted', next_follow_up_on: '2026-10-07' }, now)
  assert.equal(overdue.followUpOverdue, true)
  assert.equal(overdue.priority, 0)
  assert.match(overdue.nextAction, /overdue/i)

  const tour = summarizeWaitlistFollowUp({ status: 'Contacted', tour_scheduled_at: '2026-10-12T15:00:00Z' }, now)
  assert.equal(tour.stage, 'Tour scheduled')
  assert.match(tour.nextAction, /Prepare for tour/)

  const offer = summarizeWaitlistFollowUp({ status: 'Contacted', offer_made_at: '2026-10-08T15:00:00Z', next_follow_up_on: '2026-10-10' }, now)
  assert.equal(offer.stage, 'Offer')
  assert.match(offer.nextAction, /Follow up on offer/)
})

test('pipeline totals distinguish current work from recent success', () => {
  const totals = summarizeProspectPipeline([
    { status: 'Waiting', created_at: '2026-10-05T12:00:00Z' },
    { status: 'Contacted', tour_scheduled_at: '2026-10-12T15:00:00Z' },
    { status: 'Accepted', offer_made_at: '2026-10-08T15:00:00Z' },
    { status: 'Converted', converted_at: '2026-10-02T15:00:00Z' },
    { status: 'Converted', converted_at: '2026-08-02T15:00:00Z' },
  ], now)
  assert.deepEqual(totals, { active: 3, needsFollowUp: 2, tours: 1, offers: 1, converted30Days: 1 })
})

test('manual records and missing dates degrade honestly', () => {
  const summary = summarizeWaitlistFollowUp({ status: 'Waiting', notes: 'Met at the office.' }, now)
  assert.equal(summary.source, 'Office entry')
  assert.equal(summary.camperSummary, 'Camper details not provided')
  assert.equal(summary.ageLabel, 'Date unavailable')
})
