import assert from 'node:assert/strict'
import test from 'node:test'
import { communityPostAuthor, communityPostLocation } from '../lib/community-branding.ts'

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
