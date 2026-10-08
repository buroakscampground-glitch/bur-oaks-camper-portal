import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewSmsLinks } from '../lib/sms-link-review.ts'

test('text link review recognizes official and external secure destinations', () => {
  const review = reviewSmsLinks('Account: https://www.buroakscampground.com/invoices Weather: https://weather.gov')
  assert.deepEqual(review.officialLinks, ['https://www.buroakscampground.com/invoices'])
  assert.deepEqual(review.externalLinks, ['https://weather.gov'])
  assert.deepEqual(review.blockedLinks, [])
})

test('text link review blocks insecure, credential-bearing, and shortened links', () => {
  const review = reviewSmsLinks('No http://example.com, https://user:pass@example.com, or https://bit.ly/abc.')
  assert.deepEqual(review.blockedLinks, [
    'http://example.com',
    'https://user:pass@example.com',
    'https://bit.ly/abc',
  ])
})

test('text link review deduplicates links and ignores ordinary punctuation', () => {
  const review = reviewSmsLinks('Open www.buroakscampground.com/portal. Again: www.buroakscampground.com/portal!')
  assert.deepEqual(review.links, ['www.buroakscampground.com/portal'])
  assert.equal(review.officialLinks.length, 1)
})
