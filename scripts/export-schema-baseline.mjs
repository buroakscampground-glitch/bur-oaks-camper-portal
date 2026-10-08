#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { analyzeSchemaBaseline } from './audit-schema-baseline.mjs'

const productionProjectRef = 'mzywctpxnpejglnspyqi'
const productionDatabaseUrl = `postgresql://postgres.${productionProjectRef}@aws-1-us-west-1.pooler.supabase.com:5432/postgres`
const databasePassword = process.env.BUR_OAKS_PRODUCTION_DB_PASSWORD || ''
const pgDumpBinary = process.env.BUR_OAKS_PG_DUMP_BINARY || 'pg_dump'

function fail(message) {
  console.error(`Blocked: ${message}`)
  process.exit(1)
}

if (!databasePassword) {
  fail('set BUR_OAKS_PRODUCTION_DB_PASSWORD for this command only; never save it in .env or Git')
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')
const outputDirectory = path.join(repositoryRoot, 'database', 'baseline')
const outputFile = path.join(outputDirectory, '000_public_schema.sql')
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'bur-oaks-schema-baseline-'))
const temporaryFile = path.join(temporaryDirectory, '000_public_schema.sql')

function redact(value) {
  return value.replaceAll(databasePassword, '[REDACTED_PASSWORD]')
}

try {
  const result = spawnSync(
    pgDumpBinary,
    [
      '--dbname',
      productionDatabaseUrl,
      '--schema-only',
      '--schema',
      'public',
      '--no-owner',
      '--no-privileges',
      '--file',
      temporaryFile,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: databasePassword },
    },
  )

  if (result.status !== 0) {
    const detail = redact(`${result.stderr || ''}\n${result.stdout || ''}`.trim())
    fail(`PostgreSQL schema export failed${detail ? `:\n${detail}` : ''}`)
  }

  const sql = await readFile(temporaryFile, 'utf8')
  const report = analyzeSchemaBaseline(sql)
  if (!report.safeToReview) {
    fail(`the generated file failed the data-free safety audit: ${report.failures.join('; ')}`)
  }

  await mkdir(outputDirectory, { recursive: true })
  await rename(temporaryFile, outputFile)
  console.log(`Created data-free schema candidate: ${path.relative(repositoryRoot, outputFile)}`)
  console.log(`Tables ${report.tables}; functions ${report.functions}; policies ${report.policies}; RLS tables ${report.rowLevelSecurityTables}`)
  console.log('Next: inspect the complete SQL diff before applying it to staging.')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
