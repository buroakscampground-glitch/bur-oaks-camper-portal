import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('Community is prominently linked from both home screens', () => {
  const camperHome = source('../app/portal/page.tsx')
  const adminHome = source('../app/admin/page.tsx')

  assert.match(camperHome, /className="portal-community-home-link" href="\/campground-community"/)
  assert.match(adminHome, /className="admin-community-home-link" href="\/admin\/community-feed"/)
  assert.match(adminHome, /title: 'Community feed'/)
})

test('the Event Coordinator workspace includes the administrative Community Feed', () => {
  const coordinatorHome = source('../app/community/page.tsx')
  const coordinatorNavigation = source('../components/CommunityChrome.tsx')
  const coordinatorFeed = source('../app/community/feed/page.tsx')

  assert.match(coordinatorHome, /href: '\/community\/feed'/)
  assert.match(coordinatorNavigation, /href: '\/community\/feed'/)
  assert.match(coordinatorFeed, /<CommunityFeed adminMode \/>/)
})
