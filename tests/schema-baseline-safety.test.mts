import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { analyzeSchemaBaseline } from '../scripts/audit-schema-baseline.mjs'

const exporter = await readFile(new URL('../scripts/export-schema-baseline.mjs', import.meta.url), 'utf8')

const safeSchema = `
CREATE TABLE public.campers (id uuid PRIMARY KEY);
ALTER TABLE public.campers ENABLE ROW LEVEL SECURITY;
CREATE POLICY campers_self ON public.campers USING (true);
CREATE INDEX campers_id_idx ON public.campers (id);
`

test('schema baseline audit accepts structure without records', () => {
  const report = analyzeSchemaBaseline(safeSchema)
  assert.equal(report.safeToReview, true)
  assert.equal(report.tables, 1)
  assert.equal(report.copyStatements, 0)
  assert.equal(report.rowInsertStatements, 0)
})

test('schema baseline audit blocks copied or inserted rows', () => {
  for (const unsafeSql of [
    `${safeSchema}\nCOPY public.campers (id) FROM stdin;\nabc\n\\.`,
    `${safeSchema}\nINSERT INTO public.campers (id) VALUES ('abc');`,
  ]) {
    const report = analyzeSchemaBaseline(unsafeSql)
    assert.equal(report.safeToReview, false)
    assert.ok(report.failures.some((failure) => failure.includes('table rows')))
  }
})

test('schema export fixes the production target and keeps credentials out of arguments', () => {
  assert.match(exporter, /postgres\.\$\{productionProjectRef\}@aws-1-us-west-1\.pooler\.supabase\.com/)
  assert.match(exporter, /PGPASSWORD: databasePassword/)
  assert.match(exporter, /replaceAll\(databasePassword, '\[REDACTED_PASSWORD\]'\)/)
  assert.match(exporter, /--schema[\s\S]*'public'/)
  assert.doesNotMatch(exporter, /'--password'/)
  assert.doesNotMatch(exporter, /console\.log\(databasePassword\)/)
})
