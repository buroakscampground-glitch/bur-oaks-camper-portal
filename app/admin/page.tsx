export default function AdminPage() {
  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>Admin Dashboard</h1>

      <p>Manage your campground portal from one place.</p>

      <div style={{ display: 'grid', gap: '15px', maxWidth: '500px' }}>
        <a href="/admin/campers">Manage Campers</a>
        <a href="/admin/invoices">Create Invoices</a>
        <a href="/admin/electric">Electric Readings</a>
        <a href="/admin/documents">Documents</a>
        <a href="/admin/events">Events Calendar</a>
      </div>
    </main>
  )
}