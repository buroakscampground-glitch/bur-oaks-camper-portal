export default function Nav() {
  return (
    <nav
      style={{
        background: '#2f5d3a',
        color: 'white',
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: '22px',
        flexWrap: 'wrap',
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
        fontFamily: 'Arial',
      }}
    >
      <a
        href="/"
        style={{
          color: 'white',
          textDecoration: 'none',
          fontWeight: 'bold',
          fontSize: '18px',
          marginRight: '18px',
        }}
      >
        🌳 Bur Oaks Portal
      </a>

      <a href="/" style={link}>Home</a>
      <a href="/invoices" style={link}>Invoices</a>
      <a href="/electric" style={link}>Electric</a>
      <a href="/documents" style={link}>Documents</a>
      <a href="/calendar" style={link}>Events</a>
      <a href="/admin" style={link}>Admin</a>
    </nav>
  )
}

const link = {
  color: 'white',
  textDecoration: 'none',
  fontWeight: 'bold',
  fontSize: '15px',
} as React.CSSProperties