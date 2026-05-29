export default function AdminPage() {
  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Admin Command Center</h1>
          <p className="muted">
            Manage campers, invoices, electric readings, documents, events, RSVPs, and announcements.
          </p>
        </section>

        <div className="grid grid-3">
          <a className="card admin-link" href="/admin/campers">
            <h2>Campers</h2>
            <p>Add, edit, and manage camper accounts.</p>
          </a>

          <a className="card admin-link" href="/admin/invoices">
            <h2>Invoices</h2>
            <p>Create individual camper invoices.</p>
          </a>

          <a className="card admin-link" href="/admin/electric">
            <h2>Electric</h2>
            <p>Enter meter readings and track usage.</p>
          </a>

          <a className="card admin-link" href="/admin/documents">
            <h2>Documents</h2>
            <p>Upload leases, rules, and camper files.</p>
          </a>

          <a className="card admin-link" href="/admin/events">
            <h2>Events</h2>
            <p>Create and manage campground events.</p>
          </a>

          <a className="card admin-link" href="/admin/rsvps">
            <h2>RSVPs</h2>
            <p>See who is attending each event.</p>
          </a>

          <a className="card admin-link" href="/admin/announcements">
            <h2>Announcements</h2>
            <p>Post updates and alerts to all campers.</p>
          </a>
        </div>
      </div>
    </main>
  )
}