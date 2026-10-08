import { execFileSync, spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const STAGING_REF = 'pgstmfovnzsgrkawzivc'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`
const CREDENTIAL_SERVICE = 'Codex MCP Credentials'
const CREDENTIAL_ACCOUNT = 'supabase|400707e8a250a19d'
const TEST_PASSWORD_SERVICE = 'Bur Oaks Staging Test Accounts'

function keychainPassword(service, account) {
  return execFileSync('/usr/bin/security', [
    'find-generic-password', '-w', '-s', service, '-a', account,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function run(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

const credential = JSON.parse(keychainPassword(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT))
const managementToken = credential?.token_response?.access_token
if (!managementToken) throw new Error('The saved project-scoped Supabase credential is unavailable.')

const response = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${managementToken}` },
})
if (!response.ok) throw new Error(`Staging API-key lookup failed with HTTP ${response.status}.`)

const keys = await response.json()
const anonKey = keys.find((key) => key.name === 'anon' && key.type === 'legacy')?.api_key
const serviceRoleKey = keys.find((key) => key.name === 'service_role' && key.type === 'legacy')?.api_key
if (!anonKey || !serviceRoleKey) throw new Error('The isolated staging keys could not be resolved.')

const stagingAdmin = createClient(STAGING_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const buckets = await stagingAdmin.storage.listBuckets()
if (buckets.error) throw buckets.error
if (!(buckets.data || []).some((bucket) => bucket.id === 'meter-reading-photos')) {
  const created = await stagingAdmin.storage.createBucket('meter-reading-photos', {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  })
  if (created.error) throw created.error
}

const safeSystemNames = ['PATH', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM', 'CI', 'FORCE_COLOR', 'NO_COLOR']
const environment = Object.fromEntries(safeSystemNames.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []))
Object.assign(environment, {
  NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3111',
  SITE_URL: 'http://127.0.0.1:3111',
  BUR_OAKS_STAGING_E2E: '1',
  BUR_OAKS_STAGING_WRITE_E2E: '1',
  BUR_OAKS_STAGING_CAMPER_PASSWORD: keychainPassword(TEST_PASSWORD_SERVICE, 'camper.one@staging.buroaks.invalid'),
  BUR_OAKS_STAGING_ADMIN_PASSWORD: keychainPassword(TEST_PASSWORD_SERVICE, 'office.admin@staging.buroaks.invalid'),
  BUR_OAKS_STAGING_MAINTENANCE_PASSWORD: keychainPassword(TEST_PASSWORD_SERVICE, 'maintenance.staff@staging.buroaks.invalid'),
})

for (const name of [
  'ADMIN_ALERT_EMAIL', 'ADMIN_ALERT_EMAILS', 'ADMIN_ALERT_PHONE', 'ADMIN_ALERT_PHONES',
  'CRON_SECRET', 'OPENAI_API_KEY', 'RESEND_API_KEY', 'SENDGRID_API_KEY', 'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET', 'TAWK_WEBHOOK_SECRET', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VERCEL_OIDC_TOKEN',
  'PAYMENT_REPORT_EMAIL', 'PAYMENT_REPORT_PRINTER_EMAILS', 'PUMP_OUT_ADDITIONAL_PRINTER_EMAILS',
  'PUMP_OUT_PRINTER_EMAIL', 'PUMP_OUT_REPORT_EMAIL', 'PUMP_OUT_SECOND_PRINTER_EMAIL',
]) environment[name] = ''

console.log(`Building against isolated staging project ${STAGING_REF}; all delivery and payment providers are disabled.`)
run('npm', ['run', 'build'], environment)
run('node_modules/.bin/playwright', [
  'test',
  'tests/e2e/staging-authenticated.spec.ts',
  'tests/e2e/staging-write-paths.spec.ts',
  '--project=phone-360',
], environment)
