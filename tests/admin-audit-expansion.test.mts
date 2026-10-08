import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/088_expand_admin_audit_coverage.sql', import.meta.url), 'utf8')
const profileRoute = readFileSync(new URL('../app/api/admin-camper-profile/route.ts', import.meta.url), 'utf8')
const profilePage = readFileSync(new URL('../app/admin/campers/[id]/page.tsx', import.meta.url), 'utf8')
const renewalRoute = readFileSync(new URL('../app/api/admin-renewals/route.ts', import.meta.url), 'utf8')
const renewalPage = readFileSync(new URL('../app/admin/renewals/page.tsx', import.meta.url), 'utf8')
const auditRoute = readFileSync(new URL('../app/api/admin-audit-events/route.ts', import.meta.url), 'utf8')
const auditPage = readFileSync(new URL('../app/admin/audit-log/page.tsx', import.meta.url), 'utf8')
const chrome = readFileSync(new URL('../components/AdminChrome.tsx', import.meta.url), 'utf8')

test('camper profile and rent changes are constrained, atomic, reasoned, and server routed', () => {
  for (const token of [
    'update_camper_profile_audited','update_camper_rent_terms_audited','SECURITY DEFINER','FOR UPDATE',
    "jsonb_typeof(p_patch)<>'object'",'protected field','before_values','after_values','camper_profile_updated',
    'camper_rent_terms_updated','p_annual_rent<0','p_annual_rent>1000000','GRANT EXECUTE','service_role',
  ]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const field of [
    'lot_number','first_name','last_name','email','secondary_email','phone','alternate_phone',
    'second_profile_first_name','second_profile_last_name','second_profile_phone','mailing_address_line1',
    'mailing_address_line2','mailing_city','mailing_state','mailing_zip','role','emergency_contact_name',
    'emergency_contact_phone','vehicle_make','vehicle_model','license_plate','vehicle_2_make','vehicle_2_model',
    'vehicle_2_license_plate','golf_cart_make','golf_cart_color','directory_opt_in','directory_show_phone',
    'sms_opt_in','sms_opt_in_at','camper_since_date','office_notes','rent_payment_plan',
  ]) assert.match(migration, new RegExp(`'${field}'`))
  for (const forbidden of ["'id'","'active'","'created_at'","'auth_user_id'"]) {
    const allowlist = migration.slice(migration.indexOf("WHERE key NOT IN"), migration.indexOf(')\n  ) THEN'))
    assert.doesNotMatch(allowlist, new RegExp(forbidden))
  }
  assert.match(profileRoute, /profileFields/)
  assert.match(profileRoute, /Object\.keys\(incoming\)\.some/)
  assert.match(profileRoute, /reason\.length < 5/)
  assert.match(profileRoute, /update_camper_profile_audited/)
  assert.match(profileRoute, /update_camper_rent_terms_audited/)
  assert.match(profilePage, /updateCamperProfileAudited/)
  assert.match(profilePage, /updateCamperRentTermsAudited/)
  assert.match(profilePage, /permanent campsite history/)
  assert.doesNotMatch(profilePage, /\.from\('campers'\)\s*\.update\(\{/)
  assert.doesNotMatch(profilePage, /\.from\('lots'\)\.update\(\{ lot_rent_amount/)
})

test('renewal overrides require a reason and write the immutable event in the same row transaction', () => {
  for (const token of [
    'ADD COLUMN IF NOT EXISTS audit_reason','ADD COLUMN IF NOT EXISTS audit_actor','audit_season_renewal_change',
    'BEFORE INSERT OR UPDATE','renewal_override','OLD.status','NEW.status','OLD.contract_end_date','NEW.contract_end_date',
    'OLD.annual_rent','NEW.annual_rent','NEW.audit_reason := NULL','NEW.audit_actor := NULL',
  ]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const action of ['save','approve','decline','clear','mark-sent','send-nonrenewal','signed-previous-system','confirm-signature-exempt']) {
    assert.match(renewalRoute, new RegExp(`'${action}'`))
  }
  assert.match(renewalRoute, /auditReason\.length < 5/)
  assert.match(renewalRoute, /audit_reason: auditReason/)
  assert.match(renewalRoute, /audit_actor: auditActor/)
  assert.match(renewalRoute, /update_camper_profile_audited/)
  assert.match(renewalPage, /Why is this renewal record being changed/)
  assert.match(renewalPage, /reason\.length < 5/)
  assert.match(renewalPage, /reason,/)
})

test('every newly inserted account credit, including an electric-billing credit, receives one durable audit event', () => {
  for (const token of [
    'audit_account_credit_insert','AFTER INSERT ON public.account_credits','account_credit_created',
    'NEW.original_amount','NEW.remaining_amount','NEW.created_by','NEW.reason','account_credits_insert_audit',
  ]) assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const replacement = migration.slice(migration.lastIndexOf('CREATE OR REPLACE FUNCTION public.create_account_credit_audited'))
  assert.doesNotMatch(replacement, /INSERT INTO public\.admin_audit_events/)
  const bundleMigration = readFileSync(new URL('../migrations/042_security_and_billing_hardening.sql', import.meta.url), 'utf8')
  assert.match(bundleMigration, /p_new_credit IS NOT NULL/)
  assert.match(bundleMigration, /INSERT INTO public\.account_credits/)
})

test('the office-wide audit workspace is admin-only, searchable, filterable, and directly linked', () => {
  for (const token of [
    'getAuthenticatedContext','Admin access is required','admin_audit_events','Cache-Control','no-store',
    'before_state','after_state','actor_email','financial','Math.min(500',
  ]) assert.match(auditRoute, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const token of [
    'IMMUTABLE OFFICE HISTORY','Search lot, camper, reason, or administrator','Money','Renewals','Profiles',
    'before_state','after_state','actor_email','/admin/campers/','No audit events match this view','Try again',
  ]) assert.match(auditPage, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(chrome, /\/admin\/audit-log/)
  assert.match(chrome, /Office Audit Trail/)
})
