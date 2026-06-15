'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { checkoutItems } from '../../lib/stripe'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
const [processingInvoiceId, setProcessingInvoiceId] = useState('')
  useEffect(() => {
    async function loadInvoices() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: camper } = await supabase
        .from('campers')
        .select('*')
        .eq('email', user.email)
        .single()

      if (!camper) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('camper_id', camper.id)
        .order('due_date', { ascending: false })

      setInvoices(data || [])
      setLoading(false)
    }

    loadInvoices()
  }, [])

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading invoices...</p>
  }

  const openInvoices = invoices.filter(
    (invoice) => invoice.status !== 'paid'
  )

  const openTotal = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_due || 0),
    0
  )

  const selectedTotal = invoices
    .filter((invoice) =>
      selectedInvoices.includes(invoice.id)
    )
    .reduce(
      (sum, invoice) =>
        sum + Number(invoice.total_due || 0),
      0
    )

  function toggleInvoice(id: string) {
    setSelectedInvoices((current) =>
      current.includes(id)
        ? current.filter(
            (invoiceId) => invoiceId !== id
          )
        : [...current, id]
    )
  }

  function selectAllOpen() {
    setSelectedInvoices(
      openInvoices.map((invoice) => invoice.id)
    )
  }

  function clearSelected() {
    setSelectedInvoices([])
  }

  function buildCheckoutItems(invoiceList: any[]) {
    return invoiceList.map((invoice) => ({
      name: `Invoice ${invoice.invoice_number}`,
      amount: Math.round(
        Number(invoice.total_due || 0) * 100
      ),
      currency: 'usd',
      quantity: 1,
    }))
  }

  async function handlePayment(invoicesToPay: any[]) {
    setCheckoutLoading(true)

    try {
      await checkoutItems(
  buildCheckoutItems(invoicesToPay),
  'https://bur-oaks-camper-portal.vercel.app/success',
'https://bur-oaks-camper-portal.vercel.app/invoices',
  invoicesToPay.map(
    (invoice) => invoice.id
  )
)
    } catch (error: any) {
      alert(
        error.message ||
          'Unable to start Stripe checkout.'
      )
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handlePaySelected() {
    const itemsToPay = invoices.filter(
      (invoice) =>
        selectedInvoices.includes(invoice.id)
    )

    if (itemsToPay.length === 0) return

    await handlePayment(itemsToPay)
  }

  async function handlePayInvoice(invoice: any) {
  setProcessingInvoiceId(invoice.id)

  try {
    await handlePayment([invoice])
  } finally {
    setProcessingInvoiceId('')
  }
}

  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 25,
              top: 20,
              fontSize: 80,
              opacity: 0.15,
            }}
          >
            🌳
          </div>

          <p className="muted">
  BUR OAKS CAMPGROUND
</p>

<h1 style={{ marginBottom: '25px' }}>
  💰 My Invoices
</h1>
<div
  style={{
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginTop: '20px',
    marginBottom: '25px',
  }}
>
  <div
  className="card"
  style={{
    padding: '20px',
    textAlign: 'center',
  }}
>
    <div className="stat-label">Open Balance</div>
    <div
  style={{
    fontSize: '32px',
    fontWeight: 700,
    color: '#2f5d3a',
  }}
>
      ${openTotal.toFixed(2)}
    </div>
  </div>

  <div
  className="card"
  style={{
    padding: '20px',
    textAlign: 'center',
  }}
>
    <div className="stat-label">Open Invoices</div>
   <div
  style={{
    fontSize: '32px',
    fontWeight: 700,
    color: '#2f5d3a',
  }}
>
      {openInvoices.length}
    </div>
  </div>

 <div
  className="card"
  style={{
    padding: '20px',
    textAlign: 'center',
  }}
>
    <div className="stat-label">Total Invoices</div>
  <div
  style={{
    fontSize: '32px',
    fontWeight: 700,
    color: '#2f5d3a',
  }}
>
      {invoices.length}
    </div>
  </div>

  <div
  className="card"
  style={{
    padding: '20px',
    textAlign: 'center',
  }}
>
    <div className="stat-label">Selected Total</div>
   <div
  style={{
    fontSize: '32px',
    fontWeight: 700,
    color: '#2f5d3a',
  }}
>
      ${selectedTotal.toFixed(2)}
    </div>
  </div>
</div>

<p
  className="muted"
  style={{ marginTop: '20px' }}
>
  Pay one invoice at a time or
  select multiple invoices together.
</p>
        </section>

        {openInvoices.length > 0 && (
          <section
            className="card"
            style={{ marginBottom: '25px' }}
          >
            <h2>Payment Selection</h2>

            <p className="muted">
              Selected Total:{' '}
              <strong>
                ${selectedTotal.toFixed(2)}
              </strong>
            </p>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <button onClick={selectAllOpen}>
                Select All Open Invoices
              </button>

              <button onClick={clearSelected}>
                Clear Selection
              </button>

              <button
                onClick={handlePaySelected}
                disabled={
                  selectedInvoices.length === 0 ||
                  checkoutLoading
                }
                style={{
                  opacity:
                    selectedInvoices.length === 0
                      ? 0.5
                      : 1,
                }}
              >
                {checkoutLoading
                  ? 'Processing…'
                  : 'Pay Selected Invoices'}
              </button>
            </div>
          </section>
        )}

        {invoices.length === 0 && (
          <section className="card">
            <h2>No invoices found</h2>

            <p className="muted">
              You do not currently have any
              invoices assigned to your
              account.
            </p>
          </section>
        )}

       <div
  className="grid"
  style={{
    gap: '25px',
    marginTop: '20px',
  }}
>
          {invoices.map((invoice) => {
            const isPaid =
              invoice.status === 'paid'

            const isSelected =
              selectedInvoices.includes(
                invoice.id
              )

            return (
              <section
  className="card invoice-card"
  key={invoice.id}
                style={{
                  borderLeft: `7px solid ${
                    isPaid
                      ? '#2f5d3a'
                      : '#b45309'
                  }`,
                  background: isSelected
                    ? '#f3f7ef'
                    : 'white',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'auto 1fr auto',
                    gap: '20px',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    {!isPaid && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          toggleInvoice(
                            invoice.id
                          )
                        }
                        style={{
                          width: '22px',
                          height: '22px',
                        }}
                      />
                    )}
                  </div>

                  <div>
                    <p
                      className="muted"
                      style={{ margin: 0 }}
                    >
                      Invoice
                    </p>

                    <h2
  style={{
    marginTop: '5px',
    marginBottom: '8px',
    fontSize: '28px',
  }}
>
  #{invoice.invoice_number}
</h2>

                    <p
  style={{
    fontWeight: 600,
    color: '#2f5d3a',
  }}
>
  {invoice.invoice_type}
</p>

                    <p className="muted">
                      Due Date:{' '}
                      {invoice.due_date}
                    </p>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                    }}
                  >
                    <h2
  style={{
    fontSize: '36px',
    margin: 0,
    color: '#1f2933',
  }}
>
                      $
                      {Number(
                        invoice.total_due || 0
                      ).toFixed(2)}
                    </h2>

                    <span
  className={
    isPaid
      ? 'status-paid'
      : 'status-open'
  }
>
  {isPaid ? 'Paid' : 'Open'}
</span>

                    {!isPaid ? (
                      <button
                        onClick={() =>
                          handlePayInvoice(
                            invoice
                          )
                        }
                       disabled={processingInvoiceId === invoice.id}
                      >
                        {processingInvoiceId === invoice.id
  ? 'Processing...'
  : 'Pay This Invoice'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}