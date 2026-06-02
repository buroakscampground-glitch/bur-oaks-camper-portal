export default function HomePage() {
  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            textAlign: "center",
            maxWidth: "700px",
            margin: "60px auto",
          }}
        >
          <h1 style={{ fontSize: "48px" }}>
            🌳 Bur Oaks Campground
          </h1>

          <h2 style={{ color: "#2f5d3a" }}>
            A Site To Remember
          </h2>

          <p className="muted">
            Welcome to the Bur Oaks Camper Portal
          </p>

          <div
            style={{
              display: "flex",
              gap: "20px",
              justifyContent: "center",
              marginTop: "30px",
              flexWrap: "wrap",
            }}
          >
            <a href="/login">
              <button>
                Camper Portal Login
              </button>
            </a>

            <a href="/admin">
              <button>
                Admin Dashboard
              </button>
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}