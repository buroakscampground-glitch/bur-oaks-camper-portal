export default function Nav() {
  return (
    <nav className="nav">
      <a href="/" className="nav-brand">🌳 Bur Oaks Portal</a>

      <a href="/" className="nav-link">Home</a>
      <a href="/login" className="nav-link">Login</a>
      <a href="/invoices" className="nav-link">Invoices</a>
      <a href="/electric" className="nav-link">Electric</a>
      <a href="/documents" className="nav-link">Documents</a>
      <a href="/calendar" className="nav-link">Events</a>
      <a href="/admin" className="nav-link">Admin</a>
      <a href="/admin/announcements" className="nav-link">Announcements</a>
      <a href="/admin/events" className="nav-link">Manage Events</a>
      <a href="/admin/rsvps" className="nav-link">RSVPs</a>
    </nav>
  )
}