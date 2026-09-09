import assert from 'node:assert/strict'
import test from 'node:test'
import { communityActorAuthor, communityPostAuthor, communityPostLocation } from '../lib/community-branding.ts'

test('official posts are clearly presented as Bur Oaks instead of a personal admin', () => {
  const post = { is_official: true, author_name: 'Personal Admin Name', lot_number: 'OFFICE' }
  assert.equal(communityPostAuthor(post), 'Bur Oaks Campground')
  assert.equal(communityPostLocation(post), 'Posted by the Bur Oaks office')
})

test('camper posts keep the camper name and lot', () => {
  const post = { is_official: false, author_name: 'Sample Camper', lot_number: '41' }
  assert.equal(communityPostAuthor(post), 'Sample Camper')
  assert.equal(communityPostLocation(post), 'Lot 41')
})

test('the event coordinator posts as a shortened personal name', () => {
  assert.equal(communityActorAuthor({ first_name: 'Rachel', last_name: 'Finley', role: 'event_coordinator' }), 'Rachel F')
  assert.equal(communityActorAuthor({ first_name: 'Sample', last_name: 'Camper', role: 'camper' }), 'Sample Camper')
})
