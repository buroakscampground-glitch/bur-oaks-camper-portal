self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()) })
self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  var url = String(data.url || '/community')
  if (!url.startsWith('/community')) url = '/community'
  var work = [self.registration.showNotification(data.title || 'Bur Oaks Community', {
    body: data.body || 'Something needs your attention.',
    icon: '/bur-oaks-logo.png', badge: '/bur-oaks-logo.png',
    tag: data.tag || 'bur-oaks-community', renotify: true, data: { url: url }
  })]
  var badgeCount = Math.max(0, Number(data.badgeCount == null ? 1 : data.badgeCount))
  if (self.navigator && self.navigator.setAppBadge && badgeCount > 0) work.push(self.navigator.setAppBadge(badgeCount))
  else if (self.navigator && self.navigator.clearAppBadge) work.push(self.navigator.clearAppBadge())
  event.waitUntil(Promise.all(work))
})
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = String((event.notification.data && event.notification.data.url) || '/community')
  if (!url.startsWith('/community')) url = '/community'
  event.waitUntil(self.clients.openWindow(new URL(url, self.location.origin).href))
})
