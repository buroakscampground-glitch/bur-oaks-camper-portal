self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()) })
self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  var url = String(data.url || '/admin')
  if (!url.startsWith('/admin')) url = '/admin'
  var work = [self.registration.showNotification(data.title || 'Bur Oaks Admin', {
    body: data.body || 'Something needs your attention.',
    icon: '/bur-oaks-logo.png', badge: '/bur-oaks-logo.png',
    tag: data.tag || 'bur-oaks-admin', renotify: true, data: { url: url }
  })]
  if (self.navigator && self.navigator.setAppBadge) work.push(self.navigator.setAppBadge(Math.max(1, Number(data.badgeCount || 1))))
  event.waitUntil(Promise.all(work))
})
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = String((event.notification.data && event.notification.data.url) || '/admin')
  if (!url.startsWith('/admin')) url = '/admin'
  event.waitUntil(self.clients.openWindow(new URL(url, self.location.origin).href))
})
