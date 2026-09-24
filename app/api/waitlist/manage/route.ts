import { createClient } from '@supabase/supabase-js'
import { createAdminNotification } from '../../../../lib/admin-notifications'
import { readWaitlistManageToken, waitlistRemovalAlert } from '../../../../lib/waitlist-check-in'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function page(title: string, message: string, token = '') {
  const form = token
    ? `<form method="post"><input type="hidden" name="token" value="${token.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"><button type="submit">Yes, I am no longer interested</button></form>`
    : ''
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f5f1e8;color:#26382d;font-family:Arial,sans-serif}.card{max-width:560px;margin:10vh auto;padding:34px;background:#fff;border:1px solid #e2dccf;border-radius:22px;box-shadow:0 22px 55px rgba(38,61,46,.12)}small{color:#8a6c35;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{font:500 36px/1.1 Georgia,serif}p{font-size:17px;line-height:1.65}button{width:100%;min-height:52px;margin-top:14px;border:0;border-radius:999px;background:#214b31;color:#fff;font-size:16px;font-weight:800;cursor:pointer}a{color:#2f5b3b;font-weight:700}@media(max-width:620px){.card{margin:24px 16px;padding:26px}}</style></head><body><main class="card"><small>Bur Oaks Campground</small><h1>${title}</h1><p>${message}</p>${form}<p><a href="https://www.buroakscampground.com">Return to Bur Oaks Campground</a></p></main></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const payload = readWaitlistManageToken(token)
  if (!payload) return page('This link is not valid', 'Please contact the Bur Oaks office if you would like us to update your waitlist information.')
  return page('Remove your name from the waitlist?', 'Only choose the button below if you no longer want us to contact you about a future seasonal site.', token)
}

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return page('Please contact the office', 'We could not update the waitlist right now. Please call (618) 488-7927.')
  const form = await request.formData()
  const payload = readWaitlistManageToken(String(form.get('token') || ''))
  if (!payload) return page('This link is not valid', 'Please contact the Bur Oaks office if you would like us to update your waitlist information.')

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: removedEntry, error } = await admin
    .from('waitlist')
    .update({ status: 'Removed', removed_at: new Date().toISOString() })
    .eq('id', payload.id)
    .ilike('email', payload.email)
    .neq('status', 'Removed')
    .is('removed_at', null)
    .select('id,first_name,last_name,email')
    .maybeSingle()

  if (error) return page('Please contact the office', 'We could not update the waitlist right now. Please call (618) 488-7927.')
  if (!removedEntry) return page('You are already removed', 'Your name is no longer active on the Bur Oaks seasonal-site waitlist.')

  const alert = waitlistRemovalAlert(removedEntry)
  await createAdminNotification(admin, {
    type: 'waitlist_removal',
    title: alert.title,
    message: alert.message,
    source_table: 'waitlist',
    source_id: String(removedEntry.id),
  }).catch((notificationError) => console.error('Waitlist removal alert failed:', notificationError))

  return page('You have been removed', 'Your name is no longer active on the Bur Oaks seasonal-site waitlist. If your plans change, you are always welcome to contact us again.')
}
