import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { campgroundSettingKeys, loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { enforceableSiteCareTemplates, siteCareEnforcementFor, storedSiteCareTemplateKey } from '../../../lib/site-care-enforcement'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const oneTimeKey = 'site-care-enroll-30-2026-09-01'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Service key missing.' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const execute = new URL(request.url).searchParams.get('execute') === '1'

  const { error: settingError } = execute
    ? await admin.from('app_settings').upsert({
        key: campgroundSettingKeys.siteServiceTrashPickup,
        value: '30',
        description: 'Default charge for trash pickup.',
        updated_at: new Date().toISOString(),
        updated_by: 'Codex approved site care update',
      })
    : { error: null }
  if (settingError) return NextResponse.json({ error: settingError.message }, { status: 500 })

  const settings = await loadCampgroundBillingSettings(admin)
  const { data: notices, error } = await admin
    .from('site_care_notices')
    .select('id,lot_number,template_key,title,message,status,due_date')
    .neq('status', 'Resolved')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eligible = []
  const skipped = []
  for (const notice of notices || []) {
    const templateKey = String(notice.template_key || '').replace(/^auto:/, '').split(':')[0]
    const canEnroll = ['Open', 'Acknowledged'].includes(String(notice.status))
      && Boolean(notice.due_date)
      && enforceableSiteCareTemplates.has(templateKey)
      && !String(notice.template_key || '').startsWith('auto:')
    if (!canEnroll) {
      skipped.push({ id: notice.id, lot: notice.lot_number, title: notice.title, status: notice.status, dueDate: notice.due_date, reason: !enforceableSiteCareTemplates.has(templateKey) ? 'not safe grounds work' : !notice.due_date ? 'no completion date' : notice.status === 'Ready for Review' ? 'already ready for review' : String(notice.template_key || '').startsWith('auto:') ? 'already enrolled' : 'not active' })
      continue
    }

    const enforcement = siteCareEnforcementFor(templateKey, settings)
    if (!enforcement) {
      skipped.push({ id: notice.id, lot: notice.lot_number, title: notice.title, reason: 'price unavailable' })
      continue
    }
    const storedKey = storedSiteCareTemplateKey(templateKey, true, enforcement.chargeAmount)
    const disclosure = `If this is not marked ready for office review by the automatic date, Bur Oaks will create an approved grounds work order and add the ${enforcement.serviceLabel.toLowerCase()} charge of $${enforcement.chargeAmount.toFixed(2)} to your next electric bill.`
    const nextMessage = String(notice.message || '').includes('approved grounds work order')
      ? notice.message
      : `${String(notice.message || '').trim()} ${disclosure}`.trim().slice(0, 1200)

    if (execute) {
      const { error: updateError } = await admin.from('site_care_notices').update({ template_key: storedKey, message: nextMessage }).eq('id', notice.id).in('status', ['Open', 'Acknowledged'])
      if (updateError) return NextResponse.json({ error: updateError.message, noticeId: notice.id }, { status: 500 })
    }
    eligible.push({ id: notice.id, lot: notice.lot_number, title: notice.title, dueDate: notice.due_date, charge: enforcement.chargeAmount, storedKey })
  }

  return NextResponse.json({ success: true, execute, trashPickupPrice: 30, eligible, skipped })
}
