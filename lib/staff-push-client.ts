import { supabase } from './supabase'

export async function removeStaffPushFromThisPhone() {
  if (!('serviceWorker' in navigator)) return
  try {
    const scopePath = window.location.pathname.startsWith('/admin') ? '/admin/' : '/community/'
    const registration = await navigator.serviceWorker.getRegistration(scopePath) || await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      await fetch('/api/staff-push-subscription', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
    }
    await subscription.unsubscribe()
  } catch (error) {
    console.error('Background staff alerts could not be removed from this phone:', error)
  }
}
