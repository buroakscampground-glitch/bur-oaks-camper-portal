export default function Card({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm border">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{note}</p>
    </section>
  )
}
