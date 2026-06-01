import Link from 'next/link'

export default function CancelPage() {
  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '80px', marginBottom: '20px' }}>⚠️</div>
          <h1>Payment Cancelled</h1>
          <p className="muted">
            Your payment was not completed. You can try again from your invoices page.
          </p>
          <div style={{ marginTop: '25px' }}>
            <Link href="/invoices">
              <button>Back to Invoices</button>
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
