import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { analyzeMigrationFiles } from '../scripts/audit-migrations.mjs'

test('migration audit detects unsafe clean-baseline inputs', () => {
  const report = analyzeMigrationFiles([
    { name: '001_change_existing.sql', sql: 'ALTER TABLE campers ADD COLUMN role text;' },
    { name: '002_seed.sql', sql: 'INSERT INTO campers (id) VALUES (1);' },
    { name: '002_cleanup.sql', sql: 'DELETE FROM campers;' },
  ])

  assert.equal(report.hasBootstrapMigration, false)
  assert.equal(report.safeForCleanBaseline, false)
  assert.deepEqual(report.duplicatePrefixes, [{
    prefix: '002',
    names: ['002_cleanup.sql', '002_seed.sql'],
  }])
  assert.deepEqual(report.dataChangingFiles, ['002_cleanup.sql', '002_seed.sql'])
})

test('repository migration history is explicitly blocked as a clean baseline', async () => {
  const directory = new URL('../migrations/', import.meta.url)
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql'))
  const files = await Promise.all(names.map(async (name) => ({
    name,
    sql: await readFile(new URL(name, directory), 'utf8'),
  })))
  const report = analyzeMigrationFiles(files)

  assert.equal(report.safeForCleanBaseline, false)
  assert.equal(report.hasBootstrapMigration, false)
  assert.ok(report.duplicatePrefixes.length > 0)
  assert.ok(report.dataChangingFiles.includes('009_go_live_reset_and_document_templates.sql'))
})
