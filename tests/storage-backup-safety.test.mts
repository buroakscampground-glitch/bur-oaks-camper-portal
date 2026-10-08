import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const backup = readFileSync(new URL('../scripts/backup-storage.mjs', import.meta.url), 'utf8')
const guide = readFileSync(new URL('../docs/operations/storage-backup.md', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('Storage backup is fixed to production and requires explicit runtime-only authority', () => {
  assert.match(backup, /mzywctpxnpejglnspyqi/)
  assert.match(backup, /supabaseUrl !== expectedUrl/)
  assert.match(backup, /SUPABASE_SERVICE_ROLE_KEY is required at runtime/)
  assert.match(backup, /BUR_OAKS_STORAGE_BACKUP_CONFIRM_PROJECT/)
  assert.match(backup, /passphrase\.length < 20/)
  assert.doesNotMatch(backup, /service_role\s*=\s*['"][A-Za-z0-9]/i)
})

test('Storage backup refuses unsafe destinations and never invents one', () => {
  assert.match(backup, /outside the repository, temporary folders, and filesystem root/)
  assert.match(backup, /destination must already exist/)
  assert.match(backup, /safeObjectPath/)
  assert.match(backup, /\.partial/)
  assert.match(backup, /rename\(partialFile, finalFile\)/)
})

test('Storage backup encrypts, authenticates, verifies, and receipts every object', () => {
  assert.match(backup, /aes-256-gcm/)
  assert.match(backup, /scryptSync/)
  assert.match(backup, /setAuthTag/)
  assert.match(backup, /sha256/)
  assert.match(backup, /verifyEncryptedArchive/)
  assert.match(backup, /restored object checksum mismatch/)
  assert.match(backup, /archiveSha256/)
  assert.match(backup, /verified: true/)
  assert.match(backup, /rm\(workspace, \{ recursive: true, force: true \}\)/)
})

test('Storage backup is operator-visible and documented without saving secrets', () => {
  assert.equal(packageJson.scripts['storage:backup'], 'node scripts/backup-storage.mjs')
  assert.match(guide, /read -s/)
  assert.match(guide, /external encrypted drive or approved off-site folder/i)
  assert.match(guide, /Never place the passphrase/)
  assert.match(guide, /receipt\.json/)
})
