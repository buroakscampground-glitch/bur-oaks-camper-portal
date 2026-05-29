export default function AdminPage() {
  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background: 'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: '25px',
              top: '20px',
              fontSize: '80px',
              opacity: 0.18,
            }}
          >
            🌳
          </div>

          <p className="muted">Bur Oaks Campground</p>
          <h1>Admin Command Center</h1>
          <p className="muted">
            Manage campers, invoices, electric readings, documents, and events from one place.
          </p>
        </section>

        <div className="grid grid-3">
          <a className="card admin-link" href="/admin/campers"><h2>Manage Campers</h2><p>Add, edit, and delete campers.</p></a>
          <a className="card admin-link" href="/admin/invoices"><h2>Create Invoice</h2><p>Bill one camper at a time.</p></a>
          <a className="card admin-link" href="/admin/electric"><h2>Electric Readings</h2><p>Enter usage and charges.</p></a>
          <a className="card admin-link" href="/admin/documents"><h2>Documents</h2><p>Upload leases and rules.</p></a>
          <a className="card admin-link" href="/admin/events"><h2>Events Calendar</h2><p>Manage campground events.</p></a>
        </div>
      </div>
    </main>
  )
}