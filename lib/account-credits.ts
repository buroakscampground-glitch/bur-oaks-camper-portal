export function formatCreditMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export async function getCamperCreditBalance(client: any, camperId: string) {
  if (!camperId) return 0

  const { data, error } = await client
    .from('account_credits')
    .select('remaining_amount,status')
    .eq('camper_id', camperId)
    .eq('status', 'active')
    .gt('remaining_amount', 0)

  if (error?.code === '42P01' || error?.code === 'PGRST205') return 0
  if (error) throw error

  return Number((data || []).reduce((sum: number, credit: any) => sum + Number(credit.remaining_amount || 0), 0).toFixed(2))
}

export async function applyAvailableCreditsToInvoice({
  client,
  camperId,
  invoiceId,
  invoiceTotal,
  appliedBy,
}: {
  client: any
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
  client: any
  operationKey: string
  invoice: Record<string, unknown>
  items: Array<Record<string, unknown>>
  readings?: Array<Record<string, unknown>>
  pumpOutIds?: string[]
  siteServiceIds?: string[]
  newCredit?: Record<string, unknown> | null
  appliedBy?: string | null
}) {
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
    },
  }
}

export async function deleteInvoiceWithCreditRestore(client: any, invoiceId: string) {
  if (!invoiceId) return { restoredTotal: 0 }

  const { data, error } = await client.rpc('delete_invoice_with_credit_restore_atomic', {
    p_invoice_id: invoiceId,
  })

  if (error) {
    if (['42883', 'PGRST202'].includes(error.code || '')) {
      throw new Error('The billing security migration has not been installed yet.')
    }
    throw error
  }

  return { restoredTotal: Number(data || 0) }
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
  client: any
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
