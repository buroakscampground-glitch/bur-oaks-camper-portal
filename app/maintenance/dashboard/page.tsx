'use client'

export default function MaintenanceDashboard() {
  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
          }}
        >
          <p className="muted">BUR OAKS CAMPGROUND</p>

          <h1>🔧 Maintenance Dashboard</h1>

          <p className="muted">
            Maintenance Staff Access
          </p>
        </section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '25px',
          }}
        >
          <div className="card">
            <h3>Open Tickets</h3>
            <h1>0</h1>
          </div>

          <div className="card">
            <h3>In Progress</h3>
            <h1>0</h1>
          </div>

          <div className="card">
            <h3>Emergency</h3>
            <h1>0</h1>
          </div>
        </div>

        <section className="card">
          <h2>Maintenance Tickets</h2>

          <p className="muted">
            Ticket list coming next.
          </p>
        </section>
      </div>
    </main>
  )
}