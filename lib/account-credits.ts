import type { SupabaseClient } from '@supabase/supabase-js'
import { isLotRentExemptCamper, isNoBillingLot } from './billing-exemptions'

type CreditBalanceRow = { remaining_amount?: number | string | null; status?: string | null }
type InvoiceDraft = Record<string, unknown> & {
  camper_id?: unknown
  invoice_type?: unknown
  total_due?: unknown
  due_date?: unknown
}

export function formatCreditMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export async function getCamperCreditBalance(client: SupabaseClient, camperId: string) {
  if (!camperId) return 0

  const { data, error } = await client
    .from('account_credits')
    .select('remaining_amount,status')
    .eq('camper_id', camperId)
    .eq('status', 'active')
    .gt('remaining_amount', 0)

  if (error?.code === '42P01' || error?.code === 'PGRST205') return 0
  if (error) throw error

  const credits = (data || []) as CreditBalanceRow[]
  return Number(credits.reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0).toFixed(2))
}

export async function applyAvailableCreditsToInvoice({
  client,
  camperId,
  invoiceId,
  invoiceTotal,
  appliedBy,
}: {
  client: SupabaseClient
  camperId: string
  invoiceId: string
  invoiceTotal: number
  appliedBy?: string | null
}) {
  const startingTotal = Number(invoiceTotal || 0)

  if (!camperId || !invoiceId || startingTotal <= 0) {
    return { appliedTotal: 0, remainingDue: startingTotal, paidInFull: startingTotal <= 0 }
  }

  const { data, error } = await client.rpc('apply_account_credits_to_invoice_atomic', {
    p_camper_id: camperId,
    p_invoice_id: invoiceId,
    p_invoice_total: startingTotal,
    p_applied_by: appliedBy || null,
  })

  if (error) {
    if (['42883', 'PGRST202'].includes(error.code || '')) {
      throw new Error('The billing security migration has not been installed yet.')
    }
    throw error
  }

  return {
    appliedTotal: Number(data?.appliedTotal || 0),
    remainingDue: Number(data?.remainingDue ?? startingTotal),
    paidInFull: data?.paidInFull === true,
    heldUntilDue: data?.heldUntilDue === true,
    dueDate: data?.dueDate || null,
  }
}

export async function createInvoiceBundle({
  client,
  operationKey,
  invoice,
  items,
  readings = [],
  pumpOutIds = [],
  siteServiceIds = [],
  newCredit = null,
  appliedBy = null,
}: {
  client: SupabaseClient
  operationKey: string
  invoice: InvoiceDraft
  items: Array<Record<string, unknown>>
  readings?: Array<Record<string, unknown>>
  pumpOutIds?: string[]
  siteServiceIds?: string[]
  newCredit?: Record<string, unknown> | null
  appliedBy?: string | null
}) {
  const camperId = String(invoice.camper_id || '').trim()
  if (camperId) {
    const { data: camper, error: camperError } = await client
      .from('campers')
      .select('lot_number,first_name,last_name')
      .eq('id', camperId)
      .maybeSingle()
    if (camperError) throw camperError
    const lotNumber = camper?.lot_number
    if (isNoBillingLot(lotNumber)) {
      throw new Error(`Lot ${lotNumber} is a no-billing camper site. No invoice was created or sent.`)
    }
    const invoiceType = String(invoice.invoice_type || '')
    if (/rent/i.test(invoiceType) && !/association/i.test(invoiceType) && isLotRentExemptCamper(camper || {})) {
      throw new Error('Charlie Kimball is a staff camper and is exempt from lot rent. No lot-rent invoice was created or sent.')
    }
  }

  const { data, error } = await client.rpc('create_invoice_bundle_atomic', {
    p_operation_key: operationKey,
    p_invoice: invoice,
    p_items: items,
    p_readings: readings,
    p_pump_out_ids: pumpOutIds,
    p_site_service_ids: siteServiceIds,
    p_new_credit: newCredit,
    p_applied_by: appliedBy,
  })

  if (error) {
    if (['42883', 'PGRST202'].includes(error.code || '')) {
      throw new Error('The billing security migration has not been installed yet.')
    }
    throw error
  }

  const createdInvoice = data?.invoice
  if (!createdInvoice?.id) throw new Error('The invoice could not be verified after creation.')

  return {
    invoice: createdInvoice,
    duplicate: data?.duplicate === true,
    credit: {
      appliedTotal: Number(data?.credit?.appliedTotal || 0),
      remainingDue: Number(data?.credit?.remainingDue ?? invoice.total_due ?? 0),
      paidInFull: data?.credit?.paidInFull === true,
      heldUntilDue: data?.credit?.heldUntilDue === true,
      dueDate: data?.credit?.dueDate || invoice.due_date || null,
    },
  }
}

export async function deleteInvoiceWithCreditRestore(client: SupabaseClient, invoiceId: string, reason: string) {
  if (!invoiceId) return { restoredTotal: 0 }
  const { data } = await client.auth.getSession()
  const response = await fetch('/api/admin-invoice-delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, reason }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The invoice could not be deleted.')
  return { restoredTotal: Number(result.restoredTotal || 0) }
}

export async function updateInvoiceBundle({
  client,
  invoiceId,
  invoiceNumber,
  invoiceType,
  dueDate,
  lateFee,
  items,
}: {
  client: SupabaseClient
  invoiceId: string
  invoiceNumber: string
  invoiceType: string
  dueDate?: string | null
  lateFee: number
  items: Array<{ description: string; quantity: number; unit_price: number }>
}) {
  const { data, error } = await client.rpc('update_invoice_bundle_atomic', {
    p_invoice_id: invoiceId,
    p_invoice_number: invoiceNumber,
    p_invoice_type: invoiceType,
    p_due_date: dueDate || null,
    p_late_fee: lateFee,
    p_items: items,
  })

  if (error) {
    if (['42883', 'PGRST202'].includes(error.code || '')) {
      throw new Error('The invoice editing migration has not been installed yet.')
    }
    throw error
  }

  return data
}
