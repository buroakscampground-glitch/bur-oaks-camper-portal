import Link from 'next/link'

export default function WebhookTestPage() {
  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ padding: '30px' }}>
          <h1>Stripe Webhook Test</h1>
          <p className="muted">
            This page helps you confirm that your Stripe webhook endpoint is reachable and configured correctly.
          </p>

          <div style={{ marginTop: '20px' }}>
            <h2>Webhook endpoint</h2>
            <p>
              <code>{`/api/stripe-webhook`}</code>
            </p>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h2>Test setup</h2>
            <p className="muted">
              In development, use the Stripe CLI to forward events to your local app.
            </p>
            <pre style={{ background: '#f8f8f8', padding: '15px', borderRadius: '8px' }}>
              <code>
                stripe listen --forward-to http://localhost:3000/api/stripe-webhook
              </code>
            </pre>
            <pre style={{ background: '#f8f8f8', padding: '15px', borderRadius: '8px' }}>
              <code>
                stripe trigger checkout.session.completed
              </code>
            </pre>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h2>Next steps</h2>
            <ol>
              <li>Verify your `.env.local` includes <code>STRIPE_WEBHOOK_SECRET</code>.</li>
              <li>Run the Stripe CLI and forward events to your local webhook endpoint.</li>
              <li>Use <code>stripe trigger checkout.session.completed</code> to send a test event.</li>
            </ol>
          </div>

          <div style={{ marginTop: '30px' }}>
            <Link href="/invoices">
              <button>Return to Invoices</button>
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
