'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type AuditResult = {
  checked: number
  mismatches: Array<Record<string, unknown>>
  inconclusive: Array<Record<string, unknown>>
  clearQuarterly: number
  clearSemiannual: number
}

function amount(invoice: any) {
  const subtotal = Number(invoice.subtotal || 0)
  return subtotal > 0 ? subtotal : Math.max(0, Number(invoice.total_due || 0) - Number(invoice.late_fee || 0))
}

export default function PaymentPlanAuditPage() {
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function audit() {
      const [camperResult, lotResult, invoiceResult] = await Promise.all([
        supabase.from('campers').select('id,first_name,last_name,lot_number,rent_payment_plan,role,active').eq('active', true),
        supabase.from('lots').select('lot_number,lot_rent_amount'),
        supabase.from('invoices').select('id,camper_id,invoice_type,subtotal,total_due,late_fee,due_date,status').gte('due_date', '2025-09-23').limit(5000),
      ])
      const queryError = camperResult.error || lotResult.error || invoiceResult.error
      if (queryError) throw queryError

      const rents = new Map((lotResult.data || []).map((lot: any) => [String(lot.lot_number || '').trim().toUpperCase(), Number(lot.lot_rent_amount || 0)]))
      const invoicesByCamper = new Map<string, any[]>()
      for (const invoice of invoiceResult.data || []) {
        const type = String(invoice.invoice_type || '').toLowerCase()
        const status = String(invoice.status || '').toLowerCase()
        if (!type.includes('rent') || (!type.includes('lot') && !type.includes('site'))) continue
        if (['cancelled', 'canceled', 'void', 'refunded'].includes(status)) continue
        const id = String(invoice.camper_id || '')
        invoicesByCamper.set(id, [...(invoicesByCamper.get(id) || []), invoice])
      }

      const records = (camperResult.data || []).flatMap((camper: any) => {
        if (['admin', 'maintenance', 'event_coordinator'].includes(String(camper.role || '').toLowerCase())) return []
        const annual = rents.get(String(camper.lot_number || '').trim().toUpperCase()) || 0
        const amounts = (invoicesByCamper.get(String(camper.id)) || []).map(amount).filter((value) => value > 0)
        const quarterMatches = annual > 0 ? amounts.filter((value) => Math.abs(value - annual / 4) < 0.01).length : 0
        const halfMatches = annual > 0 ? amounts.filter((value) => Math.abs(value - annual / 2) < 0.01).length : 0
        const evidence = quarterMatches > 0 && halfMatches === 0 ? 'quarterly' : halfMatches > 0 && quarterMatches === 0 ? 'semiannual' : 'inconclusive'
        const saved = String(camper.rent_payment_plan || '').toLowerCase() === 'quarterly' ? 'quarterly' : 'semiannual'
        return [{
          lot: camper.lot_number,
          camper: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
          annual,
          saved,
          evidence,
          invoiceAmounts: [...new Set(amounts)].sort((a, b) => a - b),
          mismatch: evidence !== 'inconclusive' && evidence !== saved,
        }]
      })

      setResult({
        checked: records.length,
        clearQuarterly: records.filter((record) => record.evidence === 'quarterly').length,
        clearSemiannual: records.filter((record) => record.evidence === 'semiannual').length,
        mismatches: records.filter((record) => record.mismatch),
        inconclusive: records.filter((record) => record.evidence === 'inconclusive'),
      })
    }
    audit().catch((problem) => setError(problem?.message || 'Audit failed'))
  }, [])

  return <main style={{ padding: 32, background: 'white', color: '#183d2c' }}>
    <h1>Payment plan audit</h1>
    {error && <p>{error}</p>}
    {!result && !error && <p>Checking every active camper…</p>}
    {result && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>{JSON.stringify(result, null, 2)}</pre>}
  </main>
}
