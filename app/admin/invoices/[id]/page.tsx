'use client'

export default function InvoiceDetailPage() {
  return (
    <div style={{ padding: '20px' }}>
      <button
        onClick={() => window.history.back()}
        style={{
          marginBottom: '20px',
        }}
      >
        ← Back
      </button>

      <h1>Invoice Detail Page</h1>

      <p>
        If you can see this page, dynamic routing is working.
      </p>
    </div>
  )
}