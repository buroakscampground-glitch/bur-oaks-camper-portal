self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  var title = data.title || 'Bur Oaks'
  var options = {
    body: data.body || 'Something needs your attention.',
    icon: '/bur-oaks-logo.png',
    badge: '/bur-oaks-logo.png',
    tag: data.tag || 'bur-oaks-staff',
    renotify: true,
    data: { url: data.url || '/' }
  }
  var work = [self.registration.showNotification(title, options)]
  if (self.navigator && self.navigator.setAppBadge) {
    work.push(self.navigator.setAppBadge(Math.max(1, Number(data.badgeCount || 1))))
  }
  event.waitUntil(Promise.all(work))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var destination = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    for (var i = 0; i < clients.length; i += 1) {
      if ('navigate' in clients[i] && 'focus' in clients[i]) return clients[i].navigate(destination).then(function (client) { return client.focus() })
    }
    return self.clients.openWindow ? self.clients.openWindow(destination) : undefined
  }))
})
