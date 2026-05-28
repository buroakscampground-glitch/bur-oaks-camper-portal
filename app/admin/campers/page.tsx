import { supabase } from '@/lib/supabase'

export default async function AdminCampersPage() {
  const { data: campers, error } = await supabase
    .from('campers')
    .select('*')
    .order('lot_number', { ascending: true })

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <h1 className="text-3xl font-bold">Manage Campers</h1>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-red-700">
          Could not load campers. Check your Supabase keys in .env.local.
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Lot</th>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
            </tr>
          </thead>
          <tbody>
            {campers?.map((camper) => (
              <tr key={camper.id} className="border-t">
                <td className="p-3">{camper.lot_number}</td>
                <td className="p-3">{camper.first_name} {camper.last_name}</td>
                <td className="p-3">{camper.email}</td>
                <td className="p-3">{camper.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
