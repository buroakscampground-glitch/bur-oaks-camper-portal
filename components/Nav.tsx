import Link from 'next/link'

const links = [
  ['Dashboard', '/'],
  ['Electric', '/electric'],
  ['Invoices', '/invoices'],
  ['Documents', '/documents'],
  ['Calendar', '/calendar'],
  ['Admin', '/admin'],
]

export default function Nav() {
  return (
    <nav className="bg-white border-b">
      <div className="mx-auto max-w-6xl px-6 py-4 flex flex-wrap gap-4">
        <div className="font-bold mr-6">Bur Oaks Portal</div>
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="text-sm font-medium text-slate-700 hover:text-slate-950">
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
