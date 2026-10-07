#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const migrationName = /^(\d+)_.*\.sql$/
const dataMutation = /\b(insert\s+into|update|delete\s+from|truncate)\b/i
const destructiveDdl = /\b(drop\s+(table|schema|column)|alter\s+table[\s\S]{0,160}\bdrop\b)\b/i
const tableCreation = /\bcreate\s+table\b/i
const existingTableChange = /\balter\s+table\b/i

function withoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
}

export function analyzeMigrationFiles(files) {
  const numbered = files
    .filter((file) => migrationName.test(file.name))
    .map((file) => ({ ...file, prefix: file.name.match(migrationName)[1] }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))

  const prefixes = new Map()
  for (const file of numbered) {
    const matches = prefixes.get(file.prefix) || []
    matches.push(file.name)
    prefixes.set(file.prefix, matches)
  }

  const duplicatePrefixes = [...prefixes.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([prefix, names]) => ({ prefix, names }))

  const classified = numbered.map((file) => {
    const sql = withoutComments(file.sql)
    return {
      name: file.name,
      changesData: dataMutation.test(sql),
      destructiveDdl: destructiveDdl.test(sql),
      createsTable: tableCreation.test(sql),
      altersExistingTable: existingTableChange.test(sql),
    }
  })

  const first = classified[0]
  const hasBootstrapMigration = Boolean(first?.createsTable && !first?.altersExistingTable)

  return {
    migrationCount: numbered.length,
    hasBootstrapMigration,
    duplicatePrefixes,
    dataChangingFiles: classified.filter((file) => file.changesData).map((file) => file.name),
    destructiveDdlFiles: classified.filter((file) => file.destructiveDdl).map((file) => file.name),
    safeForCleanBaseline:
      hasBootstrapMigration &&
      duplicatePrefixes.length === 0 &&
      classified.every((file) => !file.changesData && !file.destructiveDdl),
  }
}

async function loadMigrations(directory) {
  const names = await readdir(directory)
  return Promise.all(
    names
      .filter((name) => name.endsWith('.sql'))
      .map(async (name) => ({ name, sql: await readFile(path.join(directory, name), 'utf8') })),
  )
}

function printReport(report) {
  console.log(`Migration files: ${report.migrationCount}`)
  console.log(`Clean bootstrap migration: ${report.hasBootstrapMigration ? 'yes' : 'NO'}`)
  console.log(`Safe to replay as a clean baseline: ${report.safeForCleanBaseline ? 'yes' : 'NO'}`)
  console.log(`Duplicate numeric prefixes: ${report.duplicatePrefixes.length}`)
  for (const duplicate of report.duplicatePrefixes) {
    console.log(`  ${duplicate.prefix}: ${duplicate.names.join(', ')}`)
  }
  console.log(`Files containing data-changing SQL: ${report.dataChangingFiles.length}`)
  for (const name of report.dataChangingFiles) console.log(`  ${name}`)
  console.log(`Files containing destructive DDL: ${report.destructiveDdlFiles.length}`)
  for (const name of report.destructiveDdlFiles) console.log(`  ${name}`)
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDirectory = path.resolve(scriptDirectory, '..', 'migrations')
  const report = analyzeMigrationFiles(await loadMigrations(migrationsDirectory))
  printReport(report)

  if (process.argv.includes('--require-clean-baseline') && !report.safeForCleanBaseline) {
    console.error('\nBlocked: migrations/ is historical production change history, not a clean-room database baseline.')
    process.exitCode = 1
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) await main()
