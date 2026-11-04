import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../migrations/20261104224114_restrict_trigger_audit_function_execution.sql', import.meta.url),
  'utf8',
)

const triggerFunctions = [
  'audit_account_credit_insert',
  'audit_season_renewal_change',
]

test('trigger-only SECURITY DEFINER functions are removed from the public RPC surface', () => {
  for (const functionName of triggerFunctions) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${functionName}\\(\\)\\s+FROM PUBLIC, anon, authenticated;`,
        'i',
      ),
    )
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\(\\)\\s+TO service_role;`,
        'i',
      ),
    )
  }
})

test('privilege hardening cannot mutate camper or billing rows or replace trigger bodies', () => {
  const executableSql = migration
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  assert.doesNotMatch(executableSql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
  assert.doesNotMatch(executableSql, /\bALTER\s+TABLE\b/i)
  assert.doesNotMatch(executableSql, /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i)
  assert.doesNotMatch(executableSql, /\bDROP\b/i)
  assert.doesNotMatch(executableSql, /FROM\s+service_role/i)
})
