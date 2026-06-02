'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { checkoutItems } from '../../lib/stripe'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

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
        `${window.location.origin}/success`,
        `${window.location.origin}/invoices`,
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
    await handlePayment([invoice])
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

          <h1>💰 My Invoices</h1>

          <h2 style={{ color: '#2f5d3a' }}>
            ${openTotal.toFixed(2)} Open Balance
          </h2>

          <h3 style={{ color: '#b45309' }}>
            {openInvoices.length} Open Invoice
            {openInvoices.length !== 1 ? 's' : ''}
          </h3>

          <p className="muted">
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

        <div className="grid">
          {invoices.map((invoice) => {
            const isPaid =
              invoice.status === 'paid'

            const isSelected =
              selectedInvoices.includes(
                invoice.id
              )

            return (
              <section
                className="card"
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
                      }}
                    >
                      {invoice.invoice_number}
                    </h2>

                    <p>
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
                        fontSize: '32px',
                        margin: 0,
                      }}
                    >
                      $
                      {Number(
                        invoice.total_due || 0
                      ).toFixed(2)}
                    </h2>

                    <p
                      style={{
                        color: isPaid
                          ? '#2f5d3a'
                          : '#b45309',
                        fontWeight: 'bold',
                      }}
                    >
                      {isPaid
                        ? '🟢 Paid'
                        : '🔴 Open'}
                    </p>

                    {!isPaid ? (
                      <button
                        onClick={() =>
                          handlePayInvoice(
                            invoice
                          )
                        }
                        disabled={
                          checkoutLoading
                        }
                      >
                        {checkoutLoading
                          ? 'Processing…'
                          : 'Pay This Invoice'}
                      </button>
                    ) : (
                      <button
                        disabled
                        style={{
                          opacity: 0.6,
                        }}
                      >
                        Paid
                      </button>
                    )}
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