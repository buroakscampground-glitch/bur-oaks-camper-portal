import Link from 'next/link'

export default function SuccessPage() {
  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '80px', marginBottom: '20px' }}>🎉</div>
          <h1>Payment Successful</h1>
          <p className="muted">
            Thank you! Your payment has been completed and your invoice will be updated shortly.
          </p>
          <div style={{ marginTop: '25px' }}>
            <Link href="/invoices">
              <button>Return to Invoices</button>
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
