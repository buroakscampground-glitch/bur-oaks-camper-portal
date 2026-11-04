import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { gsm7Units, SMS_SINGLE_SEGMENT_LIMIT } from '../lib/sms-segments.ts'
import {
  pumpOutCompletionPortalMessage,
  pumpOutCompletionSms,
} from '../lib/pump-out-completion-copy.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('migrations/20261104230245_complete_pump_out_with_camper_alert.sql')
const route = read('app/api/maintenance-pump-outs/route.ts')
const adminPage = read('app/admin/pump-outs/page.tsx')
const workerPage = read('app/maintenance/dashboard/pumping/page.tsx')

test('pump-out completion copy is clear, campsite-specific, and one text segment', () => {
  const portal = pumpOutCompletionPortalMessage('TEMP 1')
  const sms = pumpOutCompletionSms('TEMP 1')

  assert.match(portal, /Site TEMP 1 has been completed/)
  assert.match(portal, /next electric bill/)
  assert.match(sms, /PUMP-OUT COMPLETE - Site TEMP 1/)
  assert.match(sms, /https:\/\/www\.buroakscampground\.com\/maintenance/)
  assert.ok(gsm7Units(sms) <= SMS_SINGLE_SEGMENT_LIMIT)
})

test('completion and the unread camper portal message are one atomic service-only operation', () => {
  for (const token of [
    'complete_sewer_pump_out_with_notification',
    'FOR UPDATE',
    "pump_request.status = 'completed'",
    "pump_request.status <> 'requested'",
    "UPDATE public.sewer_pump_out_requests",
    "INSERT INTO public.office_messages",
    "'Bur Oaks Office'",
    'read_by_camper_at',
    'RETURN QUERY SELECT to_jsonb(pump_request), false, to_jsonb(camper_message)',
    'FROM PUBLIC, anon, authenticated',
    'TO service_role',
  ]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  assert.match(migration, /text_reminders_pump_out_completion_once_idx/)
  assert.match(migration, /WHERE reminder_type = 'Pump-Out Complete'/)
})

test('both completion screens use the protected route and report the camper alert', () => {
  assert.match(route, /rpc\('complete_sewer_pump_out_with_notification'/)
  assert.match(route, /sendPumpOutCompletionText/)
  assert.match(route, /No duplicate camper alert was sent/)
  assert.match(route, /Camper portal alert saved/)
  assert.match(adminPage, /fetch\('\/api\/maintenance-pump-outs'/)
  assert.match(adminPage, /requestId: id/)
  assert.doesNotMatch(adminPage, /if \(status === 'completed'\) payload\.completed_at/)
  assert.match(workerPage, /alerts the camper/)
  assert.match(workerPage, /Camper portal alert and text sent/)
})
