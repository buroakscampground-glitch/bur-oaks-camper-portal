#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const copyData = /^COPY\s+(?:public\.)?\S+\s+.*FROM\s+stdin;/gim
const dumpDataInsert = /^INSERT\s+INTO\s+(?:public\.)?\S+\s+.*VALUES\s*\(/gim

function count(sql, pattern) {
  return (sql.match(pattern) ?? []).length
}

export function analyzeSchemaBaseline(sql) {
  const report = {
    tables: count(sql, /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\./gim),
    functions: count(sql, /^CREATE(?: OR REPLACE)? FUNCTION\s+public\./gim),
    indexes: count(sql, /^CREATE(?: UNIQUE)? INDEX\s+/gim),
    policies: count(sql, /^CREATE POLICY\s+/gim),
    triggers: count(sql, /^CREATE TRIGGER\s+/gim),
    rowLevelSecurityTables: count(sql, /^ALTER TABLE(?: ONLY)?\s+public\.\S+\s+ENABLE ROW LEVEL SECURITY;/gim),
    copyStatements: count(sql, copyData),
    rowInsertStatements: count(sql, dumpDataInsert),
  }

  const failures = []
  if (report.tables === 0) failures.push('no public tables were exported')
  if (report.rowLevelSecurityTables === 0) failures.push('no row-level-security settings were exported')
  if (report.policies === 0) failures.push('no row-level-security policies were exported')
  if (report.copyStatements > 0) failures.push('COPY statements would include table rows')
  if (report.rowInsertStatements > 0) failures.push('INSERT ... VALUES statements would include table rows')

  return { ...report, failures, safeToReview: failures.length === 0 }
}

function printReport(report) {
  console.log(`Public tables: ${report.tables}`)
  console.log(`Public functions: ${report.functions}`)
  console.log(`Indexes: ${report.indexes}`)
  console.log(`Policies: ${report.policies}`)
  console.log(`Triggers: ${report.triggers}`)
  console.log(`Tables with exported RLS enablement: ${report.rowLevelSecurityTables}`)
  console.log(`COPY data statements: ${report.copyStatements}`)
  console.log(`INSERT row statements: ${report.rowInsertStatements}`)
  console.log(`Safe for human review: ${report.safeToReview ? 'yes' : 'NO'}`)
  for (const failure of report.failures) console.error(`  Blocked: ${failure}`)
}

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const defaultFile = path.resolve(scriptDirectory, '..', 'database', 'baseline', '000_public_schema.sql')
  const file = path.resolve(process.argv[2] || defaultFile)
  const report = analyzeSchemaBaseline(await readFile(file, 'utf8'))
  printReport(report)
  if (!report.safeToReview) process.exitCode = 1
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) await main()
